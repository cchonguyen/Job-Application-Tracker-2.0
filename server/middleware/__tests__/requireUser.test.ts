import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createRequireUser, type TokenVerifier } from '../requireUser.ts';

const verify: TokenVerifier = async (token) => (token === 'good-token' ? { id: 'user-a', email: 'a@example.com' } : null);

let server: http.Server;
let baseUrl: string;
const originalEnv = { ...process.env };

beforeAll(async () => {
  const app = express();
  app.use('/api', createRequireUser(verify), (req, res) =>
    res.json({ success: true, user: req.user, scopeUser: req.jobScope?.userId, hasDb: !!req.jobScope?.db })
  );
  server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  process.env = { ...originalEnv };
});

function useSupabase() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
}

describe('requireUser', () => {
  it('runs as the single local user when Supabase is not configured in development', async () => {
    delete process.env.SUPABASE_URL;
    process.env.NODE_ENV = 'development';
    const body = await (await fetch(`${baseUrl}/api`)).json();
    expect(body.user.id).toBe('local-dev-user');
    expect(body.hasDb).toBe(false);
  });

  it('refuses to serve in production without Supabase', async () => {
    delete process.env.SUPABASE_URL;
    process.env.NODE_ENV = 'production';
    expect((await fetch(`${baseUrl}/api`)).status).toBe(503);
  });

  it('refuses to serve when the anon key is missing', async () => {
    useSupabase();
    delete process.env.SUPABASE_ANON_KEY;
    expect((await fetch(`${baseUrl}/api`)).status).toBe(503);
  });

  it('asks for sign-in without a token', async () => {
    useSupabase();
    const res = await fetch(`${baseUrl}/api`);
    expect(res.status).toBe(401);
    expect((await res.json()).authRequired).toBe(true);
  });

  it('rejects an invalid token', async () => {
    useSupabase();
    const res = await fetch(`${baseUrl}/api`, { headers: { Authorization: 'Bearer forged' } });
    expect(res.status).toBe(401);
  });

  it('scopes the request to the verified user', async () => {
    useSupabase();
    const res = await fetch(`${baseUrl}/api`, { headers: { Authorization: 'Bearer good-token' } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.user).toEqual({ id: 'user-a', email: 'a@example.com' });
    expect(body.scopeUser).toBe('user-a');
    expect(body.hasDb).toBe(true);
  });
});
