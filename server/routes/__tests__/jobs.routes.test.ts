import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import type { AppEnv } from '../../app.types.ts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
let parsingEngine: any;

beforeAll(async () => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-routes-'));
  dataFile = path.join(tmpDir, 'spreadsheet_data.json');
  delete process.env.SUPABASE_URL;
  // The JSON store resolves its data file from cwd at import time.
  process.chdir(tmpDir);

  const { parsingEngine: engine } = await import('../../services/parsing/index.ts');
  parsingEngine = engine;
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

describe('POST /api/extract-job (In-Place Stub Upgrade & Canonical URL)', () => {
  const readStored = () => JSON.parse(fs.readFileSync(dataFile, 'utf-8'));

  it('upgrades an incomplete "Needs review" stub row in-place when complete extraction succeeds', async () => {
    // Setup existing incomplete stub
    const stubJob = {
      id: 'job_stub_123',
      company: 'Acme',
      jobTitle: 'Unknown Role',
      location: 'Not listed',
      salary: 'Not listed',
      status: 'Interviewing',
      dateApplied: '2026-10-15',
      dateAdded: '2026-10-15',
      industry: 'Unknown',
      summary: '',
      url: 'https://boards.greenhouse.io/acme/jobs/12345?gh_src=some_campaign',
      companyMetadata: {},
      positionMetadata: { requiredSkills: [] },
      extractedVia: 'Deterministic URL Parser (Free Tier Safety)',
      createdAt: '2026-10-15T10:00:00.000Z',
      notes: 'User custom notes preserved',
      statusHistory: [{ at: '2026-10-15T10:00:00.000Z', from: null, to: 'Interviewing' }],
    };
    fs.writeFileSync(dataFile, JSON.stringify([stubJob], null, 2));

    const extractSpy = vi.spyOn(parsingEngine, 'extract').mockResolvedValueOnce({
      extractedData: {
        company: 'Acme Corporation',
        jobTitle: 'Staff Backend Engineer',
        team: 'Infrastructure',
        location: 'San Francisco, CA',
        salary: '$190,000 - $220,000 / yr',
        salaryMin: 190000,
        salaryMax: 220000,
        industry: 'Enterprise Software',
        summary: 'Full role overview successfully extracted via 1-Click Bookmarklet.',
        positionMetadata: {
          seniority: 'Staff',
          department: 'Engineering',
          employmentType: 'Full-time',
          requiredSkills: ['Go', 'Kafka'],
        },
        companyMetadata: {
          headcount: '1,000+ employees',
          headquarters: 'San Francisco, CA',
          ownership: 'Public',
        },
      },
      tierUsed: 'ATS API (Greenhouse • Fast-Path)',
      diagnosticSteps: [{ tier: 'Tier 1', name: 'Greenhouse API', status: 'success' }],
    } as any);

    const res = await fetch(`${baseUrl}/api/extract-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://boards.greenhouse.io/acme/jobs/12345/apply',
        manualText: 'Rendered DOM text from bookmarklet',
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.upgradedExistingStub).toBe(true);
    expect(body.potentialDuplicate).toBeFalsy();

    // Verify user-owned fields preserved
    expect(body.job.id).toBe(stubJob.id);
    expect(body.job.status).toBe('Interviewing');
    expect(body.job.dateApplied).toBe('2026-10-15');
    expect(body.job.dateAdded).toBe('2026-10-15');
    expect(body.job.notes).toBe('User custom notes preserved');
    expect(body.job.statusHistory).toEqual(stubJob.statusHistory);

    // Verify extracted fields upgraded
    expect(body.job.company).toBe('Acme Corporation');
    expect(body.job.jobTitle).toBe('Staff Backend Engineer');
    expect(body.job.team).toBe('Infrastructure');
    expect(body.job.salary).toBe('190k - 220k');
    expect(body.job.extractedVia).toBe('ATS API (Greenhouse • Fast-Path)');
    // Canonical URL stored without /apply
    expect(body.job.url).toBe('https://boards.greenhouse.io/acme/jobs/12345');

    // Verify database only has 1 record (no duplicate created)
    const stored = readStored();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(stubJob.id);
    expect(stored[0].company).toBe('Acme Corporation');
    expect(stored[0].notes).toBe('User custom notes preserved');

    extractSpy.mockRestore();
  });

  it('does NOT upgrade complete snapshots and instead triggers duplicate warning', async () => {
    const completeJob = {
      id: 'job_complete_1',
      company: 'Acme',
      jobTitle: 'Senior Software Engineer',
      location: 'Remote',
      salary: '$150,000 - $170,000 / yr',
      status: 'Applied',
      dateApplied: '2026-10-01',
      dateAdded: '2026-10-01',
      industry: 'Software',
      summary: 'Complete snapshot already stored.',
      url: 'https://boards.greenhouse.io/acme/jobs/12345',
      companyMetadata: {},
      positionMetadata: { requiredSkills: [] },
      extractedVia: 'Gemini 3.8 Flash',
      createdAt: '2026-10-01T12:00:00.000Z',
      notes: '',
      statusHistory: [],
    };
    fs.writeFileSync(dataFile, JSON.stringify([completeJob], null, 2));

    const extractSpy = vi.spyOn(parsingEngine, 'extract').mockResolvedValueOnce({
      extractedData: {
        company: 'Acme',
        jobTitle: 'Senior Software Engineer',
        location: 'Remote',
        salary: '$150,000 - $170,000 / yr',
      },
      tierUsed: 'Gemini 3.8 Flash',
      diagnosticSteps: [],
    } as any);

    const res = await fetch(`${baseUrl}/api/extract-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://boards.greenhouse.io/acme/jobs/12345',
      }),
    });
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.potentialDuplicate).toBe(true);
    expect(body.upgradedExistingStub).toBeFalsy();
    expect(body.duplicates).toHaveLength(1);

    // Stored jobs still unchanged
    expect(readStored()).toHaveLength(1);
    expect(readStored()[0].id).toBe(completeJob.id);

    extractSpy.mockRestore();
  });

  it('runs canonicalization on POST /api/test-ats-diagnostic', async () => {
    const extractSpy = vi.spyOn(parsingEngine, 'extract').mockResolvedValueOnce({
      extractedData: { company: 'TestCo', jobTitle: 'Test Role' },
      tierUsed: 'ATS API (Greenhouse)',
      diagnosticSteps: [],
    } as any);

    const res = await fetch(`${baseUrl}/api/test-ats-diagnostic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://boards.greenhouse.io/testco/jobs/999/apply?gh_src=test_campaign',
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // targetUrl in report was canonicalized
    expect(body.report.targetUrl).toBe('https://boards.greenhouse.io/testco/jobs/999');

    extractSpy.mockRestore();
  });
});
