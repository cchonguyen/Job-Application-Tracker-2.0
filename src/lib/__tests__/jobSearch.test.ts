import { describe, expect, it } from 'vitest';
import { jobMatchesSearch } from '../jobSearch';
import { JobRecord } from '../../types';

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'job-1',
    company: 'Acme Corp',
    jobTitle: 'Frontend Engineer',
    team: 'Platform',
    location: 'Remote',
    salary: '',
    status: 'Applied',
    dateApplied: '2026-01-10',
    industry: 'Software',
    summary: 'Build dashboards for analysts',
    url: 'https://careers.acme.example/jobs/42',
    companyMetadata: {} as JobRecord['companyMetadata'],
    positionMetadata: { requiredSkills: ['TypeScript', 'React'] } as JobRecord['positionMetadata'],
    createdAt: '2026-01-10T00:00:00.000Z',
    notes: 'Referred by Sam',
    ...overrides,
  } as JobRecord;
}

describe('jobMatchesSearch', () => {
  const job = makeJob();

  it('matches everything for an empty or whitespace query', () => {
    expect(jobMatchesSearch(job, '')).toBe(true);
    expect(jobMatchesSearch(job, '   ')).toBe(true);
  });

  it('matches on company', () => {
    expect(jobMatchesSearch(job, 'Acme')).toBe(true);
  });

  it('matches on job title', () => {
    expect(jobMatchesSearch(job, 'Frontend')).toBe(true);
  });

  it('matches on url', () => {
    expect(jobMatchesSearch(job, 'careers.acme')).toBe(true);
  });

  it('matches on summary', () => {
    expect(jobMatchesSearch(job, 'dashboards')).toBe(true);
  });

  it('matches on a required skill', () => {
    expect(jobMatchesSearch(job, 'TypeScript')).toBe(true);
    expect(jobMatchesSearch(job, 'react')).toBe(true);
  });

  it('matches on status so rejected jobs can be found', () => {
    const rejected = makeJob({ status: 'Rejected' });
    expect(jobMatchesSearch(rejected, 'Rejected')).toBe(true);
  });

  it('is case-insensitive and trims the query', () => {
    expect(jobMatchesSearch(job, 'ACME CORP')).toBe(true);
    expect(jobMatchesSearch(job, '  acme  ')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(jobMatchesSearch(job, 'zebra-unicorn')).toBe(false);
  });

  it('handles null and undefined optional fields safely', () => {
    const sparse = makeJob({
      notes: undefined,
      team: undefined,
      positionMetadata: { requiredSkills: [] } as JobRecord['positionMetadata'],
    });
    expect(jobMatchesSearch(sparse, 'Acme')).toBe(true);
    expect(jobMatchesSearch(sparse, 'nomatch-here')).toBe(false);

    const nulls = makeJob({
      notes: null as unknown as undefined,
      team: null as unknown as undefined,
    });
    expect(jobMatchesSearch(nulls, 'nomatch-here')).toBe(false);
    expect(jobMatchesSearch(nulls, 'Frontend')).toBe(true);
  });
});
