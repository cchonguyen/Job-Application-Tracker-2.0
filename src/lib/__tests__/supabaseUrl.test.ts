import { describe, expect, it } from 'vitest';
import { normalizeSupabaseUrl } from '../jobsStore';

describe('normalizeSupabaseUrl', () => {
  it('accepts a clean project URL', () => {
    expect(normalizeSupabaseUrl('https://abcdxyz.supabase.co')).toBe('https://abcdxyz.supabase.co');
  });

  it('strips trailing slash and /rest/v1 paths', () => {
    expect(normalizeSupabaseUrl('https://abcdxyz.supabase.co/rest/v1/')).toBe(
      'https://abcdxyz.supabase.co'
    );
  });

  it('adds https when missing', () => {
    expect(normalizeSupabaseUrl('abcdxyz.supabase.co')).toBe('https://abcdxyz.supabase.co');
  });

  it('rejects dashboard links', () => {
    expect(() =>
      normalizeSupabaseUrl('https://supabase.com/dashboard/project/abcdxyz')
    ).toThrow(/dashboard/i);
  });
});
