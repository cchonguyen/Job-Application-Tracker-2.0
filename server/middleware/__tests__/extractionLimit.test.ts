import { afterEach, describe, expect, it } from 'vitest';
import { resetExtractionUsage, takeDailyUsage, takeExtraction } from '../extractionLimit.ts';

const original = process.env.EXTRACTION_DAILY_LIMIT;

afterEach(() => {
  resetExtractionUsage();
  if (original === undefined) delete process.env.EXTRACTION_DAILY_LIMIT;
  else process.env.EXTRACTION_DAILY_LIMIT = original;
});

describe('daily extraction limit', () => {
  it('stops each user at the limit without affecting others', () => {
    process.env.EXTRACTION_DAILY_LIMIT = '2';
    const day = new Date('2026-10-17T10:00:00Z');
    expect(takeExtraction('a', day)).toBe(true);
    expect(takeExtraction('a', day)).toBe(true);
    expect(takeExtraction('a', day)).toBe(false);
    expect(takeExtraction('b', day)).toBe(true);
  });

  it('resets at the next UTC day', () => {
    process.env.EXTRACTION_DAILY_LIMIT = '1';
    expect(takeExtraction('a', new Date('2026-10-17T23:59:00Z'))).toBe(true);
    expect(takeExtraction('a', new Date('2026-10-17T23:59:30Z'))).toBe(false);
    expect(takeExtraction('a', new Date('2026-10-18T00:00:10Z'))).toBe(true);
  });

  it('counts company lookups separately from extractions', () => {
    process.env.EXTRACTION_DAILY_LIMIT = '1';
    const day = new Date('2026-10-17T10:00:00Z');
    expect(takeExtraction('company-facts:a', day)).toBe(true);
    expect(takeExtraction('company-facts:a', day)).toBe(false);
    expect(takeExtraction('a', day)).toBe(true);
  });

  it('is off when set to 0', () => {
    process.env.EXTRACTION_DAILY_LIMIT = '0';
    for (let i = 0; i < 100; i++) expect(takeExtraction('a')).toBe(true);
  });
});

describe('takeDailyUsage', () => {
  const scopeWith = (rpc: (...args: any[]) => Promise<{ data: unknown; error: unknown }>) =>
    ({ userId: 'user-a', db: { rpc } }) as any;

  it('uses the Supabase counter when it answers', async () => {
    process.env.EXTRACTION_DAILY_LIMIT = '5';
    const calls: any[] = [];
    const scope = scopeWith(async (...args) => {
      calls.push(args);
      return { data: false, error: null };
    });
    expect(await takeDailyUsage(scope, 'extraction')).toBe(false);
    expect(calls).toEqual([['take_daily_usage', { p_kind: 'extraction', p_limit: 5 }]]);
  });

  it('falls back to counting in memory when the counter is missing', async () => {
    process.env.EXTRACTION_DAILY_LIMIT = '1';
    const scope = scopeWith(async () => ({ data: null, error: { message: 'function not found' } }));
    expect(await takeDailyUsage(scope, 'extraction')).toBe(true);
    expect(await takeDailyUsage(scope, 'extraction')).toBe(false);
  });
});
