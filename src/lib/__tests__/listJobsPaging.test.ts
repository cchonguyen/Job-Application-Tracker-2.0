import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// 2,345 rows: more than two Supabase pages of 1,000.
const TOTAL = 2345;
const allRows = Array.from({ length: TOTAL }, (_, i) => ({
  id: `job_${String(i).padStart(5, '0')}`,
  company: 'Acme',
  job_title: `Role ${i}`,
  location: 'Remote',
  salary: 'Not listed',
  status: 'Applied',
  date_applied: null,
  industry: '',
  summary: '',
  url: '',
  company_metadata: {},
  position_metadata: { requiredSkills: [] },
  extracted_via: null,
  created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
  notes: '',
}));
const rangeCalls: Array<[number, number]> = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        order: () => query,
        range: async (from: number, to: number) => {
          rangeCalls.push([from, to]);
          return { data: allRows.slice(from, to + 1), error: null };
        },
      };
      return query;
    },
  }),
}));

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
});

afterAll(() => {
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
});

describe('listJobs on Supabase', () => {
  it('reads every row past the 1,000-row page limit', async () => {
    const { listJobs } = await import('../jobsStore.ts');
    const jobs = await listJobs();
    expect(jobs).toHaveLength(TOTAL);
    expect(new Set(jobs.map((j) => j.id)).size).toBe(TOTAL);
    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
});
