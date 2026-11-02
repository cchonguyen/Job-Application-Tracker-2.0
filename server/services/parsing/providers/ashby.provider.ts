import { slugToCompanyName } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson, formatIntegerToK } from '../../../../src/lib/salary.ts';
import { extractWithGemini } from '../ai/geminiExtractor.ts';
import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { AtsProvider, AtsProviderResult } from './base.provider.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { fetchPublicUrl } from '../utils/safeFetch.ts';

interface AshbyCompensationComponent {
  compensationType?: string;
  interval?: string;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
}

export interface AshbyPosting {
  id: string;
  title?: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  department?: string;
  team?: string;
  isRemote?: boolean;
  workplaceType?: string;
  employmentType?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  jobUrl?: string;
  compensation?: {
    compensationTierSummary?: string | null;
    scrapeableCompensationSalarySummary?: string | null;
    summaryComponents?: AshbyCompensationComponent[];
  };
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FullTime: 'Full-time',
  PartTime: 'Part-time',
  Intern: 'Internship',
  Contract: 'Contract',
  Temporary: 'Temporary',
};

export class AshbyProvider implements AtsProvider {
  readonly name = 'Ashby';

  canHandle(url: string, atsInfo?: { type: string | null; board?: string; jobId?: string }): boolean {
    return atsInfo?.type === 'ashby' && !!atsInfo.board && !!atsInfo.jobId;
  }

  /**
   * Ashby's public posting API only exposes the whole job board, so we fetch the
   * board and pick the posting by id. Unlisted postings are absent from the board;
   * the thrown error sends the engine on to the Tier 2 HTML scraper.
   */
  private async fetchApi(board: string, jobId: string): Promise<AshbyPosting> {
    const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
    const response = await fetchPublicUrl(apiUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JobApplicationTracker/1.0',
      },
    });
    if (!response.ok) {
      throw new Error(`Ashby API responded with HTTP ${response.status}`);
    }
    const data = await response.json();
    const jobs: AshbyPosting[] = Array.isArray(data?.jobs) ? data.jobs : [];
    const posting = jobs.find((j) => j.id?.toLowerCase() === jobId.toLowerCase());
    if (!posting) {
      throw new Error(`Ashby API: job ${jobId} not listed on the ${board} job board`);
    }
    return posting;
  }

  private parseSalary(posting: AshbyPosting): { salary: string; salaryMin: number | null; salaryMax: number | null } {
    const salaryComponent = posting.compensation?.summaryComponents?.find(
      (c) => c.compensationType === 'Salary' && (c.minValue || c.maxValue)
    );
    if (salaryComponent) {
      const min = Math.round(Number(salaryComponent.minValue ?? salaryComponent.maxValue));
      const max = Math.round(Number(salaryComponent.maxValue ?? salaryComponent.minValue));
      return {
        salary: min === max ? formatIntegerToK(min) : `${formatIntegerToK(min)} - ${formatIntegerToK(max)}`,
        salaryMin: min,
        salaryMax: max,
      };
    }
    return extractSalaryFromTextOrJson(
      [posting.compensation?.scrapeableCompensationSalarySummary, posting.descriptionPlain].filter(Boolean).join('\n')
    );
  }

  private formatLocation(posting: AshbyPosting): string {
    const locations = [posting.location, ...(posting.secondaryLocations || []).map((l) => l.location)].filter(
      (l): l is string => !!l
    );
    const base = locations.join(' / ');
    if (posting.workplaceType === 'Remote' || posting.isRemote) {
      return base && !/remote/i.test(base) ? `Remote (${base})` : base || 'Remote';
    }
    if (posting.workplaceType === 'Hybrid' && base) return `${base} (Hybrid)`;
    return base || 'Not listed';
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
      name: 'Tier 1: Ashby Public Posting API',
      status: 'pending',
    });

    const posting = await this.fetchApi(board, jobId);
    const companyHint = slugToCompanyName(board);
    const titleHint = posting.title || '';

    diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
    diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
    diagnosticSteps[diagnosticSteps.length - 1].details = `Successfully fetched structured JSON from ASHBY API endpoint`;

    const geminiStart = Date.now();
    diagnosticSteps.push({
      tier: 'Tier 3 (Gemini Normalization)',
      name: 'Synthesize & Enrich ATS Payload',
      status: 'pending',
    });

    try {
      // descriptionHtml duplicates descriptionPlain; drop it to keep the prompt within budget.
      const { descriptionHtml: _html, ...payload } = posting;
      const structured = await extractWithGemini({
        url,
        sourceType: 'ASHBY REST API',
        rawContent: JSON.stringify(payload),
        companyHint,
        jobTitleHint: titleHint,
      });

      diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Normalized attributes for ${structured.company} - ${structured.jobTitle}`;

      return {
        extractedData: structured,
        tierUsed: 'ATS API (Ashby)',
      };
    } catch (geminiErr: any) {
      diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
      diagnosticSteps[diagnosticSteps.length - 1].details = `Gemini call failed (${geminiErr.message}). Using direct ATS parsed fields.`;

      const fallbackTitle = posting.title || 'Software Engineer';
      const parsedSalary = this.parseSalary(posting);
      const description = (posting.descriptionPlain || '').replace(/\s+/g, ' ').trim();
      const isSr = /\b(sr|senior|lead|principal|director|head|staff|vp)\b/i.test(fallbackTitle);

      const fallbackData: ExtractedJobAttributes = {
        company: companyHint,
        jobTitle: fallbackTitle,
        team: posting.team && posting.team !== posting.department ? posting.team : undefined,
        location: this.formatLocation(posting),
        salary: parsedSalary.salary !== 'Not listed' ? parsedSalary.salary : 'Not listed (ATS API)',
        salaryMin: parsedSalary.salaryMin,
        salaryMax: parsedSalary.salaryMax,
        industry: 'Unknown',
        summary: description
          ? description.slice(0, 450) + (description.length > 450 ? '...' : '')
          : `${companyHint} is recruiting for the role of ${fallbackTitle}. Direct position fetched via the official Ashby job posting API.`,
        companyMetadata: { ...UNKNOWN_COMPANY_METADATA },
        positionMetadata: {
          seniority: isSr ? 'Senior' : 'Mid-level',
          department: posting.department || 'Unknown',
          employmentType: EMPLOYMENT_TYPE_LABELS[posting.employmentType || ''] || 'Unknown',
          requiredSkills: [],
        },
      };

      return {
        extractedData: fallbackData,
        tierUsed: 'Direct ATS API (Ashby)',
      };
    }
  }
}
