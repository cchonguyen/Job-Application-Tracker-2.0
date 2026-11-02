import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BambooHrProvider } from '../bamboohr.provider.ts';
import { PinpointProvider } from '../pinpoint.provider.ts';
import { RecruiteeProvider } from '../recruitee.provider.ts';
import { SmartRecruitersProvider } from '../smartrecruiters.provider.ts';
import { WorkdayProvider } from '../workday.provider.ts';
import { DiagnosticStep } from '../../types.ts';
import { JobParsingEngine } from '../../index.ts';

vi.mock('../../ai/geminiExtractor.ts', () => ({
  extractWithGemini: vi.fn(),
  extractWithUrlContext: vi.fn(),
}));

import { extractWithGemini } from '../../ai/geminiExtractor.ts';

describe('New ATS Providers (Slice 3)', () => {
  beforeEach(() => {
    vi.mocked(extractWithGemini).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('SmartRecruitersProvider', () => {
    const provider = new SmartRecruitersProvider();

    it('canHandle validates atsInfo correctly', () => {
      expect(provider.canHandle('https://jobs.smartrecruiters.com/Visa/12345', {
        type: 'smartrecruiters',
        board: 'Visa',
        jobId: '12345',
      })).toBe(true);

      expect(provider.canHandle('https://jobs.smartrecruiters.com/Visa/12345', {
        type: 'greenhouse',
        board: 'Visa',
        jobId: '12345',
      })).toBe(false);

      expect(provider.canHandle('https://jobs.smartrecruiters.com/Visa', {
        type: 'smartrecruiters',
        board: 'Visa',
      })).toBe(false);
    });

    it('fetches from correct API URL and succeeds with Gemini synthesis', async () => {
      const payload = {
        name: 'Staff Software Engineer',
        company: { name: 'Visa' },
        location: { city: 'Austin', region: 'TX', country: 'US', remote: true },
        department: { label: 'Engineering' },
        typeOfEmployment: { label: 'Full-time' },
        compensation: { min: 180000, max: 220000, currency: 'USD' },
        jobAd: {
          sections: {
            jobDescription: { title: 'Job Description', text: '<p>Build payment networks.</p>' },
          },
        },
      };

      let requestedUrl = '';
      const fetchMock = vi.fn(async (url: any) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });
      vi.stubGlobal('fetch', fetchMock);

      vi.mocked(extractWithGemini).mockResolvedValue({
        company: 'Visa',
        jobTitle: 'Staff Software Engineer',
        location: 'Austin, TX, US (Remote)',
      } as any);

      const steps: DiagnosticStep[] = [];
      const result = await provider.extract(
        'https://jobs.smartrecruiters.com/Visa/12345',
        { type: 'smartrecruiters', board: 'Visa', jobId: '12345' },
        steps
      );

      expect(requestedUrl).toBe('https://api.smartrecruiters.com/v1/companies/Visa/postings/12345');
      expect(result.tierUsed).toBe('ATS API (SmartRecruiters)');
      expect(result.extractedData.company).toBe('Visa');
      expect(steps[0].status).toBe('success');
      expect(steps[1].status).toBe('success');
    });

    it('falls back to deterministic parsing when Gemini fails', async () => {
      const payload = {
        name: 'Senior Frontend Developer',
        company: { name: 'Acme Corp' },
        location: { city: 'San Francisco', region: 'CA', country: 'US', remote: false },
        department: { label: 'Product' },
        typeOfEmployment: { label: 'Full-time' },
        compensation: { min: 150000, max: 180000, currency: 'USD' },
        jobAd: {
          sections: {
            jobDescription: { title: 'Role', text: '<p>Lead our UI team in building modern web apps.</p>' },
          },
        },
      };

      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
      vi.mocked(extractWithGemini).mockRejectedValue(new Error('Gemini quota exceeded'));

      const steps: DiagnosticStep[] = [];
      const result = await provider.extract(
        'https://jobs.smartrecruiters.com/AcmeCorp/999',
        { type: 'smartrecruiters', board: 'AcmeCorp', jobId: '999' },
        steps
      );

      expect(result.tierUsed).toBe('Direct ATS API (SmartRecruiters)');
      expect(result.extractedData.company).toBe('Acme Corp');
      expect(result.extractedData.jobTitle).toBe('Senior Frontend Developer');
      expect(result.extractedData.location).toBe('San Francisco, CA, US');
      expect(result.extractedData.salary).toBe('150k - 180k');
      expect(result.extractedData.salaryMin).toBe(150000);
      expect(result.extractedData.salaryMax).toBe(180000);
      expect(result.extractedData.positionMetadata?.seniority).toBe('Senior');
      expect(result.extractedData.positionMetadata?.department).toBe('Product');
    });

    it('throws error when API returns non-200', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));

      const steps: DiagnosticStep[] = [];
      await expect(
        provider.extract(
          'https://jobs.smartrecruiters.com/BadCompany/000',
          { type: 'smartrecruiters', board: 'BadCompany', jobId: '000' },
          steps
        )
      ).rejects.toThrow('SmartRecruiters API responded with HTTP 404');
    });
  });

  describe('RecruiteeProvider', () => {
    const provider = new RecruiteeProvider();

    it('canHandle validates correctly', () => {
      expect(provider.canHandle('https://tacobell.recruitee.com/o/lead-architect', {
        type: 'recruitee',
        board: 'tacobell',
        jobId: 'lead-architect',
      })).toBe(true);

      expect(provider.canHandle('https://tacobell.recruitee.com/o/lead-architect', {
        type: 'lever',
        board: 'tacobell',
        jobId: 'lead-architect',
      })).toBe(false);
    });

    it('fetches from correct API URL and succeeds with Gemini synthesis', async () => {
      const payload = {
        offer: {
          title: 'Full Stack Engineer',
          company_name: 'Hotjar',
          location: 'Remote',
          city: 'London',
          country: 'United Kingdom',
          remote: true,
          description: '<p>Build scalable analytics tools.</p>',
          min_salary: 90000,
          max_salary: 110000,
          currency: 'GBP',
        },
      };

      let requestedUrl = '';
      vi.stubGlobal('fetch', vi.fn(async (url: any) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify(payload), { status: 200 });
      }));

      vi.mocked(extractWithGemini).mockResolvedValue({
        company: 'Hotjar',
        jobTitle: 'Full Stack Engineer',
        location: 'Remote',
      } as any);

      const steps: DiagnosticStep[] = [];
      const result = await provider.extract(
        'https://hotjar.recruitee.com/o/full-stack-engineer',
        { type: 'recruitee', board: 'hotjar', jobId: 'full-stack-engineer' },
        steps
      );

      expect(requestedUrl).toBe('https://hotjar.recruitee.com/api/offers/full-stack-engineer');
      expect(result.tierUsed).toBe('ATS API (Recruitee)');
      expect(result.extractedData.company).toBe('Hotjar');
    });

    it('falls back to deterministic parsing when Gemini fails', async () => {
      const payload = {
        offer: {
          title: 'Lead Mobile Developer',
          company_name: 'Deliveroo',
          city: 'London',
          country: 'UK',
          hybrid: true,
          description: '<p>Lead our iOS and Android team. Salary: $130,000 - $160,000</p>',
          min_salary: 130000,
          max_salary: 160000,
          currency: 'USD',
          department: 'Mobile',
          employment_type_code: 'Full-time',
        },
      };

      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
      vi.mocked(extractWithGemini).mockRejectedValue(new Error('AI unavailable'));

      const steps: DiagnosticStep[] = [];
      const result = await provider.extract(
        'https://deliveroo.recruitee.com/o/lead-mobile-dev',
        { type: 'recruitee', board: 'deliveroo', jobId: 'lead-mobile-dev' },
        steps
      );

      expect(result.tierUsed).toBe('Direct ATS API (Recruitee)');
      expect(result.extractedData.company).toBe('Deliveroo');
      expect(result.extractedData.jobTitle).toBe('Lead Mobile Developer');
      expect(result.extractedData.location).toBe('London, UK (Hybrid)');
      expect(result.extractedData.salary).toBe('130k - 160k');
      expect(result.extractedData.salaryMin).toBe(130000);
      expect(result.extractedData.salaryMax).toBe(160000);
      expect(result.extractedData.positionMetadata?.seniority).toBe('Senior');
      expect(result.extractedData.positionMetadata?.department).toBe('Mobile');
    });

    it('throws error when API call fails', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('Internal Server Error', { status: 500 })));

      const steps: DiagnosticStep[] = [];
      await expect(
        provider.extract(
          'https://error.recruitee.com/o/test',
          { type: 'recruitee', board: 'error', jobId: 'test' },
          steps
        )
      ).rejects.toThrow('Recruitee API responded with HTTP 500');
    });
  });

  describe('PinpointProvider', () => {
    const provider = new PinpointProvider();

    it('canHandle validates correctly', () => {
      expect(provider.canHandle('https://blend.pinpointhq.com/postings/abc-123', {
        type: 'pinpoint',
        board: 'blend',
        jobId: 'abc-123',
      })).toBe(true);

      expect(provider.canHandle('https://blend.pinpointhq.com/postings/abc-123', {
        type: 'workday',
        board: 'blend',
        jobId: 'abc-123',
      })).toBe(false);
    });

    it('fetches from correct API URL (.json) and succeeds with Gemini synthesis', async () => {
      const payload = {
        data: {
          title: 'Senior DevOps Engineer',
          description: '<p>Automate AWS infrastructure using Terraform and Kubernetes.</p>',
          location: { name: 'New York, NY' },
          workplace_type: 'remote',
          compensation_minimum: 160000,
          compensation_maximum: 195000,
          company: { name: 'Blend' },
        },
      };

      let requestedUrl = '';
      vi.stubGlobal('fetch', vi.fn(async (url: any) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify(payload), { status: 200 });
      }));

      vi.mocked(extractWithGemini).mockResolvedValue({
        company: 'Blend',
        jobTitle: 'Senior DevOps Engineer',
        location: 'New York, NY (Remote)',
      } as any);

      const steps: DiagnosticStep[] = [];
      const result = await provider.extract(
        'https://blend.pinpointhq.com/postings/abc-123',
        { type: 'pinpoint', board: 'blend', jobId: 'abc-123' },
        steps
      );

      expect(requestedUrl).toBe('https://blend.pinpointhq.com/postings/abc-123.json');
      expect(result.tierUsed).toBe('ATS API (Pinpoint)');
      expect(result.extractedData.company).toBe('Blend');
    });

    it('falls back to deterministic parsing when Gemini fails', async () => {
      const payload = {
        data: {
          title: 'Principal Security Architect',
          description: '<p>Lead cloud security architecture across global infrastructure.</p>',
          location: { name: 'Seattle, WA' },
          workplace_type: 'onsite',
          compensation_minimum: 210000,
          compensation_maximum: 250000,
          department: { name: 'InfoSec' },
          employment_type: 'Full-time',
        },
      };

      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
      vi.mocked(extractWithGemini).mockRejectedValue(new Error('Rate limited'));

      const steps: DiagnosticStep[] = [];
      const result = await provider.extract(
        'https://acme.pinpointhq.com/postings/sec-456',
        { type: 'pinpoint', board: 'acme', jobId: 'sec-456' },
        steps
      );

      expect(result.tierUsed).toBe('Direct ATS API (Pinpoint)');
      expect(result.extractedData.company).toBe('Acme');
      expect(result.extractedData.jobTitle).toBe('Principal Security Architect');
      expect(result.extractedData.location).toBe('Seattle, WA');
      expect(result.extractedData.salary).toBe('210k - 250k');
      expect(result.extractedData.positionMetadata?.department).toBe('InfoSec');
      expect(result.extractedData.positionMetadata?.seniority).toBe('Senior');
    });

    it('throws error when API returns non-200', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })));

      const steps: DiagnosticStep[] = [];
      await expect(
        provider.extract(
          'https://locked.pinpointhq.com/postings/xyz',
          { type: 'pinpoint', board: 'locked', jobId: 'xyz' },
          steps
        )
      ).rejects.toThrow('Pinpoint API responded with HTTP 403');
    });
  });

  describe('BambooHrProvider', () => {
    const provider = new BambooHrProvider();

    it('canHandle validates correctly', () => {
      expect(provider.canHandle('https://gitlab.bamboohr.com/careers/55', {
        type: 'bamboohr',
        board: 'gitlab',
        jobId: '55',
      })).toBe(true);

      expect(provider.canHandle('https://gitlab.bamboohr.com/careers/55', {
        type: 'greenhouse',
        board: 'gitlab',
        jobId: '55',
      })).toBe(false);
    });

    it('fetches from correct API URL and succeeds with Gemini synthesis', async () => {
      const payload = {
        result: {
          jobOpening: {
            jobOpeningName: 'Site Reliability Engineer',
            departmentLabel: 'Infrastructure',
            location: { city: 'Denver', state: 'CO' },
            employmentStatusLabel: 'Full-time',
            description: '<p>Manage Kubernetes clusters and observability pipelines.</p>',
            compensation: '$140,000 - $165,000 / year',
          },
        },
      };

      let requestedUrl = '';
      vi.stubGlobal('fetch', vi.fn(async (url: any) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify(payload), { status: 200 });
      }));

      vi.mocked(extractWithGemini).mockResolvedValue({
        company: 'Gitlab',
        jobTitle: 'Site Reliability Engineer',
        location: 'Denver, CO',
      } as any);

      const steps: DiagnosticStep[] = [];
      const result = await provider.extract(
        'https://gitlab.bamboohr.com/careers/55',
        { type: 'bamboohr', board: 'gitlab', jobId: '55' },
        steps
      );

      expect(requestedUrl).toBe('https://gitlab.bamboohr.com/careers/55/detail');
      expect(result.tierUsed).toBe('ATS API (BambooHR)');
      expect(result.extractedData.jobTitle).toBe('Site Reliability Engineer');
    });

    it('falls back to deterministic parsing when Gemini fails', async () => {
      const payload = {
        result: {
          jobOpening: {
            jobOpeningName: 'Engineering Manager',
            departmentLabel: 'Engineering',
            location: { city: 'Austin', state: 'TX' },
            employmentStatusLabel: 'Full-time',
            description: '<p>Lead 2 squads of backend engineers.</p>',
            compensation: '$180,000 - $210,000',
          },
        },
      };

      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
      vi.mocked(extractWithGemini).mockRejectedValue(new Error('Gemini timeout'));

      const steps: DiagnosticStep[] = [];
      const result = await provider.extract(
        'https://innovate.bamboohr.com/careers/77',
        { type: 'bamboohr', board: 'innovate', jobId: '77' },
        steps
      );

      expect(result.tierUsed).toBe('Direct ATS API (BambooHR)');
      expect(result.extractedData.company).toBe('Innovate');
      expect(result.extractedData.jobTitle).toBe('Engineering Manager');
      expect(result.extractedData.location).toBe('Austin, TX');
      expect(result.extractedData.salary).toBe('180k - 210k');
      expect(result.extractedData.salaryMin).toBe(180000);
      expect(result.extractedData.salaryMax).toBe(210000);
      expect(result.extractedData.positionMetadata?.department).toBe('Engineering');
      expect(result.extractedData.positionMetadata?.seniority).toBe('Senior');
    });

    it('throws error when API call fails', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));

      const steps: DiagnosticStep[] = [];
      await expect(
        provider.extract(
          'https://bad.bamboohr.com/careers/0',
          { type: 'bamboohr', board: 'bad', jobId: '0' },
          steps
        )
      ).rejects.toThrow('BambooHR API responded with HTTP 404');
    });
  });

  describe('WorkdayProvider', () => {
    const provider = new WorkdayProvider();

    it('canHandle validates board, site, and jobId', () => {
      expect(provider.canHandle('https://target.wd1.myworkdayjobs.com/target_careers/job/R123', {
        type: 'workday',
        board: 'target',
        site: 'target_careers',
        jobId: 'R123',
      })).toBe(true);

      expect(provider.canHandle('https://target.wd1.myworkdayjobs.com/target_careers/job/R123', {
        type: 'workday',
        board: 'target',
        // missing site
        jobId: 'R123',
      })).toBe(false);

      expect(provider.canHandle('https://target.wd1.myworkdayjobs.com/target_careers/job/R123', {
        type: 'workday',
        board: 'target',
        site: 'target_careers',
        // missing jobId
      })).toBe(false);
    });

    it('constructs correct endpoint with default datacenter (wd1) and custom datacenter', async () => {
      const payload = {
        jobPostingInfo: {
          title: 'Lead Software Engineer',
          location: 'Minneapolis, MN',
          additionalLocations: ['Remote - US'],
          timeType: 'Full time',
          jobReqId: 'REQ-100',
          jobDescription: '<p>Lead cloud initiatives. Pay: $150,000 - $180,000 / yr</p>',
        },
      };

      let requestedUrl = '';
      vi.stubGlobal('fetch', vi.fn(async (url: any) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify(payload), { status: 200 });
      }));

      vi.mocked(extractWithGemini).mockResolvedValue({
        company: 'Target',
        jobTitle: 'Lead Software Engineer',
        location: 'Minneapolis, MN, Remote - US',
      } as any);

      // 1. Default datacenter
      const steps1: DiagnosticStep[] = [];
      await provider.extract(
        'https://target.myworkdayjobs.com/target_careers/job/REQ-100',
        { type: 'workday', board: 'target', site: 'target_careers', jobId: 'REQ-100' },
        steps1
      );
      expect(requestedUrl).toBe('https://target.wd1.myworkdayjobs.com/wday/cxs/target/target_careers/job/REQ-100');

      // 2. Custom datacenter wd5
      const steps2: DiagnosticStep[] = [];
      await provider.extract(
        'https://target.wd5.myworkdayjobs.com/target_careers/job/REQ-100',
        { type: 'workday', board: 'target', datacenter: 'wd5', site: 'target_careers', jobId: 'REQ-100' },
        steps2
      );
      expect(requestedUrl).toBe('https://target.wd5.myworkdayjobs.com/wday/cxs/target/target_careers/job/REQ-100');
    });

    it('falls back to deterministic parsing when Gemini fails', async () => {
      const payload = {
        jobPostingInfo: {
          title: 'Staff Platform Engineer',
          location: 'Chicago, IL',
          timeType: 'Full time',
          jobDescription: '<p>Build core platform services. Salary range: $170,000 - $210,000 / year.</p>',
        },
      };

      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
      vi.mocked(extractWithGemini).mockRejectedValue(new Error('AI inference error'));

      const steps: DiagnosticStep[] = [];
      const result = await provider.extract(
        'https://walmart.wd1.myworkdayjobs.com/walmart_careers/job/WD-999',
        { type: 'workday', board: 'walmart', site: 'walmart_careers', jobId: 'WD-999' },
        steps
      );

      expect(result.tierUsed).toBe('Direct ATS API (Workday)');
      expect(result.extractedData.company).toBe('Walmart');
      expect(result.extractedData.jobTitle).toBe('Staff Platform Engineer');
      expect(result.extractedData.location).toBe('Chicago, IL');
      expect(result.extractedData.salary).toBe('170k - 210k');
      expect(result.extractedData.salaryMin).toBe(170000);
      expect(result.extractedData.salaryMax).toBe(210000);
      expect(result.extractedData.positionMetadata?.seniority).toBe('Senior');
    });

    it('cleanly throws when Workday returns 403 or 404 to allow cascading to Tier 2', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('Blocked by Cloudflare Turnstile', { status: 403 })));

      const steps: DiagnosticStep[] = [];
      await expect(
        provider.extract(
          'https://nvidia.wd1.myworkdayjobs.com/nvidia_careers/job/JR1234',
          { type: 'workday', board: 'nvidia', site: 'nvidia_careers', jobId: 'JR1234' },
          steps
        )
      ).rejects.toThrow('Workday CXS API responded with HTTP 403');
    });
  });

  describe('JobParsingEngine Registration & Diagnostic Messages', () => {
    it('registers all 5 new providers in default engine instance', () => {
      const engine = new JobParsingEngine();
      const providers = (engine as any).providers;

      const providerNames = providers.map((p: any) => p.name);
      expect(providerNames).toContain('Greenhouse');
      expect(providerNames).toContain('Lever');
      expect(providerNames).toContain('Workable');
      expect(providerNames).toContain('Ashby');
      expect(providerNames).toContain('SmartRecruiters');
      expect(providerNames).toContain('Recruitee');
      expect(providerNames).toContain('Pinpoint');
      expect(providerNames).toContain('BambooHR');
      expect(providerNames).toContain('Workday');
    });

    it('cascades from Workday CXS failure to Tier 2 cleanly', async () => {
      const engine = new JobParsingEngine();

      // Mock fetch: first call to Workday CXS fails with 403, second call (Tier 2 cheerio) returns HTML with JSON-LD
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/wday/cxs/')) {
            return new Response('Forbidden', { status: 403 });
          }
          return new Response(
            `<html>
              <head>
                <script type="application/ld+json">
                  {
                    "@context": "https://schema.org",
                    "@type": "JobPosting",
                    "title": "Principal Architect",
                    "hiringOrganization": { "@type": "Organization", "name": "Workday Tenant Corp" },
                    "jobLocation": { "address": { "addressLocality": "San Jose", "addressRegion": "CA" } },
                    "description": "Lead architecture"
                  }
                </script>
              </head>
              <body><h1>Principal Architect</h1></body>
            </html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
          );
        })
      );

      vi.mocked(extractWithGemini).mockResolvedValue({
        company: 'Workday Tenant Corp',
        jobTitle: 'Principal Architect',
        location: 'San Jose, CA',
      } as any);

      const targetUrl = 'https://tenant.wd1.myworkdayjobs.com/tenant_careers/job/R-1234';
      const result = await engine.extract(targetUrl);

      // Verify diagnostic steps captured the Tier 1 failure and proceeded to Tier 2
      const workdayStep = result.diagnosticSteps.find((s) => s.name === 'Tier 1: Workday CXS API');
      expect(workdayStep).toBeDefined();
      expect(workdayStep?.status).toBe('failed');
      expect(workdayStep?.details).toContain('Workday API call failed: Workday CXS API responded with HTTP 403');

      // Verify Tier 2 Cheerio scraper ran
      const cheerioStep = result.diagnosticSteps.find((s) => s.tier.includes('Tier 2'));
      expect(cheerioStep).toBeDefined();
      expect(cheerioStep?.status).toBe('success');
    });
  });
});
