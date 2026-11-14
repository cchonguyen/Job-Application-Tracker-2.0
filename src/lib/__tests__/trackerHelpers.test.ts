import { describe, expect, it } from 'vitest';
import { detectAts } from '../atsDetect';
import { extractSalaryFromTextOrJson, getBenchmarkSalary } from '../salary';
import { initialDateAppliedForStatus, resolveDateApplied } from '../jobDates';

describe('detectAts', () => {
  it('detects Greenhouse board URLs', () => {
    expect(detectAts('https://boards.greenhouse.io/figma/jobs/5912401')).toEqual({
      type: 'greenhouse',
      board: 'figma',
      jobId: '5912401',
      canonicalUrl: 'https://boards.greenhouse.io/figma/jobs/5912401',
    });
  });

  it('detects Greenhouse embed query params', () => {
    expect(
      detectAts('https://boards.greenhouse.io/embed/job_app?for=acme&token=abc123')
    ).toEqual({
      type: 'greenhouse',
      board: 'acme',
      jobId: 'abc123',
      canonicalUrl: 'https://boards.greenhouse.io/embed/job_app?for=acme&token=abc123',
    });
  });

  it('detects embedded Greenhouse job_id on custom domains', () => {
    expect(
      detectAts(
        'https://www.vandelay.com/about/careers/open-roles/job?job_id=5301310008&gh_src=x'
      )
    ).toEqual({
      type: 'greenhouse',
      board: 'vandelay',
      jobId: '5301310008',
      canonicalUrl: 'https://vandelay.com/about/careers/open-roles/job?job_id=5301310008',
    });
  });

  it('detects Lever posting URLs', () => {
    expect(
      detectAts('https://jobs.lever.co/datadog/883b1092-c419-4cb5-bf9e-e38029d20c54')
    ).toEqual({
      type: 'lever',
      board: 'datadog',
      jobId: '883b1092-c419-4cb5-bf9e-e38029d20c54',
      canonicalUrl: 'https://jobs.lever.co/datadog/883b1092-c419-4cb5-bf9e-e38029d20c54',
    });
  });

  it('detects Darwinbox SPA portals', () => {
    expect(
      detectAts(
        'https://acme.darwinbox.com/ms/candidatev2/main/careers/jobDetails/a6a7106352a0d2'
      )
    ).toEqual({
      type: 'darwinbox',
      board: 'acme',
      jobId: 'a6a7106352a0d2',
      requiresBrowserAuth: true,
      canonicalUrl:
        'https://acme.darwinbox.com/ms/candidatev2/main/careers/jobDetails/a6a7106352a0d2',
    });
  });

  it('detects Workable hosted apply URLs (/j/ shortcode)', () => {
    expect(
      detectAts('https://apply.workable.com/innovaccer-analytics/j/461A138133')
    ).toEqual({
      type: 'workable',
      board: 'innovaccer-analytics',
      jobId: '461A138133',
      canonicalUrl: 'https://apply.workable.com/innovaccer-analytics/j/461A138133',
    });
  });

  it('detects Workable /jobs/view/ markdown URLs', () => {
    expect(
      detectAts('https://apply.workable.com/innovaccer-analytics/jobs/view/461A138133.md')
    ).toEqual({
      type: 'workable',
      board: 'innovaccer-analytics',
      jobId: '461A138133',
      canonicalUrl: 'https://apply.workable.com/innovaccer-analytics/jobs/view/461A138133',
    });
  });

  it('detects Workable custom account subdomains', () => {
    expect(detectAts('https://acme.workable.com/j/ABCDEF1234')).toEqual({
      type: 'workable',
      board: 'acme',
      jobId: 'ABCDEF1234',
      canonicalUrl: 'https://acme.workable.com/j/ABCDEF1234',
    });
  });

  it('detects Ashby posting URLs', () => {
    expect(
      detectAts('https://jobs.ashbyhq.com/Overjet/3b74e8b2-0872-48a6-8995-663b944c89aa')
    ).toEqual({
      type: 'ashby',
      board: 'Overjet',
      jobId: '3b74e8b2-0872-48a6-8995-663b944c89aa',
      canonicalUrl: 'https://jobs.ashbyhq.com/Overjet/3b74e8b2-0872-48a6-8995-663b944c89aa',
    });
  });

  it('returns null for unknown career pages', () => {
    expect(detectAts('https://stripe.com/jobs/listing/staff-engineer/1')).toEqual({
      type: null,
      canonicalUrl: 'https://stripe.com/jobs/listing/staff-engineer/1',
    });
  });

  it('returns null for invalid URLs', () => {
    expect(detectAts('not-a-url')).toEqual({ type: null });
  });
});

describe('extractSalaryFromTextOrJson', () => {
  it('reads salary from JSON-LD baseSalary', () => {
    const res = extractSalaryFromTextOrJson(undefined, {
      baseSalary: {
        currency: 'USD',
        value: { minValue: 150000, maxValue: 170000 },
      },
    });
    expect(res.salary).toBe('150k - 170k');
    expect(res.salaryMin).toBe(150000);
    expect(res.salaryMax).toBe(170000);
  });

  it('parses explicit pay range phrases', () => {
    const res = extractSalaryFromTextOrJson(
      'The base pay range for this position is $150,000 - $170,000 depending on experience.'
    );
    expect(res.salary).toBe('150k - 170k');
    expect(res.salaryMin).toBe(150000);
    expect(res.salaryMax).toBe(170000);
  });

  it('parses general dollar ranges', () => {
    const res = extractSalaryFromTextOrJson('Compensation: $120k to $200k');
    expect(res.salary).toBe('120k - 200k');
    expect(res.salaryMin).toBe(120000);
    expect(res.salaryMax).toBe(200000);
  });

  it('parses hourly ranges', () => {
    const res = extractSalaryFromTextOrJson('Rate: $45 - $65 / hr');
    expect(res.salary).toBe('45k - 65k');
  });

  it('does not fall back to synthetic benchmark salary (zero-fabrication)', () => {
    expect(getBenchmarkSalary('Vandelay', 'Sr. Product Manager')).toContain('170k');
    const res = extractSalaryFromTextOrJson('No pay listed', null, 'Vandelay', 'Product Manager');
    expect(res.salary).toBe('Not listed');
    expect(res.salaryMin).toBeNull();
    expect(res.salaryMax).toBeNull();
  });

  it('returns Not listed when nothing matches', () => {
    const res = extractSalaryFromTextOrJson('Join our team building great products.');
    expect(res.salary).toBe('Not listed');
    expect(res.salaryMin).toBeNull();
    expect(res.salaryMax).toBeNull();
  });
});

describe('resolveDateApplied / PATCH date rules', () => {
  const now = new Date('2026-09-21T12:00:00.000Z');

  it('sets today when creating an Applied record', () => {
    expect(initialDateAppliedForStatus('Applied', now)).toBe('2026-09-21');
  });

  it('leaves date null for non-Applied initial statuses', () => {
    expect(initialDateAppliedForStatus('Saved', now)).toBeNull();
    expect(initialDateAppliedForStatus('Interviewing', now)).toBeNull();
  });

  it('keeps dateApplied when moving from Applied to Interviewing', () => {
    expect(
      resolveDateApplied({
        previousDate: '2026-09-19',
        previousStatus: 'Applied',
        nextStatus: 'Interviewing',
        now,
      })
    ).toBe('2026-09-19');
  });

  it('keeps dateApplied through Offer, Accepted, Rejected, and Declined', () => {
    for (const nextStatus of ['Offer', 'Accepted', 'Rejected', 'Declined'] as const) {
      expect(
        resolveDateApplied({
          previousDate: '2026-09-18',
          previousStatus: 'Interviewing',
          nextStatus,
          now,
        })
      ).toBe('2026-09-18');
    }
  });

  it('fills today when moving Saved → Applied with no prior date', () => {
    expect(
      resolveDateApplied({
        previousDate: null,
        previousStatus: 'Saved',
        nextStatus: 'Applied',
        now,
      })
    ).toBe('2026-09-21');
  });

  it('does not auto-set date for Interviewing → Applied', () => {
    expect(
      resolveDateApplied({
        previousDate: null,
        previousStatus: 'Interviewing',
        nextStatus: 'Applied',
        now,
      })
    ).toBeNull();
  });

  it('does not auto-set date for Offer → Applied', () => {
    expect(
      resolveDateApplied({
        previousDate: null,
        previousStatus: 'Offer',
        nextStatus: 'Applied',
        now,
      })
    ).toBeNull();
  });

  it('does not auto-set when staying Applied with empty date', () => {
    expect(
      resolveDateApplied({
        previousDate: null,
        previousStatus: 'Applied',
        nextStatus: 'Applied',
        now,
      })
    ).toBeNull();
  });

  it('honors an explicit client-provided date', () => {
    expect(
      resolveDateApplied({
        previousDate: '2026-09-01',
        previousStatus: 'Interviewing',
        nextStatus: 'Interviewing',
        explicitDate: '2026-09-10',
        now,
      })
    ).toBe('2026-09-10');
  });

  it('does not wipe an existing date when status stays Applied', () => {
    expect(
      resolveDateApplied({
        previousDate: '2026-09-05',
        previousStatus: 'Applied',
        nextStatus: 'Applied',
        now,
      })
    ).toBe('2026-09-05');
  });

  it('preserves existing date on Saved → Applied when already set', () => {
    expect(
      resolveDateApplied({
        previousDate: '2026-09-01',
        previousStatus: 'Saved',
        nextStatus: 'Applied',
        now,
      })
    ).toBe('2026-09-01');
  });
});
