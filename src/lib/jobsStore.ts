import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { JobRecord, JobStatus } from '../types';
import { normalizeStatusHistory } from './statusHistory.ts';
import { parseSalaryRange, formatSalaryDisplay } from './salary.ts';

const DATA_FILE = path.join(process.cwd(), 'spreadsheet_data.json');
const EXAMPLE_DATA_FILE = path.join(process.cwd(), 'spreadsheet_data.example.json');

type JobRow = {
  id: string;
  company: string;
  job_title: string;
  team?: string | null;
  location: string;
  salary: string;
  status: string;
  date_applied: string | null;
  industry: string;
  summary: string;
  url: string;
  company_metadata: JobRecord['companyMetadata'];
  position_metadata: JobRecord['positionMetadata'];
  extracted_via: string | null;
  created_at: string;
  notes: string | null;
  status_history?: JobRecord['statusHistory'] | null;
  // Optional root columns if present on newer schemas
  salary_min?: number | null;
  salary_max?: number | null;
  date_added?: string | null;
};

const INITIAL_SEED_JOBS: JobRecord[] = [
  {
    id: 'job_seed_stripe_1',
    company: 'Stripe',
    jobTitle: 'Staff Full-Stack Software Engineer',
    team: 'Billing & Subscriptions',
    location: 'Remote (US & Canada)',
    salary: '195k - 275k',
    salaryMin: 195000,
    salaryMax: 275000,
    status: 'Interviewing',
    dateApplied: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    dateAdded: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    industry: 'Financial Infrastructure',
    summary:
      'Lead engineering for customer dashboard experiences and global billing payment primitives. Own architecture across distributed React/TypeScript frontends and Ruby/Java services. Collaborate with product teams to ship low-latency merchant financial tooling.',
    url: 'https://stripe.com/jobs/listing/staff-full-stack-engineer/6091234',
    companyMetadata: {
      headcount: '7,000+ employees',
      headquarters: 'San Francisco, CA & Dublin',
      ownership: 'Private',
      foundingYear: '2010',
    },
    positionMetadata: {
      seniority: 'Staff',
      department: 'Billing & Subscriptions',
      employmentType: 'Full-time',
      requiredSkills: ['React', 'TypeScript', 'Distributed Systems', 'API Design', 'PostgreSQL'],
    },
    extractedVia: 'Cheerio JSON-LD + Gemini 3.8',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    notes: 'Recruiter screen completed. Technical system design round scheduled for next Tuesday.',
    statusHistory: [
      {
        at: new Date(Date.now() - 3 * 86400000).toISOString(),
        from: null,
        to: 'Applied',
      },
      {
        at: new Date(Date.now() - 2 * 86400000).toISOString(),
        from: 'Applied',
        to: 'Interviewing',
      },
    ],
  },
];

let supabaseClient: SupabaseClient | null | undefined;

export function isUsingSupabase(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * Normalize SUPABASE_URL to the project API origin.
 * Common mistakes: dashboard links, trailing /rest/v1, quotes, whitespace.
 */
export function normalizeSupabaseUrl(raw: string): string {
  let value = raw.trim().replace(/^['"]|['"]$/g, '');

  if (!value) {
    throw new Error('SUPABASE_URL is empty.');
  }

  if (value.includes('supabase.com/dashboard')) {
    throw new Error(
      'SUPABASE_URL looks like a dashboard link. Use Project Settings → Data API → Project URL (https://YOUR_REF.supabase.co).'
    );
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `SUPABASE_URL is not a valid URL: "${raw}". Expected https://YOUR_REF.supabase.co`
    );
  }

  // Strip accidental API paths (/rest/v1, /auth/v1, etc.)
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';

  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith('.supabase.co') && !host.endsWith('.supabase.in')) {
    throw new Error(
      `SUPABASE_URL host must be *.supabase.co (got "${host}"). Copy Project URL from Supabase → Project Settings → Data API.`
    );
  }

  // Origin only, no trailing slash
  return parsed.origin;
}

function getSupabase(): SupabaseClient {
  if (supabaseClient === undefined) {
    const rawUrl = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!rawUrl?.trim() || !key) {
      supabaseClient = null;
    } else {
      const url = normalizeSupabaseUrl(rawUrl);
      if (key.startsWith('sb_publishable_') || key.toLowerCase().includes('anon')) {
        console.warn(
          'SUPABASE_SERVICE_ROLE_KEY looks like a publishable/anon key. Use the legacy service_role secret instead.'
        );
      }
      supabaseClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }
  if (!supabaseClient) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return supabaseClient;
}

function isMissingColumnError(error: any, columnName: string): boolean {
  if (!error) return false;
  const msg = String(error.message || '') + ' ' + String(error.details || '') + ' ' + String(error.hint || '');
  return (
    msg.toLowerCase().includes(`'${columnName}' column`) ||
    msg.toLowerCase().includes(`column "${columnName}"`) ||
    msg.toLowerCase().includes(`column jobs.${columnName}`) ||
    (error.code === 'PGRST204' && msg.toLowerCase().includes(columnName))
  );
}

function supabaseErrorMessage(action: string, error: { message?: string; details?: string; hint?: string; code?: string }): string {
  const msg = error.message || 'Unknown error';
  let hint = '';

  if (/team/i.test(msg) || /schema cache/i.test(msg)) {
    hint = ' Run "ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS team text default \'\';" in Supabase SQL Editor.';
  } else if (/invalid path/i.test(msg)) {
    hint = ' Check SUPABASE_URL is exactly https://YOUR_REF.supabase.co (no /dashboard, no /rest/v1). Also confirm you ran supabase/schema.sql so the jobs table exists.';
  } else if (error.hint) {
    hint = ` ${error.hint}`;
  }

  return `Supabase ${action} failed: ${msg}${hint}`;
}

export function parseJobTitleAndTeam(rawTitle: string, existingTeam?: string): { jobTitle: string; team: string } {
  let title = (rawTitle || '').trim();
  let team = (existingTeam || '').trim();

  if (team) {
    const escapedTeam = team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    title = title
      .replace(new RegExp(`\\s*[,–—|-]\\s*${escapedTeam}$`, 'i'), '')
      .replace(new RegExp(`\\s*\\(${escapedTeam}\\)$`, 'i'), '')
      .trim();
    return { jobTitle: title, team };
  }

  // 1. Parentheses: "Role Title (Team Name)"
  const parenMatch = title.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenMatch && parenMatch[1] && parenMatch[2]) {
    const mainTitle = parenMatch[1].trim();
    const innerText = parenMatch[2].trim();
    if (!/^(remote|onsite|hybrid|full-time|contract|part-time|us|ca|ny|sf|boston|austin|seattle|chicago|london)$/i.test(innerText)) {
      return { jobTitle: mainTitle, team: innerText };
    }
  }

  // 2. Delimiters: "Role Title, Team Name" or "Role Title - Team Name" or "Role Title | Team Name"
  const splitMatch = title.match(/^(.+?)\s*[,–—|-]\s+(.+)$/);
  if (splitMatch && splitMatch[1] && splitMatch[2]) {
    const candidateTitle = splitMatch[1].trim();
    const candidateTeam = splitMatch[2].trim();
    if (candidateTitle.length >= 3 && candidateTeam.length >= 2) {
      return { jobTitle: candidateTitle, team: candidateTeam };
    }
  }

  return { jobTitle: title, team };
}

function normalizeJobRecord(job: JobRecord): JobRecord {
  let salaryMin = typeof job.salaryMin === 'number' && !Number.isNaN(job.salaryMin) ? job.salaryMin : null;
  let salaryMax = typeof job.salaryMax === 'number' && !Number.isNaN(job.salaryMax) ? job.salaryMax : null;
  let salaryStr = job.salary;

  // If min/max are not set, derive them from raw salary
  if (salaryMin === null && salaryMax === null && salaryStr) {
    const parsed = parseSalaryRange(salaryStr);
    salaryMin = parsed.salaryMin;
    salaryMax = parsed.salaryMax;
    salaryStr = parsed.formatted;
  } else if (salaryMin !== null || salaryMax !== null) {
    const formatted = formatSalaryDisplay(salaryMin, salaryMax, salaryStr);
    salaryStr = formatted.text;
  }

  const dateAdded =
    job.dateAdded ||
    (job.createdAt ? job.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);

  const { jobTitle: cleanTitle, team: cleanTeam } = parseJobTitleAndTeam(job.jobTitle, job.team);

  return {
    ...job,
    jobTitle: cleanTitle || job.jobTitle,
    team: cleanTeam || undefined,
    salary: salaryStr || 'Not listed',
    salaryMin,
    salaryMax,
    dateAdded,
    statusHistory: normalizeStatusHistory(job.statusHistory),
  };
}

function rowToJob(row: JobRow): JobRecord {
  const posMeta = row.position_metadata || { requiredSkills: [] };
  const salaryMin =
    row.salary_min !== undefined && row.salary_min !== null
      ? row.salary_min
      : posMeta.salaryMin !== undefined
      ? posMeta.salaryMin
      : null;

  const salaryMax =
    row.salary_max !== undefined && row.salary_max !== null
      ? row.salary_max
      : posMeta.salaryMax !== undefined
      ? posMeta.salaryMax
      : null;

  const dateAdded =
    row.date_added ||
    posMeta.dateAdded ||
    (row.created_at ? row.created_at.split('T')[0] : undefined);

  const statusHistory = normalizeStatusHistory(
    row.status_history || posMeta.statusHistory
  );

  return normalizeJobRecord({
    id: row.id,
    company: row.company,
    jobTitle: row.job_title,
    team: row.team || posMeta.team || undefined,
    location: row.location,
    salary: row.salary,
    salaryMin,
    salaryMax,
    status: row.status as JobStatus,
    dateApplied: row.date_applied,
    dateAdded,
    industry: row.industry,
    summary: row.summary,
    url: row.url,
    companyMetadata: row.company_metadata || {},
    positionMetadata: {
      seniority: posMeta.seniority,
      department: posMeta.department,
      employmentType: posMeta.employmentType,
      requiredSkills: posMeta.requiredSkills || [],
      team: row.team || posMeta.team || '',
      salaryMin,
      salaryMax,
      dateAdded,
      statusHistory,
    },
    extractedVia: row.extracted_via || undefined,
    createdAt: row.created_at,
    notes: row.notes || '',
    statusHistory,
  });
}

function jobToRow(job: JobRecord): JobRow {
  const norm = normalizeJobRecord(job);
  const normalizedHistory = normalizeStatusHistory(norm.statusHistory);
  const cleanDateApplied =
    norm.dateApplied && typeof norm.dateApplied === 'string' && norm.dateApplied.trim() !== ''
      ? norm.dateApplied.trim()
      : null;
  const cleanDateAdded =
    norm.dateAdded && typeof norm.dateAdded === 'string' && norm.dateAdded.trim() !== ''
      ? norm.dateAdded.trim()
      : null;

  return {
    id: norm.id,
    company: norm.company || 'Unknown Company',
    job_title: norm.jobTitle || 'Unknown Role',
    team: norm.team || '',
    location: norm.location || 'Remote',
    salary: norm.salary || 'Not listed',
    status: norm.status || 'Applied',
    date_applied: cleanDateApplied,
    industry: norm.industry || 'Technology',
    summary: norm.summary || '',
    url: norm.url || '',
    company_metadata: norm.companyMetadata || {},
    position_metadata: {
      ...(norm.positionMetadata || { requiredSkills: [] }),
      team: norm.team || '',
      salaryMin: norm.salaryMin ?? null,
      salaryMax: norm.salaryMax ?? null,
      dateAdded: cleanDateAdded,
      statusHistory: normalizedHistory,
    },
    extracted_via: norm.extractedVia || null,
    created_at: norm.createdAt || new Date().toISOString(),
    notes: norm.notes || '',
  };
}

function readJsonJobs(): JobRecord[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((job) => normalizeJobRecord(job as JobRecord));
      }
    }
  } catch (err) {
    console.error('Error reading spreadsheet_data.json:', err);
  }

  try {
    if (fs.existsSync(EXAMPLE_DATA_FILE)) {
      const example = JSON.parse(fs.readFileSync(EXAMPLE_DATA_FILE, 'utf-8'));
      if (Array.isArray(example) && example.length > 0) {
        const normalized = example.map((job) => normalizeJobRecord(job as JobRecord));
        writeJsonJobs(normalized);
        return normalized;
      }
    }
  } catch (err) {
    console.error('Error reading spreadsheet_data.example.json:', err);
  }

  writeJsonJobs(INITIAL_SEED_JOBS);
  return [...INITIAL_SEED_JOBS];
}

function writeJsonJobs(jobs: JobRecord[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing spreadsheet_data.json:', err);
  }
}

export async function listJobs(): Promise<JobRecord[]> {
  if (!isUsingSupabase()) {
    return readJsonJobs();
  }

  const { data, error } = await getSupabase()
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(supabaseErrorMessage('listJobs', error));
  }

  return (data || []).map((row) => rowToJob(row as JobRow));
}

export async function insertJob(job: JobRecord): Promise<JobRecord> {
  if (!isUsingSupabase()) {
    const jobs = readJsonJobs();
    jobs.unshift(job);
    writeJsonJobs(jobs);
    return job;
  }

  const row = jobToRow(job);
  let { data, error } = await getSupabase().from('jobs').insert(row).select('*').single();

  if (error && isMissingColumnError(error, 'team')) {
    console.warn("Supabase 'team' column missing on jobs table. Fallback storing team in position_metadata.");
    const fallbackRow = { ...row };
    delete (fallbackRow as any).team;
    const retry = await getSupabase().from('jobs').insert(fallbackRow).select('*').single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new Error(supabaseErrorMessage('insertJob', error));
  }

  return rowToJob(data as JobRow);
}

export async function updateJob(id: string, updates: Partial<JobRecord>): Promise<JobRecord | null> {
  if (!isUsingSupabase()) {
    const jobs = readJsonJobs();
    const index = jobs.findIndex((j) => j.id === id);
    if (index === -1) return null;

    const merged = normalizeJobRecord({
      ...jobs[index],
      ...updates,
      companyMetadata: {
        ...(jobs[index].companyMetadata || {}),
        ...(updates.companyMetadata || {}),
      },
      positionMetadata: {
        ...(jobs[index].positionMetadata || {}),
        ...(updates.positionMetadata || {}),
      },
    });

    jobs[index] = merged;
    writeJsonJobs(jobs);
    return merged;
  }

  const existing = await getJobById(id);
  if (!existing) return null;

  const merged: JobRecord = normalizeJobRecord({
    ...existing,
    ...updates,
    companyMetadata: {
      ...(existing.companyMetadata || {}),
      ...(updates.companyMetadata || {}),
    },
    positionMetadata: {
      ...(existing.positionMetadata || {}),
      ...(updates.positionMetadata || {}),
    },
  });

  const row = jobToRow(merged);
  let { data, error } = await getSupabase()
    .from('jobs')
    .update(row)
    .eq('id', id)
    .select('*')
    .single();

  if (error && isMissingColumnError(error, 'team')) {
    console.warn("Supabase 'team' column missing on jobs table. Fallback storing team in position_metadata.");
    const fallbackRow = { ...row };
    delete (fallbackRow as any).team;
    const retry = await getSupabase()
      .from('jobs')
      .update(fallbackRow)
      .eq('id', id)
      .select('*')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new Error(supabaseErrorMessage('updateJob', error));
  }

  return rowToJob(data as JobRow);
}

export async function getJobById(id: string): Promise<JobRecord | null> {
  if (!isUsingSupabase()) {
    return readJsonJobs().find((j) => j.id === id) || null;
  }

  const { data, error } = await getSupabase().from('jobs').select('*').eq('id', id).maybeSingle();

  if (error) {
    throw new Error(supabaseErrorMessage('getJobById', error));
  }

  return data ? rowToJob(data as JobRow) : null;
}

export async function deleteJob(id: string): Promise<boolean> {
  if (!isUsingSupabase()) {
    const jobs = readJsonJobs();
    const next = jobs.filter((j) => j.id !== id);
    if (next.length === jobs.length) return false;
    writeJsonJobs(next);
    return true;
  }

  const { data, error } = await getSupabase().from('jobs').delete().eq('id', id).select('id');

  if (error) {
    throw new Error(supabaseErrorMessage('deleteJob', error));
  }

  return Array.isArray(data) && data.length > 0;
}

export interface UpsertJobsResult {
  inserted: number;
  updated: number;
  jobs: JobRecord[];
}

/** Insert new jobs or replace existing ones that share the same id. */
export async function upsertJobs(incoming: JobRecord[]): Promise<UpsertJobsResult> {
  if (incoming.length === 0) {
    return { inserted: 0, updated: 0, jobs: await listJobs() };
  }

  if (!isUsingSupabase()) {
    const jobs = readJsonJobs();
    const byId = new Map(jobs.map((j) => [j.id, j]));
    let inserted = 0;
    let updated = 0;

    for (const job of incoming) {
      if (byId.has(job.id)) {
        updated++;
      } else {
        inserted++;
      }
      byId.set(job.id, job);
    }

    const next = Array.from(byId.values()).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    writeJsonJobs(next);
    return { inserted, updated, jobs: next };
  }

  const existing = await listJobs();
  const existingIds = new Set(existing.map((j) => j.id));
  let inserted = 0;
  let updated = 0;

  for (const job of incoming) {
    if (existingIds.has(job.id)) updated++;
    else inserted++;
  }

  const rows = incoming.map(jobToRow);
  let { error } = await getSupabase().from('jobs').upsert(rows, { onConflict: 'id' });

  if (error && isMissingColumnError(error, 'team')) {
    console.warn("Supabase 'team' column missing on jobs table. Fallback storing team in position_metadata.");
    const fallbackRows = rows.map((r) => {
      const copy = { ...r };
      delete (copy as any).team;
      return copy;
    });
    const retry = await getSupabase().from('jobs').upsert(fallbackRows, { onConflict: 'id' });
    error = retry.error;
  }

  if (error) {
    throw new Error(supabaseErrorMessage('upsertJobs', error));
  }

  const jobs = await listJobs();
  return { inserted, updated, jobs };
}

export async function reparseAllJobsInStore(): Promise<{ total: number; updated: number }> {
  const allJobs = await listJobs();
  let updatedCount = 0;

  for (const job of allJobs) {
    const { jobTitle: parsedTitle, team: parsedTeam } = parseJobTitleAndTeam(job.jobTitle, job.team);
    if (parsedTitle !== job.jobTitle || (parsedTeam && parsedTeam !== job.team)) {
      updatedCount++;
      const updatedJob: JobRecord = {
        ...job,
        jobTitle: parsedTitle,
        team: parsedTeam || job.team,
      };
      await updateJob(job.id, updatedJob);
    }
  }

  return { total: allJobs.length, updated: updatedCount };
}
