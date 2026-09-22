import { describe, expect, it } from 'vitest';
import { parseJobsFromCsv, parseJobsFromJson, parseJobsImportFile } from '../../utils/import';
import type { JobRecord } from '../../types';

const sampleJob: JobRecord = {
  id: 'job_import_1',
  company: 'Acme, Inc.',
  jobTitle: 'Senior PM',
  location: 'Remote (US)',
  salary: '$150,000 - $170,000 / yr',
  status: 'Applied',
  dateApplied: '2026-09-19',
  industry: 'Healthcare',
  summary: 'Lead pharmacy care product line.',
  url: 'https://example.com/jobs/1',
  companyMetadata: {
    headcount: '1,000+',
    headquarters: 'United States',
    ownership: 'Private',
    foundingYear: '2020',
  },
  positionMetadata: {
    seniority: 'Senior',
    department: 'Product',
    employmentType: 'Full-time',
    requiredSkills: ['Product Strategy', 'Healthcare Tech'],
  },
  extractedVia: 'Manual Text Fallback',
  createdAt: '2026-09-19T00:28:29.354Z',
  notes: 'Referred by Sam',
};

describe('parseJobsFromJson', () => {
  it('parses an exported job array', () => {
    const result = parseJobsFromJson(JSON.stringify([sampleJob]));
    expect(result.format).toBe('json');
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].company).toBe('Acme, Inc.');
    expect(result.jobs[0].notes).toBe('Referred by Sam');
    expect(result.jobs[0].positionMetadata.requiredSkills).toContain('Product Strategy');
  });

  it('accepts { jobs: [...] } wrappers', () => {
    const result = parseJobsFromJson(JSON.stringify({ jobs: [sampleJob] }));
    expect(result.jobs[0].id).toBe('job_import_1');
  });

  it('rejects invalid JSON shapes', () => {
    expect(() => parseJobsFromJson('{"foo":1}')).toThrow(/array of jobs/i);
  });
});

describe('parseJobsFromCsv', () => {
  it('round-trips CSV columns from this app', () => {
    const headers = [
      'Company',
      'Job Title',
      'Location',
      'Salary / Compensation',
      'Status',
      'Date Applied',
      'Industry',
      'Job Description Summary',
      'Direct Job URL',
      'Seniority Level',
      'Department',
      'Employment Type',
      'Key Required Skills',
      'Headcount Size',
      'Headquarters',
      'Ownership',
      'Founding Year',
      'Extracted Via',
      'Record ID',
      'Notes',
      'Created At',
    ];
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const row = [
      sampleJob.company,
      sampleJob.jobTitle,
      sampleJob.location,
      sampleJob.salary,
      sampleJob.status,
      sampleJob.dateApplied,
      sampleJob.industry,
      sampleJob.summary,
      sampleJob.url,
      sampleJob.positionMetadata.seniority,
      sampleJob.positionMetadata.department,
      sampleJob.positionMetadata.employmentType,
      sampleJob.positionMetadata.requiredSkills.join(', '),
      sampleJob.companyMetadata.headcount,
      sampleJob.companyMetadata.headquarters,
      sampleJob.companyMetadata.ownership,
      sampleJob.companyMetadata.foundingYear,
      sampleJob.extractedVia,
      sampleJob.id,
      sampleJob.notes,
      sampleJob.createdAt,
    ].map(escape);
    const csvText = [headers.join(','), row.join(',')].join('\r\n');

    const result = parseJobsFromCsv(csvText);
    expect(result.format).toBe('csv');
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].company).toBe('Acme, Inc.');
    expect(result.jobs[0].jobTitle).toBe('Senior PM');
    expect(result.jobs[0].id).toBe('job_import_1');
    expect(result.jobs[0].status).toBe('Applied');
    expect(result.jobs[0].notes).toBe('Referred by Sam');
    expect(result.jobs[0].positionMetadata.requiredSkills).toEqual([
      'Product Strategy',
      'Healthcare Tech',
    ]);
  });

  it('handles quoted commas in company names', () => {
    const csv = [
      'Company,Job Title,Location,Salary / Compensation,Status,Date Applied,Industry,Job Description Summary,Direct Job URL,Seniority Level,Department,Employment Type,Key Required Skills,Headcount Size,Headquarters,Ownership,Founding Year,Extracted Via,Record ID,Notes,Created At',
      '"Foo, Bar LLC","Engineer","Remote","","Saved","","","","","","","","","","","","","","job_x","","2026-01-01T00:00:00.000Z"',
    ].join('\n');
    const result = parseJobsFromCsv(csv);
    expect(result.jobs[0].company).toBe('Foo, Bar LLC');
    expect(result.jobs[0].status).toBe('Saved');
  });
});

describe('parseJobsImportFile', () => {
  it('routes by extension', () => {
    const json = parseJobsImportFile('jobs.json', JSON.stringify([sampleJob]));
    expect(json.format).toBe('json');
    const csv = parseJobsImportFile(
      'jobs.csv',
      'Company,Job Title\n"Acme","PM"\n'
    );
    expect(csv.format).toBe('csv');
    expect(csv.jobs[0].jobTitle).toBe('PM');
  });
});
