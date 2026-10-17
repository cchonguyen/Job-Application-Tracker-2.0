import type { CompanyFacts } from './types.ts';

const API = 'https://www.wikidata.org/w/api.php';
const TIMEOUT_MS = 5000;
const USER_AGENT = 'JobApplicationTracker/1.0 (https://github.com/cchonguyen/Job-Application-Tracker-2.0)';

// Wikidata properties and items used below.
const P_INSTANCE_OF = 'P31';
const P_COUNTRY = 'P17';
const P_HEADQUARTERS = 'P159';
const P_INCEPTION = 'P571';
const P_EMPLOYEES = 'P1128';
const P_STOCK_EXCHANGE = 'P414';
const P_PARENT_ORG = 'P749';
const P_OWNED_BY = 'P127';
const P_LEGAL_FORM = 'P1454';
const P_INDUSTRY = 'P452';
const P_WEBSITE = 'P856';
const Q_POINT_IN_TIME = 'P585';
const Q_END_TIME = 'P582';
const NONPROFIT_TYPES = new Set(['Q163740', 'Q2385804']); // nonprofit organization, educational institution

type Claim = {
  rank?: string;
  mainsnak?: { datavalue?: { value?: any } };
  qualifiers?: Record<string, Array<{ datavalue?: { value?: any } }>>;
};
type Entity = {
  id: string;
  labels?: Record<string, { value: string }>;
  aliases?: Record<string, Array<{ value: string }>>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, unknown>;
};

async function getJson(params: Record<string, string>, fetchImpl: typeof fetch): Promise<any> {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`;
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  return res.json();
}

/** Lowercase, drop punctuation and legal suffixes so "Stripe, Inc." matches "Stripe". */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|sa|ag|bv|pbc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const activeClaims = (entity: Entity, prop: string): Claim[] =>
  (entity.claims?.[prop] || []).filter((c) => c.rank !== 'deprecated' && !c.qualifiers?.[Q_END_TIME]);

const entityIdOf = (claim?: Claim): string | undefined => claim?.mainsnak?.datavalue?.value?.id;

function preferred(claims: Claim[]): Claim | undefined {
  return claims.find((c) => c.rank === 'preferred') || claims[0];
}

function looksLikeCompany(entity: Entity): boolean {
  return [P_EMPLOYEES, P_STOCK_EXCHANGE, P_LEGAL_FORM, P_INDUSTRY].some((p) => entity.claims?.[p]?.length) ||
    Boolean(entity.claims?.[P_HEADQUARTERS]?.length && entity.claims?.[P_WEBSITE]?.length);
}

function namesOf(entity: Entity): string[] {
  return [entity.labels?.en?.value, ...(entity.aliases?.en || []).map((a) => a.value)].filter(Boolean) as string[];
}

function latestHeadcount(entity: Entity): string | null {
  const claims = activeClaims(entity, P_EMPLOYEES);
  let best: { amount: number; year: string } | null = null;
  for (const c of claims) {
    const amount = Number(String(c.mainsnak?.datavalue?.value?.amount || '').replace('+', ''));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const time: string = c.qualifiers?.[Q_POINT_IN_TIME]?.[0]?.datavalue?.value?.time || '';
    const year = time.slice(1, 5);
    if (!best || year > best.year) best = { amount, year };
  }
  if (!best) return null;
  return `${Math.round(best.amount).toLocaleString('en-US')} employees${best.year ? ` (${best.year})` : ''}`;
}

function foundingYear(entity: Entity): string | null {
  const time: string | undefined = preferred(activeClaims(entity, P_INCEPTION))?.mainsnak?.datavalue?.value?.time;
  const year = time?.match(/^[+-](\d{4})/)?.[1];
  return year && year !== '0000' ? String(Number(year)) : null;
}

function ownership(entity: Entity): CompanyFacts['ownership'] | null {
  if (activeClaims(entity, P_STOCK_EXCHANGE).length) return 'Public';
  const types = new Set(activeClaims(entity, P_INSTANCE_OF).map(entityIdOf).filter(Boolean) as string[]);
  if ([...types].some((t) => NONPROFIT_TYPES.has(t))) return 'Non-profit';
  if (types.has('Q5225895')) return 'Private'; // privately held company
  // A listed business with no exchange listing and no parent or owner on record is privately held.
  if (!activeClaims(entity, P_PARENT_ORG).length && !activeClaims(entity, P_OWNED_BY).length && !(entity.claims?.[P_STOCK_EXCHANGE]?.length)) {
    return 'Private';
  }
  return null;
}

/**
 * Looks the employer up on Wikidata (free, no key, sourced). Returns only facts Wikidata states; null when the
 * company is not on Wikidata or the name is ambiguous.
 */
export async function lookupWikidataCompany(company: string, fetchImpl: typeof fetch = fetch): Promise<Partial<CompanyFacts> | null> {
  const wanted = normalizeCompanyName(company);
  if (!wanted) return null;

  const search = await getJson(
    { action: 'wbsearchentities', search: company, language: 'en', uselang: 'en', type: 'item', limit: '7' },
    fetchImpl
  );
  const ids: string[] = (search?.search || []).map((s: any) => s.id).filter(Boolean);
  if (!ids.length) return null;

  const details = await getJson(
    { action: 'wbgetentities', ids: ids.join('|'), props: 'labels|aliases|claims|sitelinks', languages: 'en' },
    fetchImpl
  );
  const candidates = ids
    .map((id) => details?.entities?.[id] as Entity | undefined)
    .filter((e): e is Entity => !!e)
    .filter((e) => namesOf(e).some((n) => normalizeCompanyName(n) === wanted))
    .filter(looksLikeCompany)
    .sort((a, b) => Object.keys(b.sitelinks || {}).length - Object.keys(a.sitelinks || {}).length);
  const entity = candidates[0];
  if (!entity) return null;

  const facts: Partial<CompanyFacts> = {};
  const headcount = latestHeadcount(entity);
  if (headcount) facts.headcount = headcount;
  const year = foundingYear(entity);
  if (year) facts.foundingYear = year;
  const own = ownership(entity);
  if (own) facts.ownership = own;

  const hqId = entityIdOf(preferred(activeClaims(entity, P_HEADQUARTERS)));
  const countryId = entityIdOf(preferred(activeClaims(entity, P_COUNTRY)));
  const labelIds = [hqId, countryId].filter(Boolean) as string[];
  if (labelIds.length) {
    const labels = await getJson({ action: 'wbgetentities', ids: labelIds.join('|'), props: 'labels', languages: 'en' }, fetchImpl);
    const hq = hqId ? labels?.entities?.[hqId]?.labels?.en?.value : undefined;
    const country = countryId ? labels?.entities?.[countryId]?.labels?.en?.value : undefined;
    const parts = [hq, country && country !== hq ? country : undefined].filter(Boolean);
    if (parts.length) facts.headquarters = parts.join(', ');
  }

  facts.source = `Wikidata (${entity.id})`;
  return facts;
}
