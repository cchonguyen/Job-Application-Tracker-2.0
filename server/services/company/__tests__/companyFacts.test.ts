import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCompanyFactsCache, resolveCompanyFacts } from '../companyFacts.ts';
import { lookupWikidataCompany, normalizeCompanyName } from '../wikidata.ts';

beforeEach(() => clearCompanyFactsCache());

describe('resolveCompanyFacts', () => {
  it('prefers Wikidata and only searches for what is still missing', async () => {
    const search = vi.fn().mockResolvedValue({ foundingYear: '2010', source: 'Google Search via Gemini' });
    const facts = await resolveCompanyFacts(
      { company: 'Stripe' },
      {
        wikidata: async () => ({ headcount: '8,000 employees (2023)', headquarters: 'South San Francisco, United States', ownership: 'Private', source: 'Wikidata (Q7624104)' }),
        search,
      }
    );
    expect(facts).toEqual({
      headcount: '8,000 employees (2023)',
      headquarters: 'South San Francisco, United States',
      ownership: 'Private',
      foundingYear: '2010',
      source: 'Wikidata (Q7624104) + Google Search via Gemini',
    });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('reuses facts saved on earlier jobs at the same company before searching', async () => {
    const search = vi.fn();
    const facts = await resolveCompanyFacts(
      {
        company: 'Maven Clinic',
        existingJobs: [
          {
            company: 'Maven Clinic, Inc.',
            createdAt: '2026-10-01T00:00:00Z',
            companyMetadata: { headcount: '600 employees', headquarters: 'New York, NY', ownership: 'Private', foundingYear: '2014' },
          } as any,
        ],
      },
      { wikidata: async () => null, search }
    );
    expect(facts.headquarters).toBe('New York, NY');
    expect(search).not.toHaveBeenCalled();
  });

  it('ignores the old hard-coded placeholder and stays Unknown when no source knows', async () => {
    const facts = await resolveCompanyFacts(
      {
        company: 'Atticus',
        extracted: { headcount: '1,000+ employees', headquarters: 'United States', ownership: 'Private', foundingYear: 'Unknown' },
      },
      { wikidata: async () => null, search: async () => null }
    );
    expect(facts).toEqual({ headcount: 'Unknown', headquarters: 'Unknown', ownership: 'Unknown', foundingYear: 'Unknown' });
  });

  it('survives lookup failures', async () => {
    const facts = await resolveCompanyFacts(
      { company: 'Acme', extracted: { headquarters: 'Austin, TX' } },
      {
        wikidata: async () => {
          throw new Error('timeout');
        },
        search: async () => {
          throw new Error('quota');
        },
      }
    );
    expect(facts.headquarters).toBe('Austin, TX');
    expect(facts.headcount).toBe('Unknown');
  });
});

describe('lookupWikidataCompany', () => {
  const entities = {
    Q1: {
      id: 'Q1',
      labels: { en: { value: 'Stripe' } },
      claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: 'Q4830453' } } } }],
        P159: [{ mainsnak: { datavalue: { value: { id: 'Q49255' } } } }],
        P17: [{ mainsnak: { datavalue: { value: { id: 'Q30' } } } }],
        P571: [{ mainsnak: { datavalue: { value: { time: '+2010-00-00T00:00:00Z' } } } }],
        P1128: [
          { mainsnak: { datavalue: { value: { amount: '+4000' } } }, qualifiers: { P585: [{ datavalue: { value: { time: '+2019-01-01T00:00:00Z' } } }] } },
          { mainsnak: { datavalue: { value: { amount: '+8000' } } }, qualifiers: { P585: [{ datavalue: { value: { time: '+2023-01-01T00:00:00Z' } } }] } },
        ],
      },
      sitelinks: { enwiki: {}, dewiki: {} },
    },
    Q2: { id: 'Q2', labels: { en: { value: 'Stripe' } }, claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q4167410' } } } }] }, sitelinks: {} },
    Q49255: { id: 'Q49255', labels: { en: { value: 'South San Francisco' } } },
    Q30: { id: 'Q30', labels: { en: { value: 'United States' } } },
  } as Record<string, any>;

  const fakeFetch = (async (url: string) => {
    const params = new URL(url).searchParams;
    const body =
      params.get('action') === 'wbsearchentities'
        ? { search: [{ id: 'Q2' }, { id: 'Q1' }] }
        : { entities: Object.fromEntries(params.get('ids')!.split('|').map((id) => [id, entities[id]])) };
    return { ok: true, json: async () => body } as Response;
  }) as typeof fetch;

  it('picks the matching company entity and reads its facts', async () => {
    const facts = await lookupWikidataCompany('Stripe, Inc.', fakeFetch);
    expect(facts).toEqual({
      headcount: '8,000 employees (2023)',
      headquarters: 'South San Francisco, United States',
      foundingYear: '2010',
      ownership: 'Private',
      source: 'Wikidata (Q1)',
    });
  });

  it('returns null when no company entity has that name', async () => {
    expect(await lookupWikidataCompany('Nonexistent Co', fakeFetch)).toBeNull();
  });

  it('normalizes legal suffixes', () => {
    expect(normalizeCompanyName('Maven Clinic, Inc.')).toBe('maven clinic');
    expect(normalizeCompanyName('AT&T Corp')).toBe('at and t');
  });
});
