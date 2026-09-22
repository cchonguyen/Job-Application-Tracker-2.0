import { describe, expect, it } from 'vitest';
import { deriveCompanyFromTitle, slugToCompanyName } from '../companyName';

describe('slugToCompanyName', () => {
  it('title-cases hyphenated account slugs', () => {
    expect(slugToCompanyName('innovaccer-analytics')).toBe('Innovaccer Analytics');
  });

  it('handles underscores and dots', () => {
    expect(slugToCompanyName('acme_inc')).toBe('Acme Inc');
    expect(slugToCompanyName('foo.bar')).toBe('Foo Bar');
  });

  it('preserves existing capitalization for camel/acronym slugs', () => {
    expect(slugToCompanyName('Overjet')).toBe('Overjet');
  });
});

describe('deriveCompanyFromTitle', () => {
  it('extracts the trailing brand from a Workable-style title', () => {
    expect(
      deriveCompanyFromTitle('Senior Product Manager - Population Health - Innovaccer Analytics')
    ).toBe('Innovaccer Analytics');
  });

  it('extracts company after "at"', () => {
    expect(deriveCompanyFromTitle('Staff Software Engineer at Stripe')).toBe('Stripe');
  });

  it('skips generic boilerplate segments', () => {
    expect(deriveCompanyFromTitle('Innovaccer Analytics - Current Openings')).toBe(
      'Innovaccer Analytics'
    );
  });

  it('handles pipe separators', () => {
    expect(deriveCompanyFromTitle('Product Designer | Figma')).toBe('Figma');
  });

  it('returns null when only a role is present', () => {
    expect(deriveCompanyFromTitle('Senior Product Manager')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(deriveCompanyFromTitle('')).toBeNull();
    expect(deriveCompanyFromTitle(undefined)).toBeNull();
  });
});
