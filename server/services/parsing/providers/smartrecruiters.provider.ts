import { slugToCompanyName } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson, formatIntegerToK } from '../../../../src/lib/salary.ts';
import { extractWithGemini } from '../ai/geminiExtractor.ts';
import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { AtsProvider, AtsProviderResult } from './base.provider.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { fetchPublicUrl } from '../utils/safeFetch.ts';
import { cleanHtmlDescription } from '../utils/schemaOrgNormalizer.ts';

export interface SmartRecruitersPosting {
  id?: string;
  name?: string;
  company?: {
    name?: string;
    identifier?: string;
  };
  location?: {
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
    remote?: boolean;
  };
  department?: {
    id?: string;
    label?: string;
  };
  typeOfEmployment?: {
    id?: string;
    label?: string;
  };
  experienceLevel?: {
    id?: string;
    label?: string;
  };
  compensation?: {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
  };
  jobAd?: {
    sections?: {
      companyDescription?: { title?: string; text?: string };
      jobDescription?: { title?: string; text?: string };
      qualifications?: { title?: string; text?: string };
      additionalInformation?: { title?: string; text?: string };
    };
  };
}

export class SmartRecruitersProvider implements AtsProvider {
  readonly name = 'SmartRecruiters';

  canHandle(url: string, atsInfo?: { type: string | null; board?: string; jobId?: string }): boolean {
    return atsInfo?.type === 'smartrecruiters' && !!atsInfo.board && !!atsInfo.jobId;
  }

  private async fetchApi(board: string, jobId: string): Promise<SmartRecruitersPosting> {
    const apiUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings/${encodeURIComponent(jobId)}`;
    const response = await fetchPublicUrl(apiUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JobApplicationTracker/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`SmartRecruiters API responded with HTTP ${response.status}`);
    }

    return await response.json();
  }

  private parseSalary(posting: SmartRecruitersPosting, fullText: string): {
    salary: string;
    salaryMin: number | null;
    salaryMax: number | null;
  } {
    if (posting.compensation && (posting.compensation.min != null || posting.compensation.max != null)) {
      const min = Math.round(Number(posting.compensation.min ?? posting.compensation.max));
      const max = Math.round(Number(posting.compensation.max ?? posting.compensation.min));
      if (!Number.isNaN(min) && !Number.isNaN(max) && (min > 0 || max > 0)) {
        return {
          salary: min === max ? formatIntegerToK(min) : `${formatIntegerToK(min)} - ${formatIntegerToK(max)}`,
          salaryMin: min,
          salaryMax: max,
        };
      }
    }

    return extractSalaryFromTextOrJson(fullText);
  }

  private formatLocation(posting: SmartRecruitersPosting): string {
    const loc = posting.location;
    if (!loc) return 'Remote (US)';

    const parts = [loc.city, loc.region, loc.country].filter(Boolean);
    let str = parts.join(', ');
    if (loc.remote) {
      str = str ? `${str} (Remote)` : 'Remote';
    }
    return str || 'Remote (US)';
  }

  async extract(
    url: string,
    atsInfo: { type: string | null; board?: string; jobId?: string },
    diagnosticSteps: DiagnosticStep[]
  ): Promise<AtsProviderResult> {
    const board = atsInfo.board!;
    const jobId = atsInfo.jobId!;
    const start = Date.now();

    diagnosticSteps.push({
      tier: 'Tier 1 (ATS REST API)',
      name: 'Tier 1: SmartRecruiters REST API',
      status: 'pending',
    });

    const atsPayload = await this.fetchApi(board, jobId);
    const titleHint = atsPayload.name || '';
    const companyHint = atsPayload.company?.name || slugToCompanyName(board);

    diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
    diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
    diagnosticSteps[diagnosticSteps.length - 1].details =
      'Successfully fetched structured JSON from SMARTRECRUITERS API endpoint';

    const geminiStart = Date.now();
    diagnosticSteps.push({
      tier: 'Tier 3 (Gemini Normalization)',
      name: 'Synthesize & Enrich ATS Payload',
      status: 'pending',
    });

    try {
      const structured = await extractWithGemini({
        url,
        sourceType: 'SMARTRECRUITERS REST API',
        rawContent: JSON.stringify(atsPayload),
        companyHint,
        jobTitleHint: titleHint,
      });

      diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Normalized attributes for ${structured.company} - ${structured.jobTitle}`;

      return {
        extractedData: structured,
        tierUsed: 'ATS API (SmartRecruiters)',
      };
    } catch (geminiErr: any) {
      diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Gemini call failed (${geminiErr.message}). Using direct ATS parsed fields.`;

      const fallbackCompany = companyHint;
      const fallbackTitle = atsPayload.name || titleHint || 'Job Opening';
      const fallbackLocation = this.formatLocation(atsPayload);

      const sections = atsPayload.jobAd?.sections || {};
      const fullText = [
        sections.jobDescription?.text,
        sections.qualifications?.text,
        sections.additionalInformation?.text,
      ]
        .filter(Boolean)
        .join('\n');

      const parsedSalary = this.parseSalary(atsPayload, fullText);

      let fallbackSummary = '';
      if (sections.jobDescription?.text) {
        const cleanDesc = cleanHtmlDescription(sections.jobDescription.text).replace(/\s+/g, ' ').trim();
        fallbackSummary = cleanDesc.length > 450 ? cleanDesc.slice(0, 450) + '...' : cleanDesc;
      } else {
        fallbackSummary = `${fallbackCompany} is recruiting for the role of ${fallbackTitle}. Direct position fetched via the official SmartRecruiters job posting API.`;
      }

      const isSr =
        /\b(sr|senior|lead|principal|staff|director|head|vp|manager)\b/i.test(fallbackTitle) ||
        /senior|lead|director/i.test(atsPayload.experienceLevel?.label || '');

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
          department: atsPayload.department?.label || 'Unknown',
          employmentType: atsPayload.typeOfEmployment?.label || 'Full-time',
          requiredSkills: [],
        },
      };

      return {
        extractedData: fallbackData,
        tierUsed: 'Direct ATS API (SmartRecruiters)',
      };
    }
  }
}
