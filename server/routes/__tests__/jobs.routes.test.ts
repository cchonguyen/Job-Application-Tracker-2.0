import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import type { AppEnv } from '../../app.types.ts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// A title the parser would split into "Senior Software Engineer" + team "Platform".
// If anything re-parses on read, this stored record gets rewritten.
const storedJob = {
  id: 'job_snapshot_1',
  company: 'Acme',
  jobTitle: 'Senior Software Engineer, Platform',
  location: 'Remote',
  salary: '$150,000 - $170,000 / yr',
  status: 'Applied',
  dateApplied: '2026-10-01',
  industry: 'Software',
  summary: 'Original JD summary as captured.',
  url: 'https://example.com/jobs/1',
  companyMetadata: {},
  positionMetadata: { requiredSkills: [] },
  createdAt: '2026-10-01T12:00:00.000Z',
  notes: '',
};

let tmpDir: string;
let originalCwd: string;
let dataFile: string;
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-routes-'));
  dataFile = path.join(tmpDir, 'spreadsheet_data.json');
  delete process.env.SUPABASE_URL;
  // The JSON store resolves its data file from cwd at import time.
  process.chdir(tmpDir);

  const { jobsRouter } = await import('../jobs.routes.ts');
  const { extractRouter } = await import('../extract.routes.ts');
  const { LOCAL_DEV_USER_ID } = await import('../../../src/lib/jobsStore.ts');
  const app = new Hono<AppEnv>();
  // Stands in for requireUser: each request acts as the user named in x-test-user (default: the local user,
  // who owns records saved before accounts existed).
  app.use('*', async (c, next) => {
    const id = c.req.header('x-test-user') || LOCAL_DEV_USER_ID;
    c.set('user', { id, email: null });
    c.set('jobScope', { userId: id, db: null });
    await next();
  });
  app.route('/api/jobs', jobsRouter);
  app.route('/api', extractRouter);
  server = http.createServer(getRequestListener(app.fetch));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  fs.writeFileSync(dataFile, JSON.stringify([storedJob], null, 2));
});

describe('GET /api/jobs', () => {
  it('returns stored jobs without rewriting them', async () => {
    const before = fs.readFileSync(dataFile, 'utf-8');

    const res = await fetch(`${baseUrl}/api/jobs`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].id).toBe(storedJob.id);
    expect(body.jobs[0].jobTitle).toBe(storedJob.jobTitle);
    expect(body.jobs[0].salary).toBe(storedJob.salary);
    expect(fs.readFileSync(dataFile, 'utf-8')).toBe(before);
  });

  it('leaves the store untouched across repeated loads', async () => {
    const before = fs.readFileSync(dataFile, 'utf-8');

    for (let i = 0; i < 3; i++) {
      await fetch(`${baseUrl}/api/jobs`);
    }

    expect(JSON.parse(fs.readFileSync(dataFile, 'utf-8'))[0].jobTitle).toBe(storedJob.jobTitle);
    expect(fs.readFileSync(dataFile, 'utf-8')).toBe(before);
  });
});

describe('PATCH /api/jobs/:id', () => {
  it('changes status without rewriting the captured JD fields', async () => {
    const res = await fetch(`${baseUrl}/api/jobs/${storedJob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Interviewing' }),
    });
    const body = await res.json();

    expect(body.success).toBe(true);
    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))[0];
    expect(saved.status).toBe('Interviewing');
    expect(saved.jobTitle).toBe(storedJob.jobTitle);
    expect(saved.team).toBeUndefined();
    expect(saved.salary).toBe(storedJob.salary);
    expect(saved.summary).toBe(storedJob.summary);
  });

  it('re-normalizes the title when the edit changes it', async () => {
    await fetch(`${baseUrl}/api/jobs/${storedJob.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...storedJob, jobTitle: 'Staff Engineer (Payments)' }),
    });

    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))[0];
    expect(saved.jobTitle).toBe('Staff Engineer');
    expect(saved.team).toBe('Payments');
    expect(saved.salary).toBe(storedJob.salary);
  });
});

describe('POST /api/jobs/reparse', () => {
  it('still rewrites records when explicitly requested', async () => {
    const res = await fetch(`${baseUrl}/api/jobs/reparse`, { method: 'POST' });
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.updated).toBe(1);
    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))[0];
    expect(saved.jobTitle).toBe('Senior Software Engineer');
    expect(saved.team).toBe('Platform');
  });
});

describe('isolation between users', () => {
  const asOther = { 'Content-Type': 'application/json', 'x-test-user': 'user-b' };
  const readStored = () => JSON.parse(fs.readFileSync(dataFile, 'utf-8'));

  it("never lists another user's jobs", async () => {
    const body = await (await fetch(`${baseUrl}/api/jobs`, { headers: asOther })).json();
    expect(body.success).toBe(true);
    expect(body.jobs).toEqual([]);
  });

  it("can't edit or delete another user's job", async () => {
    const before = fs.readFileSync(dataFile, 'utf-8');

    const patch = await fetch(`${baseUrl}/api/jobs/${storedJob.id}`, {
      method: 'PATCH',
      headers: asOther,
      body: JSON.stringify({ status: 'Rejected', notes: 'not mine' }),
    });
    const del = await fetch(`${baseUrl}/api/jobs/${storedJob.id}`, { method: 'DELETE', headers: asOther });

    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
    expect(fs.readFileSync(dataFile, 'utf-8')).toBe(before);
  });

  it("imports another user's id as a new job instead of overwriting theirs", async () => {
    const res = await fetch(`${baseUrl}/api/jobs/import`, {
      method: 'POST',
      headers: asOther,
      body: JSON.stringify({ jobs: [{ ...storedJob, jobTitle: 'Hijacked title' }] }),
    });
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.inserted).toBe(1);
    expect(body.updated).toBe(0);
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].id).not.toBe(storedJob.id);

    const original = readStored().find((j: any) => j.id === storedJob.id);
    expect(original.jobTitle).toBe(storedJob.jobTitle);
    expect(original.userId).toBeUndefined();
  });

  it('still updates in place when users re-import their own export', async () => {
    const res = await fetch(`${baseUrl}/api/jobs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs: [{ ...storedJob, notes: 'Re-imported' }] }),
    });
    const body = await res.json();

    expect(body.updated).toBe(1);
    expect(body.inserted).toBe(0);
    expect(readStored()).toHaveLength(1);
    expect(readStored()[0].notes).toBe('Re-imported');
  });

  it('saves a confirmed duplicate under a fresh id owned by the caller', async () => {
    const res = await fetch(`${baseUrl}/api/extract-job`, {
      method: 'POST',
      headers: asOther,
      body: JSON.stringify({ confirmDuplicate: true, candidateJob: { ...storedJob, userId: 'local-dev-user' } }),
    });
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.job.id).not.toBe(storedJob.id);
    const saved = readStored().find((j: any) => j.id === body.job.id);
    expect(saved.userId).toBe('user-b');
    expect(readStored().find((j: any) => j.id === storedJob.id).userId).toBeUndefined();
  });
});
