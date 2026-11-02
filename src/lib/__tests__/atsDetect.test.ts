import { describe, expect, it } from 'vitest';
import { canonicalizeJobUrl, detectAts } from '../atsDetect';

describe('atsDetect & canonicalizeJobUrl', () => {
  describe('canonicalizeJobUrl', () => {
    it('unwraps LinkedIn aggregator redirects', () => {
      const wrapped =
        'https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fjobs.lever.co%2Facme%2F12345%2Fapply%3Futm_source%3Dlinkedin';
      const result = canonicalizeJobUrl(wrapped);
      expect(result.canonicalUrl).toBe('https://jobs.lever.co/acme/12345');
      expect(result.unwrappedFrom).toBe(wrapped);
    });

    it('unwraps Indeed rc/clk redirects', () => {
      const wrapped =
        'https://www.indeed.com/rc/clk?jk=12345&dest=https%3A%2F%2Facme.bamboohr.com%2Fcareers%2F67890%2Fapply';
      const result = canonicalizeJobUrl(wrapped);
      expect(result.canonicalUrl).toBe('https://acme.bamboohr.com/careers/67890');
      expect(result.unwrappedFrom).toBe(wrapped);
    });

    it('unwraps Glassdoor partner jobListing redirects', () => {
      const wrapped =
        'https://www.glassdoor.com/partner/jobListing.htm?posUrl=https%3A%2F%2Fjobs.lever.co%2Fdatadog%2F883b1092';
      const result = canonicalizeJobUrl(wrapped);
      expect(result.canonicalUrl).toBe('https://jobs.lever.co/datadog/883b1092');
      expect(result.unwrappedFrom).toBe(wrapped);
    });

    it('rewrites LinkedIn search & collection currentJobId to canonical /jobs/view/{id}', () => {
      const searchUrl =
        'https://www.linkedin.com/jobs/search/?currentJobId=3888888888&geoId=103644278';
      expect(canonicalizeJobUrl(searchUrl).canonicalUrl).toBe(
        'https://www.linkedin.com/jobs/view/3888888888'
      );

      const collectionUrl =
        'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=3999999999&refId=abc';
      expect(canonicalizeJobUrl(collectionUrl).canonicalUrl).toBe(
        'https://www.linkedin.com/jobs/view/3999999999'
      );
    });

    it('rewrites LinkedIn slugged view URLs to canonical /jobs/view/{id}', () => {
      const slugUrl =
        'https://www.linkedin.com/jobs/view/senior-software-engineer-at-acme-3888888888?trk=public_jobs';
      expect(canonicalizeJobUrl(slugUrl).canonicalUrl).toBe(
        'https://www.linkedin.com/jobs/view/3888888888'
      );
    });

    it('rewrites Indeed search vjk to canonical /viewjob?jk={id}', () => {
      const searchUrl =
        'https://www.indeed.com/jobs?q=engineer&l=Remote&vjk=7d8e6f1a9b0c2d3e&utm_campaign=jobsearch';
      expect(canonicalizeJobUrl(searchUrl).canonicalUrl).toBe(
        'https://www.indeed.com/viewjob?jk=7d8e6f1a9b0c2d3e'
      );
    });

    it('rewrites Indeed rc/clk with jk to canonical /viewjob?jk={id} when no dest exists', () => {
      const clkUrl = 'https://www.indeed.com/rc/clk?jk=7d8e6f1a9b0c2d3e&from=vj';
      expect(canonicalizeJobUrl(clkUrl).canonicalUrl).toBe(
        'https://www.indeed.com/viewjob?jk=7d8e6f1a9b0c2d3e'
      );
    });

    it('trims sub-routes like /apply, /application, /apply/start, /c/new, and .md', () => {
      expect(canonicalizeJobUrl('https://jobs.lever.co/acme/12345/apply').canonicalUrl).toBe(
        'https://jobs.lever.co/acme/12345'
      );
      expect(canonicalizeJobUrl('https://jobs.ashbyhq.com/acme/12345/application').canonicalUrl).toBe(
        'https://jobs.ashbyhq.com/acme/12345'
      );
      expect(canonicalizeJobUrl('https://apply.workable.com/acme/j/12345.md').canonicalUrl).toBe(
        'https://apply.workable.com/acme/j/12345'
      );
      expect(
        canonicalizeJobUrl('https://target.myworkdayjobs.com/careers/job/12345/apply/start').canonicalUrl
      ).toBe('https://target.myworkdayjobs.com/careers/job/12345');
      expect(canonicalizeJobUrl('https://acme.bamboohr.com/careers/123/c/new').canonicalUrl).toBe(
        'https://acme.bamboohr.com/careers/123'
      );
    });

    it('strips tracking params while preserving ATS and job identifying params', () => {
      const url =
        'https://company.com/careers/job?gh_jid=12345&utm_source=twitter&utm_medium=social&ref=partner&gclid=xyz&trackingId=999';
      expect(canonicalizeJobUrl(url).canonicalUrl).toBe('https://company.com/careers/job?gh_jid=12345');

      const ashbyUrl =
        'https://company.com/careers?ashby_jid=3b74e8b2-0872&lever-source=ad&fbclid=abc';
      expect(canonicalizeJobUrl(ashbyUrl).canonicalUrl).toBe(
        'https://company.com/careers?ashby_jid=3b74e8b2-0872'
      );
    });
  });

  describe('detectAts Enterprise ATS platforms', () => {
    it('detects Workday with datacenter, tenant, site, and job slug', () => {
      const url =
        'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Santa-Clara/Senior-Architect_JR12345/apply?utm_source=indeed';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'workday',
        board: 'nvidia',
        datacenter: 'wd5',
        site: 'NVIDIAExternalCareerSite',
        jobId: 'Senior-Architect_JR12345',
        canonicalUrl:
          'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Santa-Clara/Senior-Architect_JR12345',
        unwrappedFrom: undefined,
      });
    });

    it('detects Workday without datacenter prefix', () => {
      const url =
        'https://target.myworkdayjobs.com/targetcareers/job/Minneapolis-MN/Software-Engineer_R0001';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'workday',
        board: 'target',
        datacenter: undefined,
        site: 'targetcareers',
        jobId: 'Software-Engineer_R0001',
        canonicalUrl:
          'https://target.myworkdayjobs.com/targetcareers/job/Minneapolis-MN/Software-Engineer_R0001',
        unwrappedFrom: undefined,
      });
    });

    it('detects iCIMS portals', () => {
      const url = 'https://careers-usf.icims.com/jobs/12345/senior-manager/job';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'icims',
        board: 'usf',
        jobId: '12345',
        canonicalUrl: 'https://careers-usf.icims.com/jobs/12345/senior-manager/job',
        unwrappedFrom: undefined,
      });
    });

    it('detects Oracle Cloud HCM portals', () => {
      const url =
        'https://fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions/preview/998877';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'oracle',
        site: 'CX_1',
        jobId: '998877',
        canonicalUrl:
          'https://fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions/preview/998877',
        unwrappedFrom: undefined,
      });
    });

    it('detects Taleo portals', () => {
      const url = 'https://acme.taleo.net/careersection/ex/jobdetail.ftl?job=123456';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'taleo',
        board: 'acme',
        site: 'ex',
        jobId: '123456',
        canonicalUrl: 'https://acme.taleo.net/careersection/ex/jobdetail.ftl?job=123456',
        unwrappedFrom: undefined,
      });
    });

    it('detects SAP SuccessFactors portals', () => {
      const url =
        'https://career4.successfactors.com/career?company=acmeprod&career_job_req_id=776655';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'successfactors',
        board: 'acmeprod',
        jobId: '776655',
        canonicalUrl:
          'https://career4.successfactors.com/career?company=acmeprod&career_job_req_id=776655',
        unwrappedFrom: undefined,
      });
    });
  });

  describe('detectAts Modern Tech ATS platforms', () => {
    it('detects SmartRecruiters', () => {
      const url = 'https://jobs.smartrecruiters.com/Square/12345678-software-engineer';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'smartrecruiters',
        board: 'Square',
        jobId: '12345678-software-engineer',
        canonicalUrl: 'https://jobs.smartrecruiters.com/Square/12345678-software-engineer',
        unwrappedFrom: undefined,
      });
    });

    it('detects BambooHR', () => {
      const url = 'https://acme.bamboohr.com/careers/45';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'bamboohr',
        board: 'acme',
        jobId: '45',
        canonicalUrl: 'https://acme.bamboohr.com/careers/45',
        unwrappedFrom: undefined,
      });
    });

    it('detects Recruitee', () => {
      const url = 'https://acme.recruitee.com/o/senior-developer';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'recruitee',
        board: 'acme',
        jobId: 'senior-developer',
        canonicalUrl: 'https://acme.recruitee.com/o/senior-developer',
        unwrappedFrom: undefined,
      });
    });

    it('detects Pinpoint', () => {
      const url = 'https://acme.pinpointhq.com/postings/d290f1ee-6c54-4b01-90e6-d701748f0851';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'pinpoint',
        board: 'acme',
        jobId: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
        canonicalUrl:
          'https://acme.pinpointhq.com/postings/d290f1ee-6c54-4b01-90e6-d701748f0851',
        unwrappedFrom: undefined,
      });
    });

    it('detects Rippling', () => {
      const url = 'https://ats.rippling.com/acme/jobs/45678';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'rippling',
        board: 'acme',
        jobId: '45678',
        canonicalUrl: 'https://ats.rippling.com/acme/jobs/45678',
        unwrappedFrom: undefined,
      });
    });

    it('detects Dover', () => {
      const url = 'https://app.dover.com/apply/acme/c9876';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'dover',
        board: 'acme',
        jobId: 'c9876',
        canonicalUrl: 'https://app.dover.com/apply/acme/c9876',
        unwrappedFrom: undefined,
      });
    });
  });

  describe('detectAts Mid-Market HRIS & Portals', () => {
    it('detects Breezy HR', () => {
      const url = 'https://acme.breezy.hr/p/12345-lead-designer';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'breezy',
        board: 'acme',
        jobId: '12345-lead-designer',
        canonicalUrl: 'https://acme.breezy.hr/p/12345-lead-designer',
        unwrappedFrom: undefined,
      });
    });

    it('detects Personio', () => {
      const url = 'https://acme.jobs.personio.de/job/76543';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'personio',
        board: 'acme',
        jobId: '76543',
        canonicalUrl: 'https://acme.jobs.personio.de/job/76543',
        unwrappedFrom: undefined,
      });
    });

    it('detects Teamtailor', () => {
      const url = 'https://acme.teamtailor.com/jobs/554433';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'teamtailor',
        board: 'acme',
        jobId: '554433',
        canonicalUrl: 'https://acme.teamtailor.com/jobs/554433',
        unwrappedFrom: undefined,
      });
    });

    it('detects Jobvite', () => {
      const url = 'https://jobs.jobvite.com/acme/job/o12345';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'jobvite',
        board: 'acme',
        jobId: 'o12345',
        canonicalUrl: 'https://jobs.jobvite.com/acme/job/o12345',
        unwrappedFrom: undefined,
      });
    });

    it('detects JazzHR', () => {
      const url = 'https://acme.applytojob.com/apply/abc123xyz';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'jazzhr',
        board: 'acme',
        jobId: 'abc123xyz',
        canonicalUrl: 'https://acme.applytojob.com/apply/abc123xyz',
        unwrappedFrom: undefined,
      });
    });

    it('detects Paylocity', () => {
      const url = 'https://recruiting.paylocity.com/recruiting/jobs/Details/999888/Acme-Corp';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'paylocity',
        board: 'Acme-Corp',
        jobId: '999888',
        canonicalUrl:
          'https://recruiting.paylocity.com/recruiting/jobs/Details/999888/Acme-Corp',
        unwrappedFrom: undefined,
      });
    });
  });

  describe('detectAts Aggregators & Ecosystems', () => {
    it('detects LinkedIn with isAggregator and requiresBrowserAuth', () => {
      const url = 'https://www.linkedin.com/jobs/view/1234567890';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'linkedin',
        jobId: '1234567890',
        isAggregator: true,
        requiresBrowserAuth: true,
        canonicalUrl: 'https://www.linkedin.com/jobs/view/1234567890',
        unwrappedFrom: undefined,
      });
    });

    it('detects Indeed with isAggregator', () => {
      const url = 'https://www.indeed.com/viewjob?jk=abc12345';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'indeed',
        jobId: 'abc12345',
        isAggregator: true,
        canonicalUrl: 'https://www.indeed.com/viewjob?jk=abc12345',
        unwrappedFrom: undefined,
      });
    });

    it('detects Glassdoor with isAggregator and requiresBrowserAuth', () => {
      const url =
        'https://www.glassdoor.com/job-listing/senior-engineer-acme-JV_IC1147401_KO0,15_KE16,20.htm?jl=100998877';
      const result = detectAts(url);
      expect(result.type).toBe('glassdoor');
      expect(result.isAggregator).toBe(true);
      expect(result.requiresBrowserAuth).toBe(true);
    });

    it('detects Wellfound with isAggregator and requiresBrowserAuth', () => {
      const url = 'https://wellfound.com/jobs/12345-software-engineer';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'wellfound',
        isAggregator: true,
        requiresBrowserAuth: true,
        canonicalUrl: 'https://wellfound.com/jobs/12345-software-engineer',
        unwrappedFrom: undefined,
      });
    });

    it('detects BuiltIn with isAggregator', () => {
      const url = 'https://builtin.com/job/engineer/12345';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'builtin',
        isAggregator: true,
        canonicalUrl: 'https://builtin.com/job/engineer/12345',
        unwrappedFrom: undefined,
      });
    });

    it('detects YC Work at a Startup with isAggregator', () => {
      const url = 'https://www.workatastartup.com/jobs/77665';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'yc',
        jobId: '77665',
        isAggregator: true,
        canonicalUrl: 'https://workatastartup.com/jobs/77665',
        unwrappedFrom: undefined,
      });
    });

    it('detects ZipRecruiter with isAggregator', () => {
      const url = 'https://www.ziprecruiter.com/jobs/acme-123/engineer-456';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'ziprecruiter',
        isAggregator: true,
        canonicalUrl: 'https://ziprecruiter.com/jobs/acme-123/engineer-456',
        unwrappedFrom: undefined,
      });
    });
  });

  describe('detectAts Embedded ATS on custom domains', () => {
    it('detects embedded Greenhouse ?gh_jid unconditionally', () => {
      const url = 'https://custom.company.com/careers/role?gh_jid=987654';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'greenhouse',
        board: 'custom',
        jobId: '987654',
        canonicalUrl: 'https://custom.company.com/careers/role?gh_jid=987654',
        unwrappedFrom: undefined,
      });
    });

    it('detects embedded Greenhouse ?gh_jid with explicit for={board}', () => {
      const url = 'https://custom.company.com/careers/role?gh_jid=987654&for=acmeboard';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'greenhouse',
        board: 'acmeboard',
        jobId: '987654',
        canonicalUrl: 'https://custom.company.com/careers/role?gh_jid=987654&for=acmeboard',
        unwrappedFrom: undefined,
      });
    });

    it('detects embedded Ashby ?ashby_jid unconditionally', () => {
      const url =
        'https://custom.company.com/careers/role?ashby_jid=3b74e8b2-0872-48a6-8995-663b944c89aa';
      const result = detectAts(url);
      expect(result).toEqual({
        type: 'ashby',
        board: 'custom',
        jobId: '3b74e8b2-0872-48a6-8995-663b944c89aa',
        canonicalUrl:
          'https://custom.company.com/careers/role?ashby_jid=3b74e8b2-0872-48a6-8995-663b944c89aa',
        unwrappedFrom: undefined,
      });
    });

    it('unwraps redirect and detects underlying ATS platform', () => {
      const wrapped =
        'https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fjobs.lever.co%2Facme%2F12345';
      const result = detectAts(wrapped);
      expect(result).toEqual({
        type: 'lever',
        board: 'acme',
        jobId: '12345',
        canonicalUrl: 'https://jobs.lever.co/acme/12345',
        unwrappedFrom: wrapped,
      });
    });
  });
});
