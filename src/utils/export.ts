import { JobRecord } from '../types';

/**
 * Clean cell values to prevent CSV formula injection and handle proper quotation
 */
function sanitizeCsvCell(value: any): string {
  if (value === null || value === undefined) {
    return '""';
  }
  let str = String(value);
  // Protect against CSV injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape inner double quotes by doubling them
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

export function exportJobsToCsv(jobs: JobRecord[], filename = 'job_applications.csv'): void {
  const headers = [
    'Company',
    'Job Title',
    'Team',
    'Location',
    'Salary / Compensation',
    'Salary Min',
    'Salary Max',
    'Status',
    'Date Applied',
    'Date Added',
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

  const rows = jobs.map((job) => [
    sanitizeCsvCell(job.company),
    sanitizeCsvCell(job.jobTitle),
    sanitizeCsvCell(job.team || ''),
    sanitizeCsvCell(job.location),
    sanitizeCsvCell(job.salary),
    sanitizeCsvCell(job.salaryMin ?? ''),
    sanitizeCsvCell(job.salaryMax ?? ''),
    sanitizeCsvCell(job.status),
    sanitizeCsvCell(job.dateApplied),
    sanitizeCsvCell(job.dateAdded || job.createdAt?.split('T')[0] || ''),
    sanitizeCsvCell(job.industry),
    sanitizeCsvCell(job.summary),
    sanitizeCsvCell(job.url),
    sanitizeCsvCell(job.positionMetadata?.seniority || ''),
    sanitizeCsvCell(job.positionMetadata?.department || ''),
    sanitizeCsvCell(job.positionMetadata?.employmentType || ''),
    sanitizeCsvCell((job.positionMetadata?.requiredSkills || []).join(', ')),
    sanitizeCsvCell(job.companyMetadata?.headcount || ''),
    sanitizeCsvCell(job.companyMetadata?.headquarters || ''),
    sanitizeCsvCell(job.companyMetadata?.ownership || ''),
    sanitizeCsvCell(job.companyMetadata?.foundingYear || ''),
    sanitizeCsvCell(job.extractedVia || ''),
    sanitizeCsvCell(job.id),
    sanitizeCsvCell(job.notes || ''),
    sanitizeCsvCell(job.createdAt || ''),
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportJobsToJson(jobs: JobRecord[], filename = 'job_applications.json'): void {
  const jsonContent = JSON.stringify(jobs, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
