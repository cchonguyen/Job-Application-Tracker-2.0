import { slugToCompanyName } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson } from '../../../../src/lib/salary.ts';
import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { AtsProvider, AtsProviderOptions, AtsProviderResult, finishAtsExtraction } from './base.provider.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { fetchPublicUrl } from '../utils/safeFetch.ts';
import { cleanHtmlDescription } from '../utils/schemaOrgNormalizer.ts';

export interface BambooHrJobOpening {
  id?: string | number;
  jobOpeningName?: string;
  departmentLabel?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
    address?: string;
  } | string;
  employmentStatusLabel?: string;
  description?: string;
  compensation?: string | {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
    type?: string | null;
  };
  minimumExperience?: string;
}

export class BambooHrProvider implements AtsProvider {
  readonly name = 'BambooHR';

  canHandle(url: string, atsInfo?: { type: string | null; board?: string; jobId?: string }): boolean {
    return atsInfo?.type === 'bamboohr' && !!atsInfo.board && !!atsInfo.jobId;
  }

  private async fetchApi(board: string, jobId: string): Promise<BambooHrJobOpening> {
    const apiUrl = `https://${encodeURIComponent(board)}.bamboohr.com/careers/${encodeURIComponent(jobId)}/detail`;
    const response = await fetchPublicUrl(apiUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JobApplicationTracker/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`BambooHR API responded with HTTP ${response.status}`);
    }

    const json = await response.json();
    return (json?.result?.jobOpening || json?.jobOpening || json?.result || json) as BambooHrJobOpening;
  }

  private parseSalary(opening: BambooHrJobOpening): {
    salary: string;
    salaryMin: number | null;
    salaryMax: number | null;
  } {
    if (opening.compensation) {
      const compStr = typeof opening.compensation === 'string'
        ? opening.compensation
        : JSON.stringify(opening.compensation);
      const parsed = extractSalaryFromTextOrJson(compStr);
      if (parsed.salary !== 'Not listed') {
        return parsed;
      }
    }

    return extractSalaryFromTextOrJson(opening.description || '');
  }

  private formatLocation(opening: BambooHrJobOpening): string {
    const loc = opening.location;
    if (!loc) return 'Remote (US)';
    if (typeof loc === 'string') return loc;

    const parts = [loc.city, loc.state, loc.country].filter(Boolean);
    return parts.join(', ') || 'Remote (US)';
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
      name: 'Tier 1: BambooHR REST API',
      status: 'pending',
    });

    const opening = await this.fetchApi(board, jobId);
    const titleHint = opening.jobOpeningName || '';
    const companyHint = slugToCompanyName(board);

    diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
    diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
    diagnosticSteps[diagnosticSteps.length - 1].details =
      'Successfully fetched structured JSON from BAMBOOHR API endpoint';

    // Fast-Path Normalizer (Tier 1.5)
    const parsedSalary = this.parseSalary(opening);

    const buildFallback = (): ExtractedJobAttributes => {
      const fallbackCompany = companyHint;
      const fallbackTitle = opening.jobOpeningName || titleHint || 'Job Opening';
      const fallbackLocation = this.formatLocation(opening);

      let fallbackSummary = '';
      if (opening.description) {
        const cleanDesc = cleanHtmlDescription(opening.description).replace(/\s+/g, ' ').trim();
        fallbackSummary = cleanDesc.length > 450 ? cleanDesc.slice(0, 450) + '...' : cleanDesc;
      } else {
        fallbackSummary = `${fallbackCompany} is recruiting for the role of ${fallbackTitle}. Direct position fetched via the official BambooHR job posting API.`;
      }

      const isSr = /\b(sr|senior|lead|principal|staff|director|head|vp|manager)\b/i.test(fallbackTitle);

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
          department: opening.departmentLabel || 'Unknown',
          employmentType: opening.employmentStatusLabel || 'Full-time',
          requiredSkills: [],
        },
      };
    };

    return finishAtsExtraction({
      diagnosticSteps,
      options,
      fastPathInput: {
        company: companyHint,
        jobTitle: opening.jobOpeningName || titleHint,
        location: this.formatLocation(opening),
        descriptionHtml: opening.description,
        department: opening.departmentLabel,
        employmentType: opening.employmentStatusLabel,
        salary: parsedSalary.salary !== 'Not listed' ? parsedSalary.salary : undefined,
        salaryMin: parsedSalary.salaryMin,
        salaryMax: parsedSalary.salaryMax,
        rawPayload: opening,
      },
      buildGeminiInput: () => ({
        url,
        sourceType: 'BAMBOOHR REST API',
        rawContent: JSON.stringify(opening),
        companyHint,
        jobTitleHint: titleHint,
      }),
      buildFallback,
      tierNames: {
        fastPath: 'ATS API (BambooHR • Fast-Path)',
        gemini: 'ATS API (BambooHR)',
        direct: 'Direct ATS API (BambooHR)',
      },
      recordDurationOnFailure: true,
    });
  }
}
