import { slugToCompanyName } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson, formatIntegerToK } from '../../../../src/lib/salary.ts';
import { extractWithGemini } from '../ai/geminiExtractor.ts';
import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { AtsProvider, AtsProviderOptions, AtsProviderResult } from './base.provider.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { fetchPublicUrl } from '../utils/safeFetch.ts';
import { cleanHtmlDescription } from '../utils/schemaOrgNormalizer.ts';
import { tryFastPathNormalize } from '../utils/fastPathNormalizer.ts';

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
    const fastPath = tryFastPathNormalize({
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
    });

    if (fastPath) {
      diagnosticSteps.push({
        tier: 'Tier 1.5 (Fast-Path Normalizer)',
        name: 'Strict Fast-Path Normalizer',
        status: 'success',
        details: 'Structured ATS data satisfied high-confidence threshold. Extracted deterministically with 0 AI quota consumed.',
      });
      return {
        extractedData: fastPath,
        tierUsed: 'ATS API (Pinpoint • Fast-Path)',
      };
    }

    if (options?.checkAiQuota && !(await options.checkAiQuota())) {
      diagnosticSteps.push({
        tier: 'Tier 3 (AI Quota Check)',
        name: 'Daily AI Extraction Quota Limit',
        status: 'skipped',
        details: 'Daily AI extraction quota reached. Skipping Gemini normalization.',
      });
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

      const fallbackData: ExtractedJobAttributes = {
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
          department: (typeof data.department === 'object' ? data.department?.name : data.department) || 'Unknown',
          employmentType: data.employment_type || 'Full-time',
          requiredSkills: [],
        },
      };

      return {
        extractedData: fallbackData,
        tierUsed: 'Direct ATS API (Pinpoint)',
      };
    }

    const geminiStart = Date.now();
    diagnosticSteps.push({
      tier: 'Tier 3 (Gemini Normalization)',
      name: 'Synthesize & Enrich ATS Payload',
      status: 'pending',
    });

    try {
      const structured = await extractWithGemini({
        url,
        sourceType: 'PINPOINT REST API',
        rawContent: JSON.stringify(data),
        companyHint,
        jobTitleHint: titleHint,
      });

      diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Normalized attributes for ${structured.company} - ${structured.jobTitle}`;

      return {
        extractedData: structured,
        tierUsed: 'ATS API (Pinpoint)',
      };
    } catch (geminiErr: any) {
      diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Gemini call failed (${geminiErr.message}). Using direct ATS parsed fields.`;

      const fallbackCompany = companyHint;
      const fallbackTitle = data.title || titleHint || 'Job Opening';
      const fallbackLocation = this.formatLocation(data);
      const parsedSalary = this.parseSalary(data);

      let fallbackSummary = '';
      if (data.description) {
        const cleanDesc = cleanHtmlDescription(data.description).replace(/\s+/g, ' ').trim();
        fallbackSummary = cleanDesc.length > 450 ? cleanDesc.slice(0, 450) + '...' : cleanDesc;
      } else {
        fallbackSummary = `${fallbackCompany} is recruiting for the role of ${fallbackTitle}. Direct position fetched via the official Pinpoint job posting API.`;
      }

      const isSr = /\b(sr|senior|lead|principal|staff|director|head|vp|manager)\b/i.test(fallbackTitle);

      const deptName = typeof data.department === 'string' ? data.department : data.department?.name || 'Unknown';

      const fallbackData: ExtractedJobAttributes = {
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

      return {
        extractedData: fallbackData,
        tierUsed: 'Direct ATS API (Pinpoint)',
      };
    }
  }
}
