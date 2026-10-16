import { describe, expect, it } from 'vitest';
import {
  normalizeCompany,
  isCompanyMatch,
  normalizeRole,
  isRoleMatch,
  isAppliedWithinPastMonths,
  findPastSixMonthsDuplicates,
  normalizeJobUrl,
  atsCompanySlug,
  formatTimeAgo,
} from '../duplicateDetection';
import type { JobRecord } from '../../types';

describe('duplicateDetection', () => {
  const refDate = new Date('2026-10-06T12:00:00Z');

  describe('normalizeCompany & isCompanyMatch', () => {
    it('normalizes corporate suffixes and casing', () => {
      expect(normalizeCompany('Stripe, Inc.')).toBe('stripe');
      expect(normalizeCompany('Airbnb LLC')).toBe('airbnb');
      expect(normalizeCompany('The New York Times Company')).toBe('new york times');
      expect(normalizeCompany('Veeva Systems')).toBe('veeva');
    });

    it('matches companies with legal suffixes', () => {
      expect(isCompanyMatch('Stripe', 'Stripe, Inc.')).toBe(true);
      expect(isCompanyMatch('Airbnb LLC', 'Airbnb')).toBe(true);
      expect(isCompanyMatch('Google', 'Google LLC')).toBe(true);
      expect(isCompanyMatch('Veeva Systems', 'Veeva')).toBe(true);
      expect(isCompanyMatch('Mavenclinic', 'Maven Clinic')).toBe(true);
    });

    it('tolerates small spelling differences in longer names', () => {
      expect(isCompanyMatch('Maven Clinc', 'Maven Clinic')).toBe(true);
      expect(isCompanyMatch('Open AI', 'OpenAI, Inc.')).toBe(true);
      expect(isCompanyMatch('Databricks', 'Databrick')).toBe(true);
      expect(isCompanyMatch('Atlassian', 'Atlasian')).toBe(true);
    });

    it('keeps short, similar names distinct', () => {
      expect(isCompanyMatch('Stripe', 'Strive')).toBe(false);
      expect(isCompanyMatch('Lyft', 'Lift')).toBe(false);
      expect(isCompanyMatch('Atticus', 'Mavenclinic')).toBe(false);
    });

    it('never matches placeholder company names', () => {
      expect(isCompanyMatch('Unknown', 'Unknown')).toBe(false);
      expect(isCompanyMatch('Unknown Company', 'Unknown')).toBe(false);
    });

    it('rejects completely different companies', () => {
      expect(isCompanyMatch('Apple', 'Applied Materials')).toBe(false);
      expect(isCompanyMatch('Microsoft', 'MicroStrategy')).toBe(false);
      expect(isCompanyMatch('Amazon', 'Target')).toBe(false);
    });
  });

  describe('normalizeRole & isRoleMatch', () => {
    it('normalizes role title by removing noise brackets', () => {
      expect(normalizeRole('Senior Software Engineer (Remote)')).toBe('senior software engineer');
      expect(normalizeRole('Staff Product Manager [Hybrid - US]')).toBe('staff product manager');
    });

    it('matches identical and minor variant roles', () => {
      expect(
        isRoleMatch('Senior Software Engineer', 'Senior Software Engineer (Remote)')
      ).toBe(true);
      expect(
        isRoleMatch('Staff Product Manager', 'Staff Product Manager')
      ).toBe(true);
      expect(
        isRoleMatch('Product Manager', 'Chief Financial Officer')
      ).toBe(false);
    });

    it('matches a title with a team suffix and expands abbreviations', () => {
      expect(isRoleMatch('Senior Product Manager', 'Senior Product Manager - Care Delivery')).toBe(true);
      expect(isRoleMatch('Sr. Product Manager', 'Senior Product Manager')).toBe(true);
    });

    it('matches reordered or reworded titles', () => {
      expect(isRoleMatch('Product Manager, Growth', 'Growth Product Manager')).toBe(true);
      expect(isRoleMatch('Software Developer', 'Software Engineer')).toBe(true);
      expect(isRoleMatch('Senior Product Manger', 'Senior Product Manager')).toBe(true);
      expect(isRoleMatch('Director of Product Management', 'Director, Product Management')).toBe(true);
    });

    it('treats different seniority or different teams as different roles', () => {
      expect(isRoleMatch('Product Manager', 'Senior Product Manager')).toBe(false);
      expect(isRoleMatch('Software Engineer II', 'Software Engineer III')).toBe(false);
      expect(isRoleMatch('Product Manager, Growth', 'Product Manager, Payments')).toBe(false);
      expect(isRoleMatch('Data Engineer', 'Data Engineering Manager')).toBe(false);
    });
  });

  describe('atsCompanySlug', () => {
    it('reads the company from hosted job board URLs', () => {
      expect(atsCompanySlug('https://job-boards.greenhouse.io/mavenclinic/jobs/88')).toBe('mavenclinic');
      expect(atsCompanySlug('https://jobs.ashbyhq.com/atticus/67f7fa65')).toBe('atticus');
      expect(atsCompanySlug('https://jobs.lever.co/acme/abc')).toBe('acme');
      expect(atsCompanySlug('https://acme.wd5.myworkdayjobs.com/x')).toBe('');
      expect(atsCompanySlug('https://example.com/careers/1')).toBe('');
    });
  });

  describe('normalizeJobUrl', () => {
    it('ignores protocol, www, tracking params, fragments and trailing slashes', () => {
      expect(normalizeJobUrl('https://www.example.com/jobs/123/?utm_source=linkedin#apply')).toBe(
        'example.com/jobs/123'
      );
      expect(normalizeJobUrl('http://example.com/jobs/123')).toBe('example.com/jobs/123');
    });

    it('keeps query params that identify the job', () => {
      expect(normalizeJobUrl('https://acme.com/careers?gh_jid=42&utm_source=x')).toBe('acme.com/careers?gh_jid=42');
      expect(normalizeJobUrl('https://acme.com/careers?gh_jid=42')).not.toBe(
        normalizeJobUrl('https://acme.com/careers?gh_jid=43')
      );
    });
  });

  describe('isAppliedWithinPastMonths', () => {
    it('returns true for jobs applied within 6 months', () => {
      const recentJob: JobRecord = {
        id: 'job-1',
        company: 'Stripe',
        jobTitle: 'Software Engineer',
        location: 'Remote',
        salary: '$150k',
        status: 'Applied',
        dateApplied: '2026-08-15',
        industry: 'Tech',
        summary: '',
        url: '',
        companyMetadata: {},
        positionMetadata: { requiredSkills: [] },
        createdAt: '2026-08-15T00:00:00Z',
      };
      expect(isAppliedWithinPastMonths(recentJob, 6, refDate)).toBe(true);
    });

    it('returns false for jobs applied 8 months ago', () => {
      const oldJob: JobRecord = {
        id: 'job-2',
        company: 'Stripe',
        jobTitle: 'Software Engineer',
        location: 'Remote',
        salary: '$150k',
        status: 'Applied',
        dateApplied: '2026-01-10', // 9 months ago relative to 2026-10-06
        industry: 'Tech',
        summary: '',
        url: '',
        companyMetadata: {},
        positionMetadata: { requiredSkills: [] },
        createdAt: '2026-01-10T00:00:00Z',
      };
      expect(isAppliedWithinPastMonths(oldJob, 6, refDate)).toBe(false);
    });

    it('returns false for purely Saved jobs with no dateApplied', () => {
      const savedJob: JobRecord = {
        id: 'job-3',
        company: 'Stripe',
        jobTitle: 'Software Engineer',
        location: 'Remote',
        salary: '$150k',
        status: 'Saved',
        dateApplied: null,
        industry: 'Tech',
        summary: '',
        url: '',
        companyMetadata: {},
        positionMetadata: { requiredSkills: [] },
        createdAt: '2026-09-01T00:00:00Z',
      };
      expect(isAppliedWithinPastMonths(savedJob, 6, refDate)).toBe(false);
    });
  });

  describe('findPastSixMonthsDuplicates', () => {
    const existingJobs: JobRecord[] = [
      {
        id: 'job-veeva',
        company: 'Veeva Systems',
        jobTitle: 'Senior Product Manager',
        location: 'Remote (US)',
        salary: '$120,000 - $200,000',
        status: 'Interviewing',
        dateApplied: '2026-09-19', // ~17 days ago
        industry: 'Healthcare Tech',
        summary: '',
        url: 'https://careers.veeva.com/job/123',
        companyMetadata: {},
        positionMetadata: { requiredSkills: [] },
        createdAt: '2026-09-19T00:00:00Z',
      },
      {
        id: 'job-old-meta',
        company: 'Meta',
        jobTitle: 'Staff Software Engineer',
        location: 'Menlo Park, CA',
        salary: '$250k',
        status: 'Rejected',
        dateApplied: '2025-10-01', // 1 year ago (outside 6 months)
        industry: 'Tech',
        summary: '',
        url: 'https://meta.com/job/456',
        companyMetadata: {},
        positionMetadata: { requiredSkills: [] },
        createdAt: '2025-10-01T00:00:00Z',
      },
    ];

    it('flags duplicate company and role applied within 6 months', () => {
      const candidate = {
        company: 'Veeva Systems',
        jobTitle: 'Senior Product Manager',
      };
      const duplicates = findPastSixMonthsDuplicates(candidate, existingJobs, refDate, 6);
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].matchType).toBe('both');
      expect(duplicates[0].existingJob.company).toBe('Veeva Systems');
      expect(duplicates[0].daysAgo).toBe(17);
    });

    it('flags the same company even if role is different', () => {
      const candidate = {
        company: 'Veeva',
        jobTitle: 'Director of Product Management',
      };
      const duplicates = findPastSixMonthsDuplicates(candidate, existingJobs, refDate, 6);
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].matchType).toBe('company');
      expect(duplicates[0].matchedFields).toEqual(['company']);
    });

    it('ranks the same role ahead of other roles at the company', () => {
      const otherRole: JobRecord = {
        ...existingJobs[0],
        id: 'job-veeva-2',
        jobTitle: 'Product Manager',
        dateApplied: '2026-10-05',
        url: 'https://careers.veeva.com/job/999',
      };
      const candidate = { company: 'Veeva', jobTitle: 'Senior Product Manager' };
      const duplicates = findPastSixMonthsDuplicates(candidate, [otherRole, existingJobs[0]], refDate, 6);
      expect(duplicates.map((d) => d.existingJob.id)).toEqual(['job-veeva', 'job-veeva-2']);
      expect(duplicates.map((d) => d.matchType)).toEqual(['both', 'company']);
    });

    it('does not flag the same role at a different company', () => {
      const candidate = {
        company: 'Acme Health',
        jobTitle: 'Senior Product Manager',
      };
      expect(findPastSixMonthsDuplicates(candidate, existingJobs, refDate, 6)).toEqual([]);
    });

    it('flags the same posting URL even when company or title were extracted differently', () => {
      const candidate = {
        company: 'Unknown',
        jobTitle: 'Unknown',
        url: 'https://careers.veeva.com/job/123/?utm_source=linkedin',
      };
      const duplicates = findPastSixMonthsDuplicates(candidate, existingJobs, refDate, 6);
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].existingJob.id).toBe('job-veeva');
      expect(duplicates[0].reason).toContain('same posting');
    });

    it('matches the company through the job board when names were extracted differently', () => {
      const existing: JobRecord = {
        ...existingJobs[0],
        id: 'job-maven',
        company: 'Maven Clinic',
        jobTitle: 'Product Manager',
        url: 'https://job-boards.greenhouse.io/mavenclinic/jobs/1',
      };
      const candidate = {
        company: 'Maven',
        jobTitle: 'Senior Product Manager',
        url: 'https://boards.greenhouse.io/mavenclinic/jobs/2',
      };
      const duplicates = findPastSixMonthsDuplicates(candidate, [existing], refDate, 6);
      expect(duplicates.length).toBe(1);
      expect(duplicates[0].matchType).toBe('company');
    });

    it('does not flag two jobs whose company was never extracted', () => {
      const unknownJob: JobRecord = {
        ...existingJobs[0],
        id: 'job-unknown',
        company: 'Unknown',
        jobTitle: 'Product Manager',
        url: 'https://boards.example.com/a',
      };
      const candidate = { company: 'Unknown', jobTitle: 'Product Manager', url: 'https://boards.example.com/b' };
      expect(findPastSixMonthsDuplicates(candidate, [unknownJob], refDate, 6)).toEqual([]);
    });

    it('does NOT flag jobs applied outside past 6 months', () => {
      const candidate = {
        company: 'Meta Platforms',
        jobTitle: 'Staff Software Engineer',
      };
      const duplicates = findPastSixMonthsDuplicates(candidate, existingJobs, refDate, 6);
      expect(duplicates.length).toBe(0);
    });

    it('does not flag completely distinct jobs', () => {
      const candidate = {
        company: 'Netflix',
        jobTitle: 'Data Engineer',
      };
      const duplicates = findPastSixMonthsDuplicates(candidate, existingJobs, refDate, 6);
      expect(duplicates.length).toBe(0);
    });
  });

  describe('formatTimeAgo', () => {
    it('formats days ago correctly', () => {
      expect(formatTimeAgo(0)).toBe('today');
      expect(formatTimeAgo(1)).toBe('yesterday');
      expect(formatTimeAgo(17)).toBe('17 days ago');
      expect(formatTimeAgo(35)).toBe('1 month ago');
      expect(formatTimeAgo(95)).toBe('3 months ago');
    });
  });
});
