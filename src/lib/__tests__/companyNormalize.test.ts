import { describe, it, expect } from 'vitest';
import { normalizeCompanyName } from '../companyName';
import { normalizeCompany } from '../duplicateDetection';
import { normalizeCompanyName as normalizeWikidataCompanyName } from '../../../server/services/company/wikidata';

// Characterization of the three company-name rule sets, recorded from the
// implementations that existed before they moved into companyName.ts.
// Columns: input, 'match' (duplicate detection), 'mail' (Gmail matching), 'exact' (Wikidata lookup).
const CASES: Array<[string, string, string, string]> = [
  ['Stripe, Inc.', 'stripe', 'stripe', 'stripe'],
  ['Airbnb LLC', 'airbnb', 'airbnb', 'airbnb'],
  ['The New York Times Company', 'new york times', 'the new york times', 'the new york times'],
  ['Globex Systems', 'globex', 'globex systems', 'globex systems'],
  ['AT&T Corp', 'at t', 'at t', 'at and t'],
  ['Maven Clinic, Inc.', 'maven clinic', 'maven clinic', 'maven clinic'],
  ['Société Générale SA', 'société générale sa', 'société générale sa', 'soci t g n rale'],
  ['Zürich Insurance Group', 'zürich insurance', 'zürich insurance', 'z rich insurance group'],
  ['Acme (US)', 'acme', 'acme us', 'acme us'],
  ['Palantir Technologies', 'palantir', 'palantir', 'palantir technologies'],
  ['Global Payments', 'payments', 'global payments', 'global payments'],
  ['Co-op Labs', 'op', 'co op', 'op labs'],
  ['Tech Holdings Ltd', '', 'tech holdings', 'tech holdings'],
  ['', '', '', ''],
  ['  ', '', '', ''],
  ['UPS', 'ups', 'ups', 'ups'],
  ['Meta Platforms, Inc.', 'meta platforms', 'meta platforms', 'meta platforms'],
  ['Johnson & Johnson', 'johnson johnson', 'johnson johnson', 'johnson and johnson'],
  ['International Business Machines Corporation', 'business machines', 'international business machines', 'international business machines'],
  ['Notion Labs', 'notion', 'notion', 'notion labs'],
  ['Scale AI', 'scale ai', 'scale ai', 'scale ai'],
  ['Two Sigma', 'two sigma', 'two sigma', 'two sigma'],
  ['Rippling', 'rippling', 'rippling', 'rippling'],
  ['X Corp.', 'x', 'x', 'x'],
  ['Dropbox, Inc', 'dropbox', 'dropbox', 'dropbox'],
  ['DoorDash Inc', 'doordash', 'doordash', 'doordash'],
  ['Acme Limited Company', 'acme', 'acme limited', 'acme'],
];

describe('normalizeCompanyName (characterization)', () => {
  it.each(CASES)('%j at level match', (input, match) => {
    expect(normalizeCompanyName(input, 'match')).toBe(match);
  });

  it.each(CASES)('%j at level mail', (input, _match, mail) => {
    expect(normalizeCompanyName(input, 'mail')).toBe(mail);
  });

  it.each(CASES)('%j at level exact', (input, _match, _mail, exact) => {
    expect(normalizeCompanyName(input, 'exact')).toBe(exact);
  });

  it('returns an empty string for null and undefined at every level', () => {
    for (const level of ['match', 'mail', 'exact'] as const) {
      expect(normalizeCompanyName(null, level)).toBe('');
      expect(normalizeCompanyName(undefined, level)).toBe('');
    }
  });
});

describe('legacy entry points keep their outputs', () => {
  it.each(CASES)('duplicate normalizeCompany(%j) equals the match level', (input, match) => {
    expect(normalizeCompany(input)).toBe(match);
  });

  it.each(CASES)('wikidata normalizeCompanyName(%j) equals the exact level', (input, _match, _mail, exact) => {
    expect(normalizeWikidataCompanyName(input)).toBe(exact);
  });
});
