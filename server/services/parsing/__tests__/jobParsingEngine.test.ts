import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isWafOrAuthWallBlocked, JobParsingEngine } from '../index.ts';

vi.mock('../ai/geminiExtractor.ts', () => ({
  extractWithGemini: vi.fn(),
  extractWithUrlContext: vi.fn(),
}));

import { extractWithGemini, extractWithUrlContext } from '../ai/geminiExtractor.ts';

const SAMPLE_LONG_DESC = `
About Us: Acme Technologies provides real-time financial infrastructure for the modern web.
About the Role: We are seeking a Staff Infrastructure Engineer to architect distributed stream processing systems.
In this role, you will lead cross-functional architecture reviews, design fault-tolerant pipelines, and mentor junior engineers.
You will write clean, scalable code in Go and Python, managing Kubernetes clusters and Apache Kafka on AWS.
Requirements:
- 6+ years building distributed backend systems.
- Experience with Go, Python, PostgreSQL, Redis, and Docker.
- Experience with Terraform, CI/CD pipelines, and cloud monitoring.
Salary: $190,000 - $230,000 per year.
`;

describe('JobParsingEngine (Slice 4)', () => {
  let engine: JobParsingEngine;

  beforeEach(() => {
    engine = new JobParsingEngine();
    vi.mocked(extractWithGemini).mockReset();
    vi.mocked(extractWithUrlContext).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isWafOrAuthWallBlocked helper', () => {
    it('detects login/auth-walled hosts', () => {
      expect(isWafOrAuthWallBlocked('https://www.linkedin.com/jobs/view/12345678', null)).toBe(true);
      expect(isWafOrAuthWallBlocked('https://wellfound.com/jobs/9876-engineer', null)).toBe(true);
      expect(isWafOrAuthWallBlocked('https://www.glassdoor.com/job-listing/role-JL_123', null)).toBe(true);
      expect(isWafOrAuthWallBlocked('https://acme.darwinbox.com/ms/candidate/careers', null)).toBe(true);
      expect(isWafOrAuthWallBlocked('https://boards.greenhouse.io/stripe/jobs/123', null)).toBe(false);
      expect(isWafOrAuthWallBlocked('https://jobs.lever.co/netflix/456', null)).toBe(false);
    });

    it('detects HTTP 401, 403, 429, 999 status codes', () => {
      expect(isWafOrAuthWallBlocked('https://example.com/job', { rawHtmlStatus: 403 } as any)).toBe(true);
      expect(isWafOrAuthWallBlocked('https://example.com/job', { rawHtmlStatus: 429 } as any)).toBe(true);
      expect(isWafOrAuthWallBlocked('https://example.com/job', { rawHtmlStatus: 999 } as any)).toBe(true);
      expect(isWafOrAuthWallBlocked('https://example.com/job', { rawHtmlStatus: 401 } as any)).toBe(true);
      expect(isWafOrAuthWallBlocked('https://example.com/job', null, 'Scraper received HTTP 403 from target server')).toBe(true);
      expect(isWafOrAuthWallBlocked('https://example.com/job', null, 'Scraper received HTTP 999 from target server')).toBe(true);
    });

    it('detects Cloudflare Turnstile or challenge pages in HTML', () => {
      const scrapedChallenge = {
        rawHtmlStatus: 200,
        title: 'Just a moment...',
        cleanedText: 'Attention Required! Cloudflare verify you are human cf-turnstile',
      };
      expect(isWafOrAuthWallBlocked('https://example.com/job', scrapedChallenge as any)).toBe(true);
    });
  });

  describe('Tier 2 Schema.org JSON-LD Fast-Path', () => {
    it('normalizes high-confidence Schema.org JobPosting deterministically with 0 AI quota', async () => {
      const htmlWithJsonLd = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Staff Engineer - Data Platform</title>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Staff Engineer - Data Platform",
            "hiringOrganization": {
              "@type": "Organization",
              "name": "Datadog"
            },
            "jobLocation": {
              "@type": "Place",
              "address": {
                "addressLocality": "New York",
                "addressRegion": "NY"
              }
            },
            "baseSalary": {
              "@type": "MonetaryAmount",
              "currency": "USD",
              "value": {
                "@type": "QuantitativeValue",
                "minValue": 190000,
                "maxValue": 230000,
                "unitText": "YEAR"
              }
            },
            "description": "${SAMPLE_LONG_DESC.replace(/\n/g, ' ')}"
          }
          </script>
        </head>
        <body>
          <h1>Staff Engineer</h1>
        </body>
        </html>
      `;

      vi.stubGlobal('fetch', vi.fn(async () => new Response(htmlWithJsonLd, { status: 200 })));

      const checkAiQuota = vi.fn(async () => true);
      const result = await engine.extract('https://careers.datadoghq.com/detail/12345', undefined, { checkAiQuota });

      expect(result.tierUsed).toBe('Schema.org JobPosting (Fast-Path)');
      expect(result.extractedData.company).toBe('Datadog');
      expect(result.extractedData.jobTitle).toBe('Staff Engineer');
      expect(result.extractedData.team).toBe('Data Platform');
      expect(result.extractedData.location).toBe('New York, NY');
      expect(result.extractedData.salary).toBe('$190k - $230k');
      expect(result.extractedData.positionMetadata.seniority).toBe('Staff');
      expect(result.extractedData.positionMetadata.requiredSkills).toContain('Go');
      expect(result.extractedData.positionMetadata.requiredSkills).toContain('Python');

      // AI quota was never checked or consumed!
      expect(checkAiQuota).not.toHaveBeenCalled();
      expect(vi.mocked(extractWithGemini)).not.toHaveBeenCalled();
      expect(vi.mocked(extractWithUrlContext)).not.toHaveBeenCalled();

      // Diagnostic step verifies Fast-Path
      const fastPathStep = result.diagnosticSteps.find((s) => s.tier === 'Tier 1.5 (Fast-Path Normalizer)');
      expect(fastPathStep).toBeDefined();
      expect(fastPathStep?.status).toBe('success');
      expect(fastPathStep?.details).toContain('0 AI quota consumed');
    });
  });

  describe('Immediate WAF / Auth-Wall Short-Circuit (Decision 2 & Refinement 6)', () => {
    it('short-circuits LinkedIn URLs directly to Tier 5 without waiting for Tier 4 url_context', async () => {
      // Simulate LinkedIn returning HTTP 999 or scrape failure
      vi.stubGlobal('fetch', vi.fn(async () => new Response('Blocked', { status: 999 })));

      const checkAiQuota = vi.fn(async () => true);
      const result = await engine.extract('https://www.linkedin.com/jobs/view/1234567890', undefined, { checkAiQuota });

      expect(result.tierUsed).toBe('Deterministic URL Parser (Free Tier Safety)');
      expect(result.extractedData.company).not.toBe('');

      // Tier 4 Gemini url_context is skipped!
      expect(vi.mocked(extractWithUrlContext)).not.toHaveBeenCalled();
      expect(checkAiQuota).not.toHaveBeenCalled();

      // Step reports short-circuit and bookmarklet CTA
      const wafStep = result.diagnosticSteps.find((s) => s.tier === 'Tier 4 (WAF Short-Circuit)');
      expect(wafStep).toBeDefined();
      expect(wafStep?.status).toBe('skipped');
      expect(wafStep?.details).toContain('1-Click Capture Bookmarklet');
    });

    it('short-circuits when Cloudflare challenge is encountered on protected portals', async () => {
      const cloudflareChallengeHtml = `
        <html>
        <head><title>Just a moment...</title></head>
        <body>
          <div id="cf-turnstile">Verify you are human</div>
          <p>Cloudflare Ray ID: 123456789</p>
        </body>
        </html>
      `;

      vi.stubGlobal('fetch', vi.fn(async () => new Response(cloudflareChallengeHtml, { status: 403 })));

      const result = await engine.extract('https://protected-portal.com/careers/job-123');

      expect(result.tierUsed).toBe('Deterministic URL Parser (Free Tier Safety)');
      expect(vi.mocked(extractWithUrlContext)).not.toHaveBeenCalled();

      const wafStep = result.diagnosticSteps.find((s) => s.tier === 'Tier 4 (WAF Short-Circuit)');
      expect(wafStep).toBeDefined();
      expect(wafStep?.status).toBe('skipped');
    });
  });

  describe('AI-Token Quota Accounting (Decision 7)', () => {
    it('skips Gemini for manual text when quota is exhausted and falls back cleanly', async () => {
      const checkAiQuota = vi.fn(async () => false); // 0 quota remaining

      const result = await engine.extract(
        undefined,
        `
        Senior Backend Engineer at Stripe
        Location: Seattle, WA
        We are hiring a Senior Backend Engineer to work on payment infrastructure with Go and PostgreSQL.
        `,
        { checkAiQuota }
      );

      expect(checkAiQuota).toHaveBeenCalledTimes(1);
      expect(vi.mocked(extractWithGemini)).not.toHaveBeenCalled();
      expect(result.tierUsed).toBe('Deterministic Text Parser (Free Tier Safety)');

      const quotaStep = result.diagnosticSteps.find((s) => s.name === 'Daily AI Extraction Quota Limit');
      expect(quotaStep).toBeDefined();
      expect(quotaStep?.status).toBe('skipped');
      expect(quotaStep?.details).toContain('Daily AI extraction quota reached');
    });

    it('skips Tier 3 & Tier 4 when quota is exhausted and falls back to deterministic URL parser', async () => {
      const html = `
        <html>
        <head><title>Software Engineer at Stripe</title></head>
        <body><p>Short content without JSON-LD.</p></body>
        </html>
      `;
      vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200 })));

      const checkAiQuota = vi.fn(async () => false); // No quota remaining
      const result = await engine.extract('https://stripe.com/jobs/123', undefined, { checkAiQuota });

      expect(vi.mocked(extractWithGemini)).not.toHaveBeenCalled();
      expect(vi.mocked(extractWithUrlContext)).not.toHaveBeenCalled();
      expect(result.tierUsed).toContain('Free Tier Safety');

      const quotaStep = result.diagnosticSteps.find((s) => s.name === 'Daily AI Extraction Quota Limit');
      expect(quotaStep).toBeDefined();
      expect(quotaStep?.status).toBe('skipped');
    });

    it('charges quota at most once per extraction even across multiple fallback stages', async () => {
      const html = `
        <html>
        <head><title>Unstructured Job Posting</title></head>
        <body><p>${SAMPLE_LONG_DESC}</p></body>
        </html>
      `;
      vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200 })));

      // Quota check returns true
      const checkAiQuota = vi.fn(async () => true);

      // Tier 3 Gemini fails
      vi.mocked(extractWithGemini).mockRejectedValueOnce(new Error('Gemini API timeout'));
      // Tier 4 Gemini succeeds
      vi.mocked(extractWithUrlContext).mockResolvedValueOnce({
        company: 'Stripe',
        jobTitle: 'Staff Engineer',
        location: 'Remote',
      } as any);

      const result = await engine.extract('https://stripe.com/jobs/999', undefined, { checkAiQuota });

      // checkAiQuota must only have been invoked ONCE (memoized for the request)
      expect(checkAiQuota).toHaveBeenCalledTimes(1);
      expect(result.tierUsed).toBe('Gemini 3.8 Flash URL Context');
    });
  });

  describe('Tier 1 Providers Fast-Path Integration', () => {
    it('GreenhouseProvider takes Fast-Path with 0 AI quota when structured data is >= 200 chars', async () => {
      const ghPayload = {
        title: 'Staff Backend Engineer - Core Payments',
        location: { name: 'San Francisco, CA' },
        departments: [{ name: 'Engineering' }],
        content: SAMPLE_LONG_DESC,
      };

      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(ghPayload), { status: 200 })));

      const checkAiQuota = vi.fn(async () => true);
      const result = await engine.extract('https://boards.greenhouse.io/stripe/jobs/77777', undefined, { checkAiQuota });

      expect(result.tierUsed).toBe('ATS API (Greenhouse • Fast-Path)');
      expect(result.extractedData.company).toBe('Stripe');
      expect(result.extractedData.jobTitle).toBe('Staff Backend Engineer');
      expect(result.extractedData.team).toBe('Core Payments');
      expect(result.extractedData.location).toBe('San Francisco, CA');
      expect(result.extractedData.positionMetadata.seniority).toBe('Staff');

      // 0 AI quota consumed!
      expect(checkAiQuota).not.toHaveBeenCalled();
      expect(vi.mocked(extractWithGemini)).not.toHaveBeenCalled();
    });

    it('SmartRecruitersProvider takes Fast-Path with 0 AI quota when structured data is >= 200 chars', async () => {
      const srPayload = {
        name: 'Principal Security Architect',
        company: { name: 'Visa' },
        location: { city: 'Austin', region: 'TX', country: 'US' },
        department: { label: 'Security' },
        typeOfEmployment: { label: 'Full-time' },
        jobAd: {
          sections: {
            jobDescription: { text: SAMPLE_LONG_DESC },
          },
        },
      };

      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(srPayload), { status: 200 })));

      const checkAiQuota = vi.fn(async () => true);
      const result = await engine.extract('https://jobs.smartrecruiters.com/Visa/99999', undefined, { checkAiQuota });

      expect(result.tierUsed).toBe('ATS API (SmartRecruiters • Fast-Path)');
      expect(result.extractedData.company).toBe('Visa');
      expect(result.extractedData.jobTitle).toBe('Principal Security Architect');
      expect(result.extractedData.positionMetadata.seniority).toBe('Principal');

      expect(checkAiQuota).not.toHaveBeenCalled();
      expect(vi.mocked(extractWithGemini)).not.toHaveBeenCalled();
    });
  });
});
