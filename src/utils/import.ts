import type { CompanyMetadata, JobRecord, JobStatus } from '../types';

export const JOB_CSV_HEADERS = [
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
] as const;

const VALID_STATUSES: JobStatus[] = [
  'Saved',
  'Applied',
  'Interviewing',
  'Offer',
  'Accepted',
  'Rejected',
  'Declined',
];

const VALID_OWNERSHIP = new Set(['Public', 'Private', 'Non-profit', 'Unknown']);

export interface ImportParseResult {
  jobs: JobRecord[];
  format: 'json' | 'csv';
  skipped: number;
}

function normalizeStatus(value: unknown): JobStatus {
  const raw = String(value ?? '').trim();
  const match = VALID_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
  return match || 'Saved';
}

function normalizeOwnership(value: unknown): CompanyMetadata['ownership'] {
  const raw = String(value ?? '').trim();
  if (VALID_OWNERSHIP.has(raw)) {
    return raw as CompanyMetadata['ownership'];
  }
  return 'Unknown';
}

function cleanImportedCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  // Reverse CSV formula-injection escaping from export
  if (/^'[=+\-@\t\r]/.test(str)) {
    str = str.slice(1);
  }
  if (str === '—' || str.toLowerCase() === 'null') return '';
  return str;
}

function makeJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function normalizeJob(partial: Partial<JobRecord> & Record<string, unknown>): JobRecord | null {
  const company = cleanImportedCell(partial.company);
  const jobTitle = cleanImportedCell(partial.jobTitle);
  if (!company && !jobTitle) return null;

  const dateRaw = cleanImportedCell(partial.dateApplied);
  const dateApplied = dateRaw ? dateRaw.slice(0, 10) : null;

  const skills = Array.isArray(partial.positionMetadata?.requiredSkills)
    ? partial.positionMetadata!.requiredSkills.map((s) => String(s).trim()).filter(Boolean)
    : typeof (partial as any).requiredSkills === 'string'
      ? String((partial as any).requiredSkills)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const createdAt =
    cleanImportedCell(partial.createdAt) || new Date().toISOString();

  const dateAddedRaw = cleanImportedCell(partial.dateAdded);
  const dateAdded = dateAddedRaw ? dateAddedRaw.slice(0, 10) : createdAt.slice(0, 10);

  const statusHistory = Array.isArray(partial.statusHistory)
    ? partial.statusHistory
    : undefined;

  const rawSalary = cleanImportedCell(partial.salary);
  let salaryMin =
    typeof partial.salaryMin === 'number'
      ? partial.salaryMin
      : partial.salaryMin
        ? parseInt(String(partial.salaryMin), 10) || null
        : null;
  let salaryMax =
    typeof partial.salaryMax === 'number'
      ? partial.salaryMax
      : partial.salaryMax
        ? parseInt(String(partial.salaryMax), 10) || null
        : null;

  return {
    id: cleanImportedCell(partial.id) || makeJobId(),
    company: company || 'Unknown Company',
    jobTitle: jobTitle || 'Unknown Role',
    team: cleanImportedCell(partial.team) || undefined,
    location: cleanImportedCell(partial.location) || 'Remote',
    salary: rawSalary || 'Not listed',
    salaryMin,
    salaryMax,
    status: normalizeStatus(partial.status),
    dateApplied,
    dateAdded,
    industry: cleanImportedCell(partial.industry) || 'Technology',
    summary: cleanImportedCell(partial.summary),
    url: cleanImportedCell(partial.url),
    companyMetadata: {
      headcount: cleanImportedCell(partial.companyMetadata?.headcount) || undefined,
      headquarters: cleanImportedCell(partial.companyMetadata?.headquarters) || undefined,
      ownership: normalizeOwnership(partial.companyMetadata?.ownership),
      foundingYear: cleanImportedCell(partial.companyMetadata?.foundingYear) || undefined,
    },
    positionMetadata: {
      seniority: cleanImportedCell(partial.positionMetadata?.seniority) || undefined,
      department: cleanImportedCell(partial.positionMetadata?.department) || undefined,
      employmentType: cleanImportedCell(partial.positionMetadata?.employmentType) || undefined,
      requiredSkills: skills,
    },
    extractedVia: cleanImportedCell(partial.extractedVia) || 'Imported',
    createdAt,
    notes: cleanImportedCell(partial.notes),
    ...(statusHistory ? { statusHistory } : {}),
  };
}

/** Parse RFC4180-ish CSV into a matrix of string cells. */
export function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    // Ignore trailing empty line
    if (row.length === 1 && row[0] === '' && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushCell();
    } else if (ch === '\n') {
      pushCell();
      pushRow();
    } else if (ch === '\r') {
      // handle CRLF as single linebreak
      if (next === '\n') i++;
      pushCell();
      pushRow();
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    pushCell();
    pushRow();
  }

  return rows;
}

function headerIndexMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    map[h.trim().toLowerCase()] = i;
  });
  return map;
}

function cellAt(row: string[], map: Record<string, number>, ...names: string[]): string {
  for (const name of names) {
    const idx = map[name.toLowerCase()];
    if (idx !== undefined && row[idx] !== undefined) {
      return row[idx];
    }
  }
  return '';
}

export function parseJobsFromCsv(text: string): ImportParseResult {
  const matrix = parseCsvMatrix(text.replace(/^\uFEFF/, ''));
  if (matrix.length < 2) {
    throw new Error('CSV file has no data rows. Export from this app and try again.');
  }

  const map = headerIndexMap(matrix[0]);
  if (map['company'] === undefined && map['job title'] === undefined) {
    throw new Error(
      'CSV headers not recognized. Use a file exported from this app (needs Company / Job Title columns).'
    );
  }

  const jobs: JobRecord[] = [];
  let skipped = 0;

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => !String(c).trim())) {
      skipped++;
      continue;
    }

    const skillsStr = cellAt(row, map, 'Key Required Skills');
    const salaryMinStr = cellAt(row, map, 'Salary Min');
    const salaryMaxStr = cellAt(row, map, 'Salary Max');
    const normalized = normalizeJob({
      company: cellAt(row, map, 'Company'),
      jobTitle: cellAt(row, map, 'Job Title'),
      team: cellAt(row, map, 'Team'),
      location: cellAt(row, map, 'Location'),
      salary: cellAt(row, map, 'Salary / Compensation'),
      salaryMin: salaryMinStr ? parseInt(salaryMinStr, 10) || null : null,
      salaryMax: salaryMaxStr ? parseInt(salaryMaxStr, 10) || null : null,
      status: cellAt(row, map, 'Status') as JobStatus,
      dateApplied: cellAt(row, map, 'Date Applied') || null,
      dateAdded: cellAt(row, map, 'Date Added') || undefined,
      industry: cellAt(row, map, 'Industry'),
      summary: cellAt(row, map, 'Job Description Summary'),
      url: cellAt(row, map, 'Direct Job URL'),
      extractedVia: cellAt(row, map, 'Extracted Via'),
      id: cellAt(row, map, 'Record ID'),
      notes: cellAt(row, map, 'Notes'),
      createdAt: cellAt(row, map, 'Created At'),
      companyMetadata: {
        headcount: cellAt(row, map, 'Headcount Size'),
        headquarters: cellAt(row, map, 'Headquarters'),
        ownership: normalizeOwnership(cellAt(row, map, 'Ownership')),
        foundingYear: cellAt(row, map, 'Founding Year'),
      },
      positionMetadata: {
        seniority: cellAt(row, map, 'Seniority Level'),
        department: cellAt(row, map, 'Department'),
        employmentType: cellAt(row, map, 'Employment Type'),
        requiredSkills: skillsStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      },
    });

    if (!normalized) {
      skipped++;
      continue;
    }
    jobs.push(normalized);
  }

  if (jobs.length === 0) {
    throw new Error('No valid job rows found in CSV.');
  }

  return { jobs, format: 'csv', skipped };
}

export function parseJobsFromJson(text: string): ImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON. Use a file exported from this app.');
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as any).jobs)
      ? (parsed as any).jobs
      : null;

  if (!list) {
    throw new Error('JSON must be an array of jobs (or { "jobs": [...] }).');
  }

  const jobs: JobRecord[] = [];
  let skipped = 0;

  for (const item of list) {
    if (!item || typeof item !== 'object') {
      skipped++;
      continue;
    }
    const normalized = normalizeJob(item as Partial<JobRecord>);
    if (!normalized) {
      skipped++;
      continue;
    }
    jobs.push(normalized);
  }

  if (jobs.length === 0) {
    throw new Error('No valid job records found in JSON.');
  }

  return { jobs, format: 'json', skipped };
}

export function parseJobsImportFile(filename: string, text: string): ImportParseResult {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) {
    return parseJobsFromJson(text);
  }
  if (lower.endsWith('.csv')) {
    return parseJobsFromCsv(text);
  }
  // Sniff content
  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJobsFromJson(text);
  }
  return parseJobsFromCsv(text);
}
