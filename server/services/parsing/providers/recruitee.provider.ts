import { slugToCompanyName } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson, formatIntegerToK } from '../../../../src/lib/salary.ts';
import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { AtsProvider, AtsProviderOptions, AtsProviderResult, finishAtsExtraction } from './base.provider.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { fetchPublicUrl } from '../utils/safeFetch.ts';
import { cleanHtmlDescription } from '../utils/schemaOrgNormalizer.ts';

export interface RecruiteeOffer {
  id?: number | string;
  title?: string;
  company_name?: string;
  location?: string;
  city?: string;
  country?: string;
  country_code?: string;
  remote?: boolean;
  hybrid?: boolean;
  description?: string;
  requirements?: string;
  min_salary?: number | null;
  max_salary?: number | null;
  currency?: string | null;
  department?: string;
  employment_type_code?: string;
}

export class RecruiteeProvider implements AtsProvider {
  readonly name = 'Recruitee';

  canHandle(url: string, atsInfo?: { type: string | null; board?: string; jobId?: string }): boolean {
    return atsInfo?.type === 'recruitee' && !!atsInfo.board && !!atsInfo.jobId;
  }

  private async fetchApi(board: string, jobId: string): Promise<RecruiteeOffer> {
    const apiUrl = `https://${encodeURIComponent(board)}.recruitee.com/api/offers/${encodeURIComponent(jobId)}`;
    const response = await fetchPublicUrl(apiUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JobApplicationTracker/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Recruitee API responded with HTTP ${response.status}`);
    }

    const data = await response.json();
    return (data?.offer || data) as RecruiteeOffer;
  }

  private parseSalary(offer: RecruiteeOffer): {
    salary: string;
    salaryMin: number | null;
    salaryMax: number | null;
  } {
    if (offer.min_salary != null || offer.max_salary != null) {
      const min = Math.round(Number(offer.min_salary ?? offer.max_salary));
      const max = Math.round(Number(offer.max_salary ?? offer.min_salary));
      if (!Number.isNaN(min) && !Number.isNaN(max) && (min > 0 || max > 0)) {
        return {
          salary: min === max ? formatIntegerToK(min) : `${formatIntegerToK(min)} - ${formatIntegerToK(max)}`,
          salaryMin: min,
          salaryMax: max,
        };
      }
    }

    const textToSearch = [offer.description, offer.requirements].filter(Boolean).join('\n');
    return extractSalaryFromTextOrJson(textToSearch);
  }

  private formatLocation(offer: RecruiteeOffer): string {
    const parts = [offer.city, offer.country].filter(Boolean);
    let str = offer.location || parts.join(', ');
    if (offer.remote) {
      str = str ? `${str} (Remote)` : 'Remote';
    } else if (offer.hybrid) {
      str = str ? `${str} (Hybrid)` : 'Hybrid';
    }
    return str || 'Remote (US)';
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
      name: 'Tier 1: Recruitee REST API',
      status: 'pending',
    });

    const offer = await this.fetchApi(board, jobId);
    const titleHint = offer.title || '';
    const companyHint = offer.company_name || slugToCompanyName(board);

    diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
    diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
    diagnosticSteps[diagnosticSteps.length - 1].details =
      'Successfully fetched structured JSON from RECRUITEE API endpoint';

    // Fast-Path Normalizer (Tier 1.5)
    const fullText = [offer.description, offer.requirements].filter(Boolean).join('\n');
    const parsedSalary = this.parseSalary(offer);

    const buildFallback = (): ExtractedJobAttributes => {
      const fallbackCompany = companyHint;
      const fallbackTitle = offer.title || titleHint || 'Job Opening';
      const fallbackLocation = this.formatLocation(offer);

      let fallbackSummary = '';
      if (offer.description) {
        const cleanDesc = cleanHtmlDescription(offer.description).replace(/\s+/g, ' ').trim();
        fallbackSummary = cleanDesc.length > 450 ? cleanDesc.slice(0, 450) + '...' : cleanDesc;
      } else {
        fallbackSummary = `${fallbackCompany} is recruiting for the role of ${fallbackTitle}. Direct position fetched via the official Recruitee job posting API.`;
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
          department: offer.department || 'Unknown',
          employmentType: offer.employment_type_code || 'Full-time',
          requiredSkills: [],
        },
      };
    };

    return finishAtsExtraction({
      diagnosticSteps,
      options,
      fastPathInput: {
        company: companyHint,
        jobTitle: offer.title || titleHint,
        location: this.formatLocation(offer),
        descriptionHtml: fullText,
        department: offer.department,
        employmentType: offer.employment_type_code,
        salary: parsedSalary.salary !== 'Not listed' ? parsedSalary.salary : undefined,
        salaryMin: parsedSalary.salaryMin,
        salaryMax: parsedSalary.salaryMax,
        rawPayload: offer,
      },
      buildGeminiInput: () => ({
        url,
        sourceType: 'RECRUITEE REST API',
        rawContent: JSON.stringify(offer),
        companyHint,
        jobTitleHint: titleHint,
      }),
      buildFallback,
      tierNames: {
        fastPath: 'ATS API (Recruitee • Fast-Path)',
        gemini: 'ATS API (Recruitee)',
        direct: 'Direct ATS API (Recruitee)',
      },
      recordDurationOnFailure: true,
    });
  }
}
