import { afterEach, describe, expect, it } from 'vitest';
import { apiApp } from '../index.ts';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('apiApp', () => {
  it('serves sign-in config without a token but requires one for jobs', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';

    const config = await apiApp.request('/api/auth/config');
    expect(config.status).toBe(200);
    expect((await config.json()).enabled).toBe(true);

    const jobs = await apiApp.request('/api/jobs');
    expect(jobs.status).toBe(401);
    expect((await jobs.json()).authRequired).toBe(true);
  });

  it('answers unknown API paths with JSON', async () => {
    delete process.env.SUPABASE_URL;
    process.env.NODE_ENV = 'development';
    const res = await apiApp.request('/api/nope');
    expect(res.status).toBe(404);
    expect((await res.json()).success).toBe(false);
  });
});
