import * as cheerio from 'cheerio';
import { extractSalaryFromTextOrJson } from '../../../../src/lib/salary.ts';
import { extractWithGemini } from '../ai/geminiExtractor.ts';
import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { AtsProvider, AtsProviderResult } from './base.provider.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { fetchPublicUrl } from '../utils/safeFetch.ts';

export class LeverProvider implements AtsProvider {
  readonly name = 'Lever';

  canHandle(url: string, atsInfo?: { type: string; board?: string; jobId?: string }): boolean {
    return atsInfo?.type === 'lever' && !!atsInfo.board && !!atsInfo.jobId;
  }

  private async fetchApi(company: string, jobId: string): Promise<any> {
    const apiUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}/${encodeURIComponent(jobId)}`;
    const response = await fetchPublicUrl(apiUrl, {
      signal: AbortSignal.timeout(6000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JobApplicationTracker/1.0',
      },
    });
    if (!response.ok) {
      throw new Error(`Lever API responded with HTTP ${response.status}`);
    }
    return await response.json();
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
      tier: 'Tier 1 (ATS REST API)',
      name: 'Tier 1: Lever Postings API',
      status: 'pending',
    });

    const atsPayload = await this.fetchApi(board, jobId);
    const titleHint = atsPayload.text || '';
    const companyHint = board;

    diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
    diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
    diagnosticSteps[diagnosticSteps.length - 1].details = `Successfully fetched structured JSON from LEVER API endpoint`;

    const geminiStart = Date.now();
    diagnosticSteps.push({
      tier: 'Tier 3 (Gemini Normalization)',
      name: 'Synthesize & Enrich ATS Payload',
      status: 'pending',
    });

    try {
      const structured = await extractWithGemini({
        url,
        sourceType: 'LEVER REST API',
        rawContent: JSON.stringify(atsPayload),
        companyHint,
        jobTitleHint: titleHint,
      });

      diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Normalized attributes for ${structured.company} - ${structured.jobTitle}`;

      return {
        extractedData: structured,
        tierUsed: 'ATS API (Lever)',
      };
    } catch (geminiErr: any) {
      diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
      diagnosticSteps[diagnosticSteps.length - 1].details = `Gemini call failed (${geminiErr.message}). Using direct ATS parsed fields.`;

      const cleanName = companyHint.replace(/\d+$/, '');
      const fallbackCompany = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      const fallbackTitle = atsPayload.text || titleHint || 'Software Engineer';
      const fallbackLocation =
        (Array.isArray(atsPayload.categories?.location)
          ? atsPayload.categories.location.join(', ')
          : atsPayload.categories?.location) ||
        'Remote (US)';

      const rawContent = atsPayload.description || JSON.stringify(atsPayload);
      const parsedSalary = extractSalaryFromTextOrJson(rawContent);

      let fallbackSummary = '';
      if (atsPayload.description) {
        try {
          const cleanDesc = cheerio.load(cheerio.load(atsPayload.description).text()).text().replace(/\s+/g, ' ');
          fallbackSummary = cleanDesc.slice(0, 450) + '...';
        } catch {
          fallbackSummary = `${fallbackCompany} is recruiting for the role of ${fallbackTitle}.`;
        }
      } else {
        fallbackSummary = `${fallbackCompany} is recruiting for the role of ${fallbackTitle}. Direct position fetched via the official Lever job posting API.`;
      }

      const isSr = /\b(sr|senior|lead|principal|director|head)\b/i.test(fallbackTitle);

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
          department: atsPayload.categories?.department || 'Unknown',
          employmentType: atsPayload.categories?.commitment || 'Unknown',
          requiredSkills: [],
        },
      };

      return {
        extractedData: fallbackData,
        tierUsed: 'Direct ATS API (Lever)',
      };
    }
  }
}
