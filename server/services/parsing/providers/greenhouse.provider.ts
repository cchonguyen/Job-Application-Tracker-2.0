import * as cheerio from 'cheerio';
import { slugToCompanyName } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson } from '../../../../src/lib/salary.ts';
import { extractWithGemini } from '../ai/geminiExtractor.ts';
import { DiagnosticStep, ExtractedJobAttributes } from '../types.ts';
import { AtsProvider, AtsProviderOptions, AtsProviderResult } from './base.provider.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { fetchPublicUrl } from '../utils/safeFetch.ts';
import { tryFastPathNormalize } from '../utils/fastPathNormalizer.ts';

export class GreenhouseProvider implements AtsProvider {
  readonly name = 'Greenhouse';

  canHandle(url: string, atsInfo?: { type: string; board?: string; jobId?: string }): boolean {
    return atsInfo?.type === 'greenhouse' && !!atsInfo.board && !!atsInfo.jobId;
  }

  private async fetchApi(board: string, jobId: string): Promise<any> {
    const candidateBoards = [board, `${board}2`, `${board}careers`, `${board}jobs`, `${board}inc`];
    let lastError: any = null;

    for (const b of candidateBoards) {
      try {
        const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b)}/jobs/${encodeURIComponent(jobId)}`;
        const response = await fetchPublicUrl(apiUrl, {
          signal: AbortSignal.timeout(4000),
          headers: {
            Accept: 'application/json',
            'User-Agent': 'JobApplicationTracker/1.0',
          },
        });
        if (response.ok) {
          const data = await response.json();
          return { ...data, resolvedBoard: b };
        }
      } catch (e) {
        lastError = e;
      }
    }

    throw new Error(lastError?.message || `Greenhouse API: job ${jobId} not found on candidate boards [${candidateBoards.join(', ')}]`);
  }

  private createFallbackData(atsPayload: any, companyHint: string, titleHint: string): ExtractedJobAttributes {
    const cleanName = companyHint.replace(/\d+$/, '');
    const fallbackCompany = slugToCompanyName(cleanName);
    const fallbackTitle = atsPayload.title || titleHint || 'Software Engineer';
    const fallbackLocation =
      atsPayload.location?.name ||
      atsPayload.offices?.[0]?.name ||
      'Remote (US)';

    const rawContent = atsPayload.content || JSON.stringify(atsPayload);
    const parsedSalary = extractSalaryFromTextOrJson(rawContent);

    let fallbackSummary = '';
    if (atsPayload.content) {
      try {
        const cleanDesc = cheerio.load(cheerio.load(atsPayload.content).text()).text().replace(/\s+/g, ' ');
        fallbackSummary = cleanDesc.slice(0, 450) + (cleanDesc.length > 450 ? '...' : '');
      } catch {
        fallbackSummary = `${fallbackCompany} is recruiting for the role of ${fallbackTitle}.`;
      }
    } else {
      fallbackSummary = `${fallbackCompany} is recruiting for the role of ${fallbackTitle}. Direct position fetched via the official Greenhouse job posting API.`;
    }

    const isSr = /\b(sr|senior|lead|principal|director|head)\b/i.test(fallbackTitle);

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
        department: atsPayload.departments?.[0]?.name || 'Unknown',
        employmentType: 'Full-time',
        requiredSkills: [],
      },
    };
  }

  async extract(
    url: string,
    atsInfo: { type: string; board?: string; jobId?: string },
    diagnosticSteps: DiagnosticStep[],
    options?: AtsProviderOptions
  ): Promise<AtsProviderResult> {
    const board = atsInfo.board!;
    const jobId = atsInfo.jobId!;
    const start = Date.now();

    diagnosticSteps.push({
      tier: 'Tier 1 (ATS REST API)',
      name: 'Tier 1: Greenhouse REST API',
      status: 'pending',
    });

    const atsPayload = await this.fetchApi(board, jobId);
    const titleHint = atsPayload.title || '';
    const companyHint = atsPayload.resolvedBoard || board;

    diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
    diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
    diagnosticSteps[diagnosticSteps.length - 1].details = `Successfully fetched structured JSON from GREENHOUSE API endpoint`;

    // Fast-Path Normalizer (Tier 1.5)
    const rawDescription = atsPayload.content || '';
    const locationName = atsPayload.location?.name || atsPayload.offices?.[0]?.name;
    const cleanCompany = slugToCompanyName(companyHint.replace(/\d+$/, ''));

    const fastPath = tryFastPathNormalize({
      company: cleanCompany,
      jobTitle: titleHint,
      location: locationName,
      descriptionHtml: rawDescription,
      department: atsPayload.departments?.[0]?.name,
      rawPayload: atsPayload,
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
        tierUsed: 'ATS API (Greenhouse • Fast-Path)',
      };
    }

    if (options?.checkAiQuota && !(await options.checkAiQuota())) {
      diagnosticSteps.push({
        tier: 'Tier 3 (AI Quota Check)',
        name: 'Daily AI Extraction Quota Limit',
        status: 'skipped',
        details: 'Daily AI extraction quota reached. Skipping Gemini normalization.',
      });
      return {
        extractedData: this.createFallbackData(atsPayload, companyHint, titleHint),
        tierUsed: 'Direct ATS API (Greenhouse)',
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
        sourceType: 'GREENHOUSE REST API',
        rawContent: JSON.stringify(atsPayload),
        companyHint,
        jobTitleHint: titleHint,
      });

      diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - geminiStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Normalized attributes for ${structured.company} - ${structured.jobTitle}`;

      return {
        extractedData: structured,
        tierUsed: 'ATS API (Greenhouse)',
      };
    } catch (geminiErr: any) {
      diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
      diagnosticSteps[diagnosticSteps.length - 1].details = `Gemini call failed (${geminiErr.message}). Using direct ATS parsed fields.`;

      return {
        extractedData: this.createFallbackData(atsPayload, companyHint, titleHint),
        tierUsed: 'Direct ATS API (Greenhouse)',
      };
    }
  }
}
