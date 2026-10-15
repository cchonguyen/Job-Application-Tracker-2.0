import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { requireApiKey } from '../requireApiKey.ts';

let server: http.Server;
let baseUrl: string;
const originalKey = process.env.API_ACCESS_KEY;
const originalNodeEnv = process.env.NODE_ENV;

beforeAll(async () => {
  const app = express();
  app.use('/api', requireApiKey, (_req, res) => res.json({ success: true }));
  server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.API_ACCESS_KEY;
  else process.env.API_ACCESS_KEY = originalKey;
  process.env.NODE_ENV = originalNodeEnv;
});

describe('requireApiKey', () => {
  it('rejects calls without the key', async () => {
    process.env.API_ACCESS_KEY = 'secret-key';
    const res = await fetch(`${baseUrl}/api/jobs`);
    expect(res.status).toBe(401);
    expect((await res.json()).authRequired).toBe(true);
  });

  it('rejects a wrong key', async () => {
    process.env.API_ACCESS_KEY = 'secret-key';
    const res = await fetch(`${baseUrl}/api/jobs`, { headers: { Authorization: 'Bearer nope' } });
    expect(res.status).toBe(401);
  });

  it('accepts the key as a bearer token or X-Api-Key header', async () => {
    process.env.API_ACCESS_KEY = 'secret-key';
    const bearer = await fetch(`${baseUrl}/api/jobs`, { headers: { Authorization: 'Bearer secret-key' } });
    const header = await fetch(`${baseUrl}/api/jobs`, { headers: { 'X-Api-Key': 'secret-key' } });
    expect(bearer.status).toBe(200);
    expect(header.status).toBe(200);
  });

  it('stays open for local development when no key is configured', async () => {
    delete process.env.API_ACCESS_KEY;
    process.env.NODE_ENV = 'development';
    const res = await fetch(`${baseUrl}/api/jobs`);
    expect(res.status).toBe(200);
  });

  it('refuses to serve in production when no key is configured', async () => {
    delete process.env.API_ACCESS_KEY;
    process.env.NODE_ENV = 'production';
    const res = await fetch(`${baseUrl}/api/jobs`);
    expect(res.status).toBe(503);
  });
});
