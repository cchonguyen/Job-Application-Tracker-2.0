import * as cheerio from 'cheerio';
import { deriveCompanyFromTitle, slugToCompanyName } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson, formatIntegerToK } from '../../../../src/lib/salary.ts';
import { extractWithGemini } from '../ai/geminiExtractor.ts';
import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { AtsProvider, AtsProviderResult } from './base.provider.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { fetchPublicUrl, readResponseTextUpTo } from '../utils/safeFetch.ts';
import { cleanHtmlDescription, decodeHtmlEntities } from '../utils/schemaOrgNormalizer.ts';

interface WorkablePosting {
  title?: string;
  company?: string;
  location?: string;
  workplace?: string;
  department?: string;
  postedOn?: string;
  content: string;
  sourceUrl: string;
  isApiV3?: boolean;
}

export class WorkableProvider implements AtsProvider {
  readonly name = 'Workable';

  canHandle(url: string, atsInfo?: { type: string; board?: string; jobId?: string }): boolean {
    return atsInfo?.type === 'workable' && !!atsInfo.board && !!atsInfo.jobId;
  }

  private parseMarkdown(markdown: string, sourceUrl: string): WorkablePosting {
    const lines = markdown.split('\n');

    let title: string | undefined;
    const titleLine = lines.find((l) => l.startsWith('# '));
    if (titleLine) title = titleLine.replace(/^#\s+/, '').trim();

    let company: string | undefined;
    let location: string | undefined;
    let postedOn: string | undefined;
    const metaLine = lines.find((l) => l.trim().startsWith('>'));
    if (metaLine) {
      const segments = metaLine
        .replace(/^>\s*/, '')
        .split('·')
        .map((s) => s.trim())
        .filter(Boolean);
      if (segments[0]) company = segments[0];
      if (segments[1]) location = segments[1];
      const posted = segments.find((s) => /posted/i.test(s));
      if (posted) postedOn = posted.replace(/posted/i, '').trim();
    }

    const workplace = markdown.match(/\*\*Workplace:\*\*\s*([^\n]+)/i)?.[1]?.trim();
    const department = markdown.match(/\*\*Department:\*\*\s*([^\n]+)/i)?.[1]?.trim();

    return {
      title,
      company,
      location,
      workplace,
      department,
      postedOn,
      content: markdown,
      sourceUrl,
      isApiV3: false,
    };
  }

  private parseV3Json(data: any, board: string, sourceUrl: string): WorkablePosting {
    const title = decodeHtmlEntities(data.title || '').trim();
    const company =
      (data.company && typeof data.company === 'object' ? data.company.name : data.company) ||
      slugToCompanyName(board);

    let location = '';
    if (data.location) {
      if (typeof data.location === 'string') {
        location = decodeHtmlEntities(data.location).trim();
      } else if (typeof data.location === 'object') {
        const parts = [data.location.city, data.location.region, data.location.country]
          .filter(Boolean)
          .map((s) => decodeHtmlEntities(String(s)).trim());
        location = parts.join(', ');
        if (data.location.telecommuting) {
          location = location ? `Remote (${location})` : 'Remote';
        }
      }
    }

    const workplace = data.workplace || (data.telecommuting ? 'Remote' : undefined);
    const department = Array.isArray(data.department)
      ? data.department.join(', ')
      : data.department || (data.category ? String(data.category) : undefined);
    const postedOn = data.published || data.created_at;

    let salaryStr = '';
    if (data.salary) {
      const s = data.salary;
      const cur = s.currency ? `${s.currency} ` : '';
      const interval = s.interval ? ` / ${s.interval}` : '';
      if (s.min && s.max) {
        salaryStr = `${cur}${s.min} - ${s.max}${interval}`;
      } else if (s.min || s.max) {
        salaryStr = `${cur}${s.min || s.max}${interval}`;
      }
    }

    const descClean = cleanHtmlDescription(data.description || '');
    const reqClean = data.requirements ? `\n\nRequirements:\n${cleanHtmlDescription(data.requirements)}` : '';
    const benClean = data.benefits ? `\n\nBenefits:\n${cleanHtmlDescription(data.benefits)}` : '';

    const content = `# ${title}\n> ${company} · ${location || 'Not listed'}\n\n${
      salaryStr ? '**Salary:** ' + salaryStr + '\n\n' : ''
    }${descClean}${reqClean}${benClean}`;

    return {
      title,
      company,
      location,
      workplace,
      department,
      postedOn,
      content,
      sourceUrl,
      isApiV3: true,
    };
  }

  private async fetchApi(board: string, jobId: string): Promise<WorkablePosting> {
    // 1. Try Workable API v3 structured JSON endpoint first
    try {
      const v3Url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`;
      const v3Response = await fetchPublicUrl(v3Url, {
        signal: AbortSignal.timeout(6000),
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });

      if (v3Response.ok) {
        const data = await v3Response.json();
        if (data && (data.title || data.id || data.shortcode)) {
          return this.parseV3Json(data, board, v3Url);
        }
      }
    } catch {
      // Fall through to markdown endpoints on failure
    }

    // 2. Fall back to server-rendered .md endpoints
    const candidateUrls = [
      `https://apply.workable.com/${encodeURIComponent(board)}/jobs/view/${encodeURIComponent(jobId)}.md`,
      `https://apply.workable.com/${encodeURIComponent(board)}/j/${encodeURIComponent(jobId)}.md`,
    ];
    let lastError: any = null;

    for (const apiUrl of candidateUrls) {
      try {
        const response = await fetchPublicUrl(apiUrl, {
          signal: AbortSignal.timeout(6000),
          headers: {
            Accept: 'text/markdown, text/plain, */*',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        if (response.ok) {
          const markdown = await readResponseTextUpTo(response, 2 * 1024 * 1024);
          if (markdown && markdown.trim().length > 40) {
            return this.parseMarkdown(markdown, apiUrl);
          }
        } else {
          lastError = new Error(`Workable markdown endpoint responded with HTTP ${response.status}`);
        }
      } catch (e) {
        lastError = e;
      }
    }

    throw new Error(lastError?.message || `Workable posting not found for ${board}/${jobId}`);
  }

  async extract(
    url: string,
    atsInfo: { type: string; board?: string; jobId?: string },
    diagnosticSteps: DiagnosticStep[]
  ): Promise<AtsProviderResult> {
    const board = atsInfo.board!;
    const jobId = atsInfo.jobId!;
    const start = Date.now();

    diagnosticSteps.push({
      tier: 'Tier 1 (Workable API / Markdown)',
      name: 'Tier 1: Workable Public Posting',
      status: 'pending',
    });

    const posting = await this.fetchApi(board, jobId);
    const companyHint =
      posting.company ||
      deriveCompanyFromTitle(posting.title) ||
      slugToCompanyName(board);

    diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
    diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
    diagnosticSteps[diagnosticSteps.length - 1].details = posting.isApiV3
      ? `Fetched structured JSON from Workable API v3 for ${companyHint || board}`
      : `Fetched server-rendered markdown for ${companyHint || board}`;

    const geminiStart = Date.now();
    diagnosticSteps.push({
      tier: 'Tier 3 (Gemini Normalization)',
      name: 'Synthesize & Enrich Workable Posting',
      status: 'pending',
    });

    try {
      const structured = await extractWithGemini({
        url,
        sourceType: 'Workable Public Markdown',
        rawContent: posting.content,
        companyHint,
        jobTitleHint: posting.title || '',
      });

      diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Normalized attributes for ${structured.company} - ${structured.jobTitle}`;

      return {
        extractedData: structured,
        tierUsed: posting.isApiV3 ? 'ATS API (Workable v3)' : 'Workable Markdown + Gemini 3.8',
      };
    } catch (geminiErr: any) {
      diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
      diagnosticSteps[diagnosticSteps.length - 1].details = `Gemini call failed (${geminiErr.message}). Using parsed Workable ${posting.isApiV3 ? 'API v3' : 'markdown'} fields.`;

      const parsedSalary = extractSalaryFromTextOrJson(posting.content);
      const fallbackTitle = posting.title || 'Software & Product Specialist';
      const fallbackCompany = companyHint || 'Company';
      const isSr = /\b(sr|senior|lead|principal|director|head|staff|vp)\b/i.test(fallbackTitle);
      const cleanSummary = posting.content
        .replace(/^#.*$/gm, '')
        .replace(/^>.*$/gm, '')
        .replace(/^\s*\*\*(?:Workplace|Department|Salary|Location|Posted)\s*:\*\*.*$/gim, '')
        .replace(/[*#>_`]/g, ' ')
        .replace(/[•●]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 450);

      const fallbackData: ExtractedJobAttributes = {
        company: fallbackCompany,
        jobTitle: fallbackTitle,
        location: posting.location || (posting.workplace ? `${posting.workplace}` : 'Remote (US)'),
        salary: parsedSalary.salary !== 'Not listed' ? parsedSalary.salary : 'Not listed (Refer to job post)',
        salaryMin: parsedSalary.salaryMin,
        salaryMax: parsedSalary.salaryMax,
        industry: 'Unknown',
        summary: cleanSummary || `${fallbackCompany} is hiring for the role of ${fallbackTitle}.`,
        companyMetadata: { ...UNKNOWN_COMPANY_METADATA },
        positionMetadata: {
          seniority: isSr ? 'Senior' : 'Mid-level',
          department: posting.department || 'Unknown',
          employmentType: 'Unknown',
          requiredSkills: [],
        },
      };

      return {
        extractedData: fallbackData,
        tierUsed: posting.isApiV3 ? 'Direct ATS API (Workable v3)' : 'Workable Markdown (Deterministic)',
      };
    }
  }
}
