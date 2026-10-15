import { detectAts } from '../../../src/lib/atsDetect.ts';
import { extractWithGemini, extractWithUrlContext } from './ai/geminiExtractor.ts';
import { cleanErrorMessage } from './geminiClient.ts';
import { AshbyProvider } from './providers/ashby.provider.ts';
import { AtsProvider } from './providers/base.provider.ts';
import { GreenhouseProvider } from './providers/greenhouse.provider.ts';
import { LeverProvider } from './providers/lever.provider.ts';
import { WorkableProvider } from './providers/workable.provider.ts';
import { DiagnosticStep, ExtractionResult, ScrapedHtmlData } from './types.ts';
import {
  cleanCompanyName,
  parseManualTextDeterministically,
  parseUrlDeterministically,
  scrapeHtmlWithCheerio,
} from './utils/htmlCleaner.ts';

export class JobParsingEngine {
  private providers: AtsProvider[] = [
    new GreenhouseProvider(),
    new LeverProvider(),
    new WorkableProvider(),
    new AshbyProvider(),
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
  public async extract(targetUrl?: string, manualText?: string): Promise<ExtractionResult> {
    const diagnosticSteps: DiagnosticStep[] = [];

    // Case A: Manual Text provided directly
    if (manualText && manualText.trim().length > 30) {
      const start = Date.now();
      diagnosticSteps.push({
        tier: 'Tier 3 (Direct Gemini)',
        name: 'Manual Text Extraction',
        status: 'pending',
      });

      try {
        const data = await extractWithGemini({
          sourceType: 'Manual Text Input',
          rawContent: manualText,
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
          const result = await matchedProvider.extract(targetUrl, ats, diagnosticSteps);
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
          details: 'URL does not match a known Greenhouse, Lever, Workable, or Ashby API pattern. Proceeding to Tier 2.',
        });
      }
    }

    // TIER 2: Cheerio Resilient HTML Scraper
    let scraped: ScrapedHtmlData | null = null;
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
      diagnosticSteps[diagnosticSteps.length - 1].status = 'failed';
      diagnosticSteps[diagnosticSteps.length - 1].durationMs = Date.now() - cheerioStart;
      diagnosticSteps[diagnosticSteps.length - 1].details = `Scraping failed: ${err.message}. Will trigger Tier 4 Search Grounding.`;
    }

    // TIER 3: If Cheerio succeeded and found meaningful content, use Gemini to extract
    if (scraped && (scraped.jsonLd || (scraped.cleanedText && scraped.cleanedText.length > 150))) {
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

    // TIER 4: Gemini reads the page itself via the url_context tool (never guesses from the URL alone)
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
