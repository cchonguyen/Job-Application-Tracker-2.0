import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scrapeHtmlWithCheerio } from '../htmlCleaner.ts';

describe('scrapeHtmlWithCheerio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts Schema.org JSON-LD and normalizes job posting fields', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Senior Frontend Engineer - Stripe</title>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "title": "Senior Frontend Engineer",
              "hiringOrganization": {
                "@type": "Organization",
                "name": "Stripe"
              },
              "jobLocation": {
                "@type": "Place",
                "address": {
                  "addressLocality": "San Francisco",
                  "addressRegion": "CA"
                }
              },
              "baseSalary": {
                "@type": "MonetaryAmount",
                "currency": "USD",
                "value": {
                  "minValue": 170000,
                  "maxValue": 210000,
                  "unitText": "YEAR"
                }
              },
              "description": "<p>Build high performance financial infrastructure.</p>"
            }
          </script>
        </head>
        <body>
          <main>
            <p>Build high performance financial infrastructure.</p>
          </main>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200 })));

    const data = await scrapeHtmlWithCheerio('https://stripe.com/jobs/123');
    expect(data.title).toBe('Senior Frontend Engineer');
    expect(data.jsonLd).toBeDefined();
    expect(data.jsonLd.company).toBe('Stripe');
    expect(data.jsonLd.location).toBe('San Francisco, CA');
    expect(data.jsonLd.salary).toBe('$170k - $210k');
    expect(data.cleanedText).toContain('financial infrastructure');
  });

  it('extracts embedded job data from __NEXT_DATA__ SPA hydration state', async () => {
    const nextData = {
      props: {
        pageProps: {
          job: {
            title: 'Staff Platform Architect',
            description: 'Lead the next generation cloud distributed runtime architecture.',
            company: 'TechFlow',
          },
        },
      },
    };

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Careers at TechFlow</title>
          <script id="__NEXT_DATA__" type="application/json">
            ${JSON.stringify(nextData)}
          </script>
        </head>
        <body>
          <div id="__next"></div>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200 })));

    const data = await scrapeHtmlWithCheerio('https://techflow.io/careers/staff-platform');
    expect(data.spaState).toBeDefined();
    expect(data.spaState.title).toBe('Staff Platform Architect');
    expect(data.cleanedText).toContain('cloud distributed runtime architecture');
  });

  it('extracts embedded job data from window.__INITIAL_STATE__ script block', async () => {
    const initialState = {
      posting: {
        jobTitle: 'Lead Product Designer',
        jobDescription: 'Shape our core mobile application experience from zero to one.',
      },
    };

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Product Design Opening</title>
          <script>
            window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};
          </script>
        </head>
        <body>
          <div id="app"></div>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { status: 200 })));

    const data = await scrapeHtmlWithCheerio('https://designco.com/jobs/designer');
    expect(data.spaState).toBeDefined();
    expect(data.spaState.jobTitle).toBe('Lead Product Designer');
    expect(data.cleanedText).toContain('Shape our core mobile application');
  });

  it('detects embedded Greenhouse and Ashby script/iframe tags', async () => {
    // Greenhouse embed
    const ghHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Careers</title></head>
        <body>
          <script src="https://boards.greenhouse.io/embed/job_board/js?for=figma"></script>
          <iframe src="https://boards.greenhouse.io/embed/job_app?for=figma&token=123456"></iframe>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(ghHtml, { status: 200 })));
    const ghData = await scrapeHtmlWithCheerio('https://figma.com/careers/job/123456');
    expect(ghData.detectedAts).toEqual({
      type: 'greenhouse',
      board: 'figma',
      jobId: '123456',
    });

    // Ashby embed
    const ashbyHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Careers</title></head>
        <body>
          <iframe src="https://jobs.ashbyhq.com/linear/3f9e2c1a-1b2c-4d5e-8f90-123456789abc"></iframe>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(ashbyHtml, { status: 200 })));
    const ashbyData = await scrapeHtmlWithCheerio('https://linear.app/careers/engineer');
    expect(ashbyData.detectedAts).toEqual({
      type: 'ashby',
      board: 'linear',
      jobId: '3f9e2c1a-1b2c-4d5e-8f90-123456789abc',
    });
  });

  it('unwraps iCIMS iframe to retrieve inner job posting and JSON-LD', async () => {
    const outerHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Careers at Enterprise</title></head>
        <body>
          <iframe id="icims_content_iframe" src="https://enterprise-jobs.icims.com/jobs/9876/staff-engineer/job?in_iframe=1"></iframe>
        </body>
      </html>
    `;

    const innerHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Staff Engineer - Enterprise</title>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "title": "Staff Cloud Engineer",
              "hiringOrganization": { "name": "Enterprise Holdings" },
              "jobLocation": { "address": { "addressLocality": "Austin", "addressRegion": "TX" } }
            }
          </script>
        </head>
        <body>
          <div class="iCIMS_JobContent">
            <h2>Position Overview</h2>
            <p>Architect robust multi-region hybrid cloud deployments for enterprise scale.</p>
          </div>
        </body>
      </html>
    `;

    const fetchMock = vi.fn(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('in_iframe=1')) {
        return new Response(innerHtml, { status: 200 });
      }
      return new Response(outerHtml, { status: 200 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const data = await scrapeHtmlWithCheerio('https://enterprise-jobs.icims.com/jobs/9876/staff-engineer/job');
    expect(data.jsonLd).toBeDefined();
    expect(data.jsonLd.title).toBe('Staff Cloud Engineer');
    expect(data.jsonLd.company).toBe('Enterprise Holdings');
    expect(data.jsonLd.location).toBe('Austin, TX');
    expect(data.cleanedText).toContain('multi-region hybrid cloud deployments');
  });
});
