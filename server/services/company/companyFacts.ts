import type { JobRecord } from '../../../src/types.ts';
import { companyFactsForDisplay } from '../../../src/lib/formatHelpers.ts';
import { searchCompanyFactsWithGemini } from './geminiCompanySearch.ts';
import { CompanyFacts, FACT_FIELDS, FactField } from './types.ts';
import { lookupWikidataCompany, normalizeCompanyName } from './wikidata.ts';

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const PLACEHOLDER_NAMES = new Set(['', 'unknown', 'unknown company', 'company', 'target company']);

type Lookup = Partial<CompanyFacts> | null;
const cache = new Map<string, { at: number; wikidata: Lookup; search?: Lookup }>();

export interface CompanyFactsDeps {
  wikidata: (company: string) => Promise<Lookup>;
  search: (company: string, context: { jobUrl?: string; jobTitle?: string }) => Promise<Lookup>;
}

const defaultDeps: CompanyFactsDeps = {
  wikidata: (company) => lookupWikidataCompany(company),
  search: (company, context) => searchCompanyFactsWithGemini(company, context),
};

const isKnown = (value?: string | number) => value !== undefined && value !== null && String(value).trim() !== '' && String(value) !== 'Unknown';

function knownFields(meta?: JobRecord['companyMetadata']): Partial<CompanyFacts> {
  // companyFactsForDisplay also discards the pre-0.3.0 hard-coded placeholder trio.
  const shown = companyFactsForDisplay(meta);
  const out: Partial<CompanyFacts> = {};
  for (const f of FACT_FIELDS) if (isKnown(shown[f])) (out as any)[f] = shown[f];
  return out;
}

async function safely(fn: () => Promise<Lookup>): Promise<Lookup> {
  try {
    return await fn();
  } catch (err: any) {
    console.warn('Company facts lookup failed:', err?.message || err);
    return null;
  }
}

export function clearCompanyFactsCache() {
  cache.clear();
}

/**
 * Real facts about the employer for a job, each field from the first source that states it:
 * Wikidata, then facts already saved on other jobs at the same company, then the posting extraction,
 * then a Google-Search-grounded Gemini lookup for whatever is still missing. Anything no source states stays Unknown.
 */
export async function resolveCompanyFacts(
  input: {
    company: string;
    extracted?: JobRecord['companyMetadata'];
    existingJobs?: JobRecord[];
    jobUrl?: string;
    jobTitle?: string;
    checkAiQuota?: () => Promise<boolean> | boolean;
  },
  deps: CompanyFactsDeps = defaultDeps
): Promise<CompanyFacts> {
  const key = normalizeCompanyName(input.company || '');
  const facts: CompanyFacts = { headcount: 'Unknown', headquarters: 'Unknown', ownership: 'Unknown', foundingYear: 'Unknown' };
  const sources: string[] = [];

  const apply = (found: Partial<CompanyFacts> | null | undefined, label?: string) => {
    if (!found) return;
    let used = false;
    for (const f of FACT_FIELDS) {
      if (facts[f] === 'Unknown' && isKnown(found[f])) {
        (facts as any)[f] = String(found[f]);
        used = true;
      }
    }
    if (used && label) sources.push(label);
  };
  const missing = (): FactField[] => FACT_FIELDS.filter((f) => facts[f] === 'Unknown');

  if (PLACEHOLDER_NAMES.has(key)) {
    apply(knownFields(input.extracted), 'job posting');
    return facts;
  }

  let entry = cache.get(key);
  if (!entry || Date.now() - entry.at > CACHE_TTL_MS) {
    entry = { at: Date.now(), wikidata: await safely(() => deps.wikidata(input.company)) };
    cache.set(key, entry);
  }
  apply(entry.wikidata, entry.wikidata?.source);

  if (missing().length) {
    const sameCompany = (input.existingJobs || [])
      .filter((j) => normalizeCompanyName(j.company || '') === key)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    for (const job of sameCompany) apply(knownFields(job.companyMetadata), job.companyMetadata?.source || 'earlier job');
  }

  if (missing().length) apply(knownFields(input.extracted), 'job posting');

  if (missing().length) {
    if (entry.search !== undefined) {
      apply(entry.search, entry.search?.source);
    } else {
      const allowed = input.checkAiQuota ? await input.checkAiQuota() : true;
      if (allowed) {
        entry.search = await safely(() => deps.search(input.company, { jobUrl: input.jobUrl, jobTitle: input.jobTitle }));
        apply(entry.search, entry.search?.source);
      }
    }
  }

  const unique = [...new Set(sources)];
  if (unique.length) facts.source = unique.join(' + ');
  return facts;
}
