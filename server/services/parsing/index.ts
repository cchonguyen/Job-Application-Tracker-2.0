import { detectAts } from '../../../src/lib/atsDetect.ts';
import { extractWithGemini, extractWithUrlContext } from './ai/geminiExtractor.ts';
import { cleanErrorMessage } from './geminiClient.ts';
import { AshbyProvider } from './providers/ashby.provider.ts';
import { BambooHrProvider } from './providers/bamboohr.provider.ts';
import { AtsProvider } from './providers/base.provider.ts';
import { GreenhouseProvider } from './providers/greenhouse.provider.ts';
import { LeverProvider } from './providers/lever.provider.ts';
import { PinpointProvider } from './providers/pinpoint.provider.ts';
import { RecruiteeProvider } from './providers/recruitee.provider.ts';
import { SmartRecruitersProvider } from './providers/smartrecruiters.provider.ts';
import { WorkableProvider } from './providers/workable.provider.ts';
import { WorkdayProvider } from './providers/workday.provider.ts';
import { DiagnosticStep, ExtractionResult, ScrapedHtmlData } from './types.ts';
import { tryFastPathNormalize } from './utils/fastPathNormalizer.ts';
import {
  cleanCompanyName,
  parseManualTextDeterministically,
  parseUrlDeterministically,
  scrapeHtmlWithCheerio,
} from './utils/htmlCleaner.ts';

export interface ExtractOptions {
  checkAiQuota?: () => Promise<boolean>;
}

export function isWafOrAuthWallBlocked(
  targetUrl: string,
  scraped: ScrapedHtmlData | null,
  scrapeError?: string
): boolean {
  try {
    const parsed = new URL(targetUrl.includes('://') ? targetUrl : `https://${targetUrl}`);
    const host = parsed.hostname.toLowerCase();
    if (
      host.endsWith('linkedin.com') ||
      host.endsWith('wellfound.com') ||
      host.endsWith('glassdoor.com') ||
      host.endsWith('darwinbox.com')
    ) {
      return true;
    }
  } catch {}

  if (scraped) {
    if ([401, 403, 429, 999].includes(scraped.rawHtmlStatus)) {
      return true;
    }
    const combined = `${scraped.title || ''} ${scraped.ogTitle || ''} ${scraped.cleanedText || ''}`.toLowerCase();
    if (
      combined.includes('cf-turnstile') ||
      combined.includes('challenges.cloudflare.com') ||
      (combined.includes('cloudflare') &&
        (combined.includes('challenge') ||
          combined.includes('just a moment') ||
          combined.includes('attention required') ||
          combined.includes('verify you are human')))
    ) {
      return true;
    }
  }

  if (scrapeError) {
    if (/\b(401|403|429|999)\b/.test(scrapeError)) {
      return true;
    }
    if (/cloudflare|turnstile|just a moment|bot detection|forbidden|unauthorized/i.test(scrapeError)) {
      return true;
    }
  }

  return false;
}

export class JobParsingEngine {
  private providers: AtsProvider[] = [
    new GreenhouseProvider(),
    new LeverProvider(),
    new WorkableProvider(),
    new AshbyProvider(),
    new SmartRecruitersProvider(),
    new RecruiteeProvider(),
    new PinpointProvider(),
    new BambooHrProvider(),
    new WorkdayProvider(),
  ];

  /**
   * Registers a new ATS provider strategy (e.g. SmartRecruiters, Jobvite)
   */
  public registerProvider(provider: AtsProvider): void {
    this.providers.push(provider);
  }

  /**
   * Core multi-tier extraction pipeline coordinator
   */
  public async extract(
    targetUrl?: string,
    manualText?: string,
    options?: ExtractOptions
  ): Promise<ExtractionResult> {
    const diagnosticSteps: DiagnosticStep[] = [];

    // Memoized quota check for this extraction invocation so quota is charged at most once per job
    let quotaAllowed: boolean | null = null;
    const checkQuota = async (): Promise<boolean> => {
      if (quotaAllowed !== null) return quotaAllowed;
      if (!options?.checkAiQuota) {
        quotaAllowed = true;
        return true;
      }
      quotaAllowed = await options.checkAiQuota();
      return quotaAllowed;
    };

    // Case A: Manual Text provided directly
    if (manualText && manualText.trim().length > 30) {
      if (!(await checkQuota())) {
        diagnosticSteps.push({
          tier: 'Tier 3 (AI Quota Check)',
          name: 'Daily AI Extraction Quota Limit',
          status: 'skipped',
          details: 'Daily AI extraction quota reached. Processed manual text deterministically without AI.',
        });
        const parsedManual = parseManualTextDeterministically(manualText, targetUrl);
        return {
          extractedData: parsedManual,
          tierUsed: 'Deterministic Text Parser (Free Tier Safety)',
          diagnosticSteps,
        };
      }

      const start = Date.now();
      diagnosticSteps.push({
        tier: 'Tier 3 (Direct Gemini)',
        name: 'Manual Text Extraction',
        status: 'pending',
      });

      try {
        const data = await extractWithGemini({
          url: targetUrl,
          sourceType: 'Manual Text Input',
          rawContent: manualText,
          companyHint: targetUrl ? cleanCompanyName(targetUrl) : undefined,
        });
        diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
        diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
        diagnosticSteps[diagnosticSteps.length - 1].details = `Extracted ${data.company} - ${data.jobTitle}`;

        return {
          extractedData: data,
          tierUsed: 'Manual Input (Gemini 3.8)',
          diagnosticSteps,
        };
      } catch (err: any) {
        diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
        diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - start;
        diagnosticSteps[diagnosticSteps.length - 1].details = cleanErrorMessage(err);

        const parsedManual = parseManualTextDeterministically(manualText, targetUrl);
        return {
          extractedData: parsedManual,
          tierUsed: 'Deterministic Text Parser (Free Tier Safety)',
          diagnosticSteps,
        };
      }
    }

    if (!targetUrl) {
      throw new Error('Please provide a valid job posting URL or job description text.');
    }

    // Case B: URL Pipeline
    const ats = detectAts(targetUrl);

    // TIER 1: Dedicated ATS Handlers via Providers
    if (ats.type === 'darwinbox') {
      diagnosticSteps.push({
        tier: 'Tier 1 (ATS Detection)',
        name: 'Tier 1: Darwinbox Candidate Portal (Client-Side Angular SPA)',
        status: 'failed',
        details: `Detected Darwinbox portal for ${ats.board}. Darwinbox renders job descriptions dynamically via client-side JavaScript (<app-root>) and protects candidate endpoints with Cloudflare Bot Management (HTTP 403). Proceeding to HTML scraper & heuristic inference.`,
      });
    } else {
      const matchedProvider = this.providers.find((p) => p.canHandle(targetUrl, ats));
      if (matchedProvider) {
        try {
          const result = await matchedProvider.extract(targetUrl, ats, diagnosticSteps, {
            checkAiQuota: checkQuota,
          });
          return {
            extractedData: result.extractedData,
            tierUsed: result.tierUsed,
            diagnosticSteps,
          };
        } catch (err: any) {
          diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
          diagnosticSteps[diagnosticSteps.length - 1].details = `${matchedProvider.name} API call failed: ${err.message}. Falling back to Tier 2 HTML scraper.`;
        }
      } else {
        diagnosticSteps.push({
          tier: 'Tier 1 (ATS REST API)',
          name: 'ATS Signature Detector',
          status: 'skipped',
          details:
            'URL does not match a supported Tier 1 ATS API pattern (Greenhouse, Lever, Workable, Ashby, SmartRecruiters, Recruitee, Pinpoint, BambooHR, Workday). Proceeding to Tier 2.',
        });
      }
    }

    // TIER 2: Cheerio Resilient HTML Scraper
    let scraped: ScrapedHtmlData | null = null;
    let scrapeError: string | undefined = undefined;
    const cheerioStart = Date.now();
    diagnosticSteps.push({
      tier: 'Tier 2 (Cheerio Scraper)',
      name: 'Fetch & Parse HTML (JSON-LD & DOM)',
      status: 'pending',
    });

    try {
      scraped = await scrapeHtmlWithCheerio(targetUrl);
      const isSpaShell =
        (!scraped.title && !scraped.ogTitle) ||
        (!scraped.jsonLd && (!scraped.cleanedText || scraped.cleanedText.length < 100));
      diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - cheerioStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = isSpaShell
        ? `HTML received (Status ${scraped.rawHtmlStatus}), but detected a client-side Single-Page Application (SPA) shell with no pre-rendered DOM text or OpenGraph meta tags.`
        : `HTML received (Status ${scraped.rawHtmlStatus}). ${
            scraped.jsonLd ? 'Found JSON-LD schema.org/JobPosting!' : 'Extracted OpenGraph & DOM body.'
          }`;
    } catch (err: any) {
      scrapeError = err.message;
      diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - cheerioStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Scraping failed: ${err.message}.`;
    }

    // TIER 2.5: Fast-Path Normalizer for Schema.org JSON-LD
    if (scraped?.jsonLd) {
      const jsonLdData = scraped.jsonLd?._normalized || scraped.jsonLd;
      const fastPathResult = tryFastPathNormalize({
        company: jsonLdData?.company || scraped.ogSiteName,
        jobTitle: jsonLdData?.title || scraped.ogTitle || scraped.title,
        location: jsonLdData?.location,
        descriptionHtml: jsonLdData?.description,
        descriptionText: jsonLdData?.description || scraped.cleanedText,
        employmentType: jsonLdData?.employmentType,
        salary: jsonLdData?.salary,
        salaryMin: jsonLdData?.salaryMin,
        salaryMax: jsonLdData?.salaryMax,
        rawPayload: scraped.jsonLd,
      });

      if (fastPathResult) {
        diagnosticSteps.push({
          tier: 'Tier 1.5 (Fast-Path Normalizer)',
          name: 'Strict Fast-Path Normalizer (Schema.org)',
          status: 'success',
          details:
            'Structured Schema.org JobPosting satisfied high-confidence threshold. Extracted deterministically with 0 AI quota consumed.',
        });
        return {
          extractedData: fastPathResult,
          tierUsed: 'Schema.org JobPosting (Fast-Path)',
          diagnosticSteps,
        };
      }
    }

    // TIER 3: If Cheerio succeeded and found meaningful content, use Gemini to extract
    if (scraped && (scraped.jsonLd || (scraped.cleanedText && scraped.cleanedText.length > 150))) {
      if (!(await checkQuota())) {
        diagnosticSteps.push({
          tier: 'Tier 3 (AI Quota Check)',
          name: 'Daily AI Extraction Quota Limit',
          status: 'skipped',
          details: 'Daily AI extraction quota reached. Processed posting deterministically without AI.',
        });
        const deterministicData = parseUrlDeterministically(targetUrl, scraped);
        return {
          extractedData: deterministicData,
          tierUsed: scraped?.cleanedText
            ? 'Resilient DOM Parser (Free Tier Safety)'
            : 'Deterministic URL Parser (Free Tier Safety)',
          diagnosticSteps,
        };
      }

      const tier3Start = Date.now();
      diagnosticSteps.push({
        tier: 'Tier 3 (Gemini 3.8 Flash)',
        name: 'Extract Structured Attributes from Scraped HTML',
        status: 'pending',
      });

      try {
        const combinedContent = `
PAGE TITLE: ${scraped.title}
OG TITLE: ${scraped.ogTitle || ''}
OG DESCRIPTION: ${scraped.ogDescription || ''}
OG SITE NAME: ${scraped.ogSiteName || ''}
META DESCRIPTION: ${scraped.metaDescription || ''}
JSON-LD DATA:
${scraped.jsonLd ? JSON.stringify(scraped.jsonLd, null, 2) : 'None'}

ARTICLE BODY CONTENT:
${scraped.cleanedText}
`;

        const structured = await extractWithGemini({
          url: targetUrl,
          sourceType: scraped.jsonLd ? 'HTML + JSON-LD JobPosting' : 'HTML DOM Scraping',
          rawContent: combinedContent,
          companyHint: cleanCompanyName(
            targetUrl,
            scraped.ogSiteName,
            scraped.cleanedText,
            scraped.ogTitle || scraped.title
          ),
          jobTitleHint: scraped.ogTitle || scraped.title || '',
        });

        diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
        diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - tier3Start;
        diagnosticSteps[diagnosticSteps.length - 1].details = `Successfully extracted ${structured.company} (${structured.jobTitle})`;

        return {
          extractedData: structured,
          tierUsed: scraped.jsonLd ? 'Cheerio JSON-LD + Gemini 3.8' : 'Cheerio HTML + Gemini 3.8',
          diagnosticSteps,
        };
      } catch (err: any) {
        diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
        diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - tier3Start;
        diagnosticSteps[diagnosticSteps.length - 1].details = cleanErrorMessage(err);
      }
    }

    // WAF / Auth-Wall Short-Circuit (Decision 2 & Refinement 6)
    if (isWafOrAuthWallBlocked(targetUrl, scraped, scrapeError)) {
      diagnosticSteps.push({
        tier: 'Tier 4 (WAF Short-Circuit)',
        name: 'Anti-Bot & Login Wall Short-Circuit Guard',
        status: 'skipped',
        details:
          'Target portal is protected by anti-bot verification or auth wall. Skipped Tier 4 URL context to prevent timeouts. Use the 1-Click Capture Bookmarklet directly from the job posting tab to capture full details.',
      });
      const deterministicData = parseUrlDeterministically(targetUrl, scraped);
      return {
        extractedData: deterministicData,
        tierUsed: 'Deterministic URL Parser (Free Tier Safety)',
        diagnosticSteps,
      };
    }

    // TIER 4: Gemini reads the page itself via the url_context tool (never guesses from the URL alone)
    if (!(await checkQuota())) {
      diagnosticSteps.push({
        tier: 'Tier 4 (AI Quota Check)',
        name: 'Daily AI Extraction Quota Limit',
        status: 'skipped',
        details: 'Daily AI extraction quota reached. Processed posting deterministically without AI.',
      });
      const deterministicData = parseUrlDeterministically(targetUrl, scraped);
      return {
        extractedData: deterministicData,
        tierUsed: scraped?.cleanedText
          ? 'Resilient DOM Parser (Free Tier Safety)'
          : 'Deterministic URL Parser (Free Tier Safety)',
        diagnosticSteps,
      };
    }

    const tier4Start = Date.now();
    diagnosticSteps.push({
      tier: 'Tier 4 (Gemini URL Context)',
      name: 'Gemini Reads the Posting Page Directly',
      status: 'pending',
    });

    try {
      const extracted = await extractWithUrlContext(targetUrl);
      diagnosticSteps[diagnosticSteps.length - 1].status = 'success';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - tier4Start;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Gemini read the posting page: ${extracted.company} - ${extracted.jobTitle}`;

      return {
        extractedData: extracted,
        tierUsed: 'Gemini 3.8 Flash URL Context',
        diagnosticSteps,
      };
    } catch (err: any) {
      diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - tier4Start;
      diagnosticSteps[diagnosticSteps.length - 1].details = cleanErrorMessage(err);

      // Resilient deterministic fallback using scraped DOM or URL parsing
      const deterministicData = parseUrlDeterministically(targetUrl, scraped);
      const tierUsed = scraped?.cleanedText
        ? 'Resilient DOM Parser (Free Tier Safety)'
        : 'Deterministic URL Parser (Free Tier Safety)';

      return {
        extractedData: deterministicData,
        tierUsed,
        diagnosticSteps,
      };
    }
  }
}

export const parsingEngine = new JobParsingEngine();

