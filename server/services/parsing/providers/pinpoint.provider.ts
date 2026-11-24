import { slugToCompanyName } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson, formatIntegerToK } from '../../../../src/lib/salary.ts';
import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { AtsProvider, AtsProviderOptions, AtsProviderResult, finishAtsExtraction } from './base.provider.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { fetchPublicUrl } from '../utils/safeFetch.ts';
import { cleanHtmlDescription } from '../utils/schemaOrgNormalizer.ts';

export interface PinpointPostingData {
  id?: string | number;
  title?: string;
  description?: string;
  location?: {
    name?: string;
    city?: string;
    country?: string;
  } | string;
  workplace_type?: string; // 'remote' | 'hybrid' | 'onsite'
  compensation_minimum?: number | null;
  compensation_maximum?: number | null;
  currency?: string | null;
  department?: {
    name?: string;
  } | string;
  employment_type?: string;
  company?: {
    name?: string;
  };
}

export class PinpointProvider implements AtsProvider {
  readonly name = 'Pinpoint';

  canHandle(url: string, atsInfo?: { type: string | null; board?: string; jobId?: string }): boolean {
    return atsInfo?.type === 'pinpoint' && !!atsInfo.board && !!atsInfo.jobId;
  }

  private async fetchApi(board: string, jobId: string): Promise<PinpointPostingData> {
    const apiUrl = `https://${encodeURIComponent(board)}.pinpointhq.com/postings/${encodeURIComponent(jobId)}.json`;
    const response = await fetchPublicUrl(apiUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JobApplicationTracker/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Pinpoint API responded with HTTP ${response.status}`);
    }

    const json = await response.json();
    return (json?.data || json) as PinpointPostingData;
  }

  private parseSalary(data: PinpointPostingData): {
    salary: string;
    salaryMin: number | null;
    salaryMax: number | null;
  } {
    if (data.compensation_minimum != null || data.compensation_maximum != null) {
      const min = Math.round(Number(data.compensation_minimum ?? data.compensation_maximum));
      const max = Math.round(Number(data.compensation_maximum ?? data.compensation_minimum));
      if (!Number.isNaN(min) && !Number.isNaN(max) && (min > 0 || max > 0)) {
        return {
          salary: min === max ? formatIntegerToK(min) : `${formatIntegerToK(min)} - ${formatIntegerToK(max)}`,
          salaryMin: min,
          salaryMax: max,
        };
      }
    }

    return extractSalaryFromTextOrJson(data.description || '');
  }

  private formatLocation(data: PinpointPostingData): string {
    let locStr = typeof data.location === 'string' ? data.location : data.location?.name || '';
    if (data.workplace_type === 'remote') {
      locStr = locStr ? `${locStr} (Remote)` : 'Remote';
    } else if (data.workplace_type === 'hybrid') {
      locStr = locStr ? `${locStr} (Hybrid)` : 'Hybrid';
    }
    return locStr || 'Remote (US)';
  }

  async extract(
    url: string,
    atsInfo: { type: string | null; board?: string; jobId?: string },
    diagnosticSteps: DiagnosticStep[],
    options?: AtsProviderOptions
  ): Promise<AtsProviderResult> {
    const board = atsInfo.board!;
    const jobId = atsInfo.jobId!;
    const start = Date.now();

    diagnosticSteps.push({
      tier: 'Tier 1 (ATS REST API)',
      name: 'Tier 1: Pinpoint REST API',
      status: 'pending',
    });

    const data = await this.fetchApi(board, jobId);
    const titleHint = data.title || '';
    const companyHint = data.company?.name || slugToCompanyName(board);

    diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
    diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
    diagnosticSteps[diagnosticSteps.length - 1].details =
      'Successfully fetched structured JSON from PINPOINT API endpoint';

    // Fast-Path Normalizer (Tier 1.5)
    const parsedSalary = this.parseSalary(data);
    const departmentName = typeof data.department === 'object' ? data.department?.name : data.department;

    const buildFallback = (afterGeminiFailure: boolean): ExtractedJobAttributes => {
      const fallbackCompany = companyHint;
      const fallbackTitle = data.title || titleHint || 'Job Opening';
      const fallbackLocation = this.formatLocation(data);

      let fallbackSummary = '';
      if (data.description) {
        const cleanDesc = cleanHtmlDescription(data.description).replace(/\s+/g, ' ').trim();
        fallbackSummary = cleanDesc.length > 450 ? cleanDesc.slice(0, 450) + '...' : cleanDesc;
      } else {
        fallbackSummary = `${fallbackCompany} is recruiting for the role of ${fallbackTitle}. Direct position fetched via the official Pinpoint job posting API.`;
      }

      const isSr = /\b(sr|senior|lead|principal|staff|director|head|vp|manager)\b/i.test(fallbackTitle);

      // The two paths differ on an empty-string department: the quota path yields 'Unknown',
      // the Gemini-failure path yields ''. Kept as-is.
      const deptName = afterGeminiFailure
        ? typeof data.department === 'string' ? data.department : data.department?.name || 'Unknown'
        : (typeof data.department === 'object' ? data.department?.name : data.department) || 'Unknown';

      return {
        company: fallbackCompany,
        jobTitle: fallbackTitle,
        location: fallbackLocation,
        salary: parsedSalary.salary !== 'Not listed' ? parsedSalary.salary : 'Not listed (ATS API)',
        salaryMin: parsedSalary.salaryMin,
        salaryMax: parsedSalary.salaryMax,
        industry: 'Unknown',
        summary: fallbackSummary,
        companyMetadata: { ...UNKNOWN_COMPANY_METADATA },
        positionMetadata: {
          seniority: isSr ? 'Senior' : 'Mid-level',
          department: deptName,
          employmentType: data.employment_type || 'Full-time',
          requiredSkills: [],
        },
      };
    };

    return finishAtsExtraction({
      diagnosticSteps,
      options,
      fastPathInput: {
        company: companyHint,
        jobTitle: data.title || titleHint,
        location: this.formatLocation(data),
        descriptionHtml: data.description,
        department: departmentName,
        employmentType: data.employment_type,
        salary: parsedSalary.salary !== 'Not listed' ? parsedSalary.salary : undefined,
        salaryMin: parsedSalary.salaryMin,
        salaryMax: parsedSalary.salaryMax,
        rawPayload: data,
      },
      buildGeminiInput: () => ({
        url,
        sourceType: 'PINPOINT REST API',
        rawContent: JSON.stringify(data),
        companyHint,
        jobTitleHint: titleHint,
      }),
      buildFallback,
      tierNames: {
        fastPath: 'ATS API (Pinpoint • Fast-Path)',
        gemini: 'ATS API (Pinpoint)',
        direct: 'Direct ATS API (Pinpoint)',
      },
      recordDurationOnFailure: true,
    });
  }
}
