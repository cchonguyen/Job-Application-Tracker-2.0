import { slugToCompanyName } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson } from '../../../../src/lib/salary.ts';
import { extractWithGemini } from '../ai/geminiExtractor.ts';
import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { AtsProvider, AtsProviderResult } from './base.provider.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { fetchPublicUrl } from '../utils/safeFetch.ts';
import { cleanHtmlDescription } from '../utils/schemaOrgNormalizer.ts';

export interface WorkdayJobPostingInfo {
  title?: string;
  jobDescription?: string;
  location?: string;
  additionalLocations?: string[];
  timeType?: string;
  jobReqId?: string;
  startDate?: string;
  postedOn?: string;
  externalPath?: string;
}

export interface WorkdayApiResponse {
  jobPostingInfo?: WorkdayJobPostingInfo;
  userAuthenticated?: boolean;
}

export class WorkdayProvider implements AtsProvider {
  readonly name = 'Workday';

  canHandle(url: string, atsInfo?: { type: string | null; board?: string; site?: string; jobId?: string; [key: string]: any }): boolean {
    return atsInfo?.type === 'workday' && !!atsInfo.board && !!atsInfo.site && !!atsInfo.jobId;
  }

  private async fetchApi(board: string, datacenter: string, site: string, jobId: string): Promise<WorkdayJobPostingInfo> {
    const dc = datacenter || 'wd1';
    const apiUrl = `https://${encodeURIComponent(board)}.${encodeURIComponent(dc)}.myworkdayjobs.com/wday/cxs/${encodeURIComponent(board)}/${encodeURIComponent(site)}/job/${encodeURIComponent(jobId)}`;

    const response = await fetchPublicUrl(apiUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JobApplicationTracker/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Workday CXS API responded with HTTP ${response.status}`);
    }

    const json = (await response.json()) as WorkdayApiResponse;
    if (!json?.jobPostingInfo) {
      throw new Error('Workday CXS API returned payload missing jobPostingInfo');
    }

    return json.jobPostingInfo;
  }

  private formatLocation(info: WorkdayJobPostingInfo): string {
    const locations = [info.location, ...(info.additionalLocations || [])].filter(Boolean);
    return locations.join(', ') || 'Remote (US)';
  }

  async extract(
    url: string,
    atsInfo: { type: string | null; board?: string; site?: string; jobId?: string; datacenter?: string; [key: string]: any },
    diagnosticSteps: DiagnosticStep[]
  ): Promise<AtsProviderResult> {
    const board = atsInfo.board!;
    const site = atsInfo.site!;
    const jobId = atsInfo.jobId!;
    const datacenter = atsInfo.datacenter || 'wd1';
    const start = Date.now();

    diagnosticSteps.push({
      tier: 'Tier 1 (ATS REST API)',
      name: 'Tier 1: Workday CXS API',
      status: 'pending',
    });

    const info = await this.fetchApi(board, datacenter, site, jobId);
    const titleHint = info.title || '';
    const companyHint = slugToCompanyName(board);

    diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
    diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
    diagnosticSteps[diagnosticSteps.length - 1].details =
      'Successfully fetched structured JSON from WORKDAY CXS API endpoint';

    const geminiStart = Date.now();
    diagnosticSteps.push({
      tier: 'Tier 3 (Gemini Normalization)',
      name: 'Synthesize & Enrich ATS Payload',
      status: 'pending',
    });

    try {
      const structured = await extractWithGemini({
        url,
        sourceType: 'WORKDAY CXS API',
        rawContent: JSON.stringify(info),
        companyHint,
        jobTitleHint: titleHint,
      });

      diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Normalized attributes for ${structured.company} - ${structured.jobTitle}`;

      return {
        extractedData: structured,
        tierUsed: 'ATS API (Workday)',
      };
    } catch (geminiErr: any) {
      diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Gemini call failed (${geminiErr.message}). Using direct ATS parsed fields.`;

      const fallbackCompany = companyHint;
      const fallbackTitle = info.title || titleHint || 'Job Opening';
      const fallbackLocation = this.formatLocation(info);
      const parsedSalary = extractSalaryFromTextOrJson(info.jobDescription || '');

      let fallbackSummary = '';
      if (info.jobDescription) {
        const cleanDesc = cleanHtmlDescription(info.jobDescription).replace(/\s+/g, ' ').trim();
        fallbackSummary = cleanDesc.length > 450 ? cleanDesc.slice(0, 450) + '...' : cleanDesc;
      } else {
        fallbackSummary = `${fallbackCompany} is recruiting for the role of ${fallbackTitle}. Direct position fetched via the official Workday CXS API.`;
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
          department: 'Unknown',
          employmentType: info.timeType || 'Full-time',
          requiredSkills: [],
        },
      };

      return {
        extractedData: fallbackData,
        tierUsed: 'Direct ATS API (Workday)',
      };
    }
  }
}
