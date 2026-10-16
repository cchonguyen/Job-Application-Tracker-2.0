import type { JobRecord } from '../types';

export type DuplicateMatchType = 'both' | 'company' | 'role';

export interface DuplicateMatch {
  existingJob: JobRecord;
  matchType: DuplicateMatchType;
  matchedFields: ('company' | 'role')[];
  appliedDateStr: string;
  daysAgo: number;
  timeAgoLabel: string;
  reason: string;
}

export interface DuplicateDetectionResult {
  hasDuplicate: boolean;
  matches: DuplicateMatch[];
}

/**
 * Stop-words and corporate entity noise tokens stripped during company normalization.
 */
const COMPANY_STOP_WORDS = new Set([
  'the',
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'technologies',
  'technology',
  'tech',
  'solutions',
  'labs',
  'group',
  'holdings',
  'enterprises',
  'services',
  'systems',
  'global',
  'international',
]);

/**
 * Normalizes a company name for fuzzy duplicate comparison.
 * e.g., "Stripe, Inc." -> "stripe", "Veeva Systems" -> "veeva"
 */
export function normalizeCompany(name?: string | null): string {
  if (!name) return '';
  let cleaned = name.toLowerCase().trim();
  // Strip parenthesized text like (US), (Remote)
  cleaned = cleaned.replace(/\([^)]*\)/g, ' ');
  // Replace punctuation and symbols with space
  cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"@+?|–—]/g, ' ');
  // Filter stop words
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !COMPANY_STOP_WORDS.has(t));

  return tokens.join(' ');
}

/**
 * Determines whether two company names represent the same company.
 */
export function isCompanyMatch(companyA?: string | null, companyB?: string | null): boolean {
  if (!companyA || !companyB) return false;
  if (isPlaceholder(normalizeCompany(companyA)) || isPlaceholder(normalizeCompany(companyB))) return false;
  const rawA = companyA.toLowerCase().trim();
  const rawB = companyB.toLowerCase().trim();
  if (rawA === rawB) return true;

  const normA = normalizeCompany(companyA);
  const normB = normalizeCompany(companyB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  // "Mavenclinic" vs "Maven Clinic"
  if (normA.replace(/ /g, '') === normB.replace(/ /g, '')) return true;

  const tokensA = normA.split(' ').filter(Boolean);
  const tokensB = normB.split(' ').filter(Boolean);

  // If one company is a single distinctive token (min 3 chars) and starts the other
  // e.g. "meta" and "meta platforms", or "amazon" and "amazon web"
  if (tokensA.length === 1 && tokensB.length > 1 && tokensA[0].length >= 3 && tokensB[0] === tokensA[0]) {
    return true;
  }
  if (tokensB.length === 1 && tokensA.length > 1 && tokensB[0].length >= 3 && tokensA[0] === tokensB[0]) {
    return true;
  }

  return false;
}

/**
 * Values the extractor stores when it could not read a company or title. Two
 * jobs that both say "Unknown" say nothing about being the same posting.
 */
const PLACEHOLDER_VALUES = new Set(['unknown', 'n a', 'na', 'none', 'not listed', 'tbd', 'confidential']);

function isPlaceholder(normalized: string): boolean {
  return !normalized || PLACEHOLDER_VALUES.has(normalized);
}

/** Common title abbreviations, expanded so "Sr. PM" style titles compare cleanly. */
const ROLE_ABBREVIATIONS: Record<string, string> = {
  sr: 'senior',
  snr: 'senior',
  jr: 'junior',
  mgr: 'manager',
  eng: 'engineer',
  swe: 'software engineer',
  pm: 'product manager',
  vp: 'vice president',
};

/**
 * Seniority markers. Two titles that differ only in these ("Product Manager"
 * vs "Senior Product Manager") are different openings, not the same one.
 */
const SENIORITY_TOKENS = new Set([
  'intern',
  'junior',
  'associate',
  'senior',
  'staff',
  'principal',
  'lead',
  'head',
  'director',
  'vice',
  'president',
  'chief',
  'i',
  'ii',
  'iii',
  'iv',
  'v',
  '1',
  '2',
  '3',
  '4',
  '5',
]);

/**
 * Normalizes a role / job title.
 * Removes parenthetical locations, seniority brackets, extra symbols and
 * expands common abbreviations.
 */
export function normalizeRole(title?: string | null): string {
  if (!title) return '';
  let cleaned = title.toLowerCase().trim();
  // Strip parenthesized text like (Remote), (Hybrid), [Remote]
  cleaned = cleaned.replace(/[\(\[][^\)\]]*[\)\]]/g, ' ');
  // Strip punctuation
  cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"@+?|–—]/g, ' ');
  // Collapse whitespace and expand abbreviations
  return cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => ROLE_ABBREVIATIONS[w] || w)
    .join(' ');
}

function seniorityKey(tokens: string[]): string {
  return tokens.filter((t) => SENIORITY_TOKENS.has(t)).sort().join(' ');
}

/** True when `needle` appears as a contiguous run of whole words inside `haystack`. */
function containsTokenRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((t, j) => haystack[i + j] === t)) return true;
  }
  return false;
}

/**
 * Determines whether two job titles describe the same opening.
 * Titles must share the same seniority, and one must equal the other or
 * contain it whole (e.g. "Senior Product Manager" vs
 * "Senior Product Manager - Care Delivery").
 */
export function isRoleMatch(roleA?: string | null, roleB?: string | null): boolean {
  if (!roleA || !roleB) return false;
  const normA = normalizeRole(roleA);
  const normB = normalizeRole(roleB);
  if (isPlaceholder(normA) || isPlaceholder(normB)) return false;
  if (normA === normB) return true;

  const wordsA = normA.split(' ');
  const wordsB = normB.split(' ');
  if (seniorityKey(wordsA) !== seniorityKey(wordsB)) return false;

  // Containment needs a title of at least two words, so "Manager" alone
  // never swallows every manager role.
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  if (shorter.length < 2) return false;
  return containsTokenRun(longer, shorter);
}

/**
 * Normalizes a posting URL so the same listing compares equal regardless of
 * protocol, "www.", tracking parameters, fragments or a trailing slash.
 * Query parameters that identify the job (gh_jid, jobId, etc.) are kept.
 */
export function normalizeJobUrl(url?: string | null): string {
  if (!url) return '';
  const raw = url.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    const keep = [...parsed.searchParams.entries()]
      .filter(([k]) => /^(gh_jid|jid|job_?id|id|req(uisition)?_?id|posting_?id)$/i.test(k))
      .map(([k, v]) => `${k.toLowerCase()}=${v}`)
      .sort()
      .join('&');
    return `${host}${path}${keep ? `?${keep}` : ''}`;
  } catch {
    return raw.toLowerCase().replace(/[#?].*$/, '').replace(/\/+$/, '');
  }
}

/**
 * Resolves the application date for a job record.
 * Uses dateApplied if available.
 * If dateApplied is null but status indicates applied action (not purely 'Saved'),
 * falls back to dateAdded or createdAt.
 */
export function getApplicationDate(job: JobRecord): Date | null {
  if (job.dateApplied) {
    const raw = job.dateApplied.trim();
    const iso = raw.includes('T') ? raw : `${raw}T00:00:00`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }

  // If status is an applied status but dateApplied wasn't populated:
  if (job.status && job.status !== 'Saved') {
    const fallback = job.dateAdded || job.createdAt;
    if (fallback) {
      const raw = fallback.trim();
      const iso = raw.includes('T') ? raw : `${raw}T00:00:00`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

/**
 * Formats a relative time description (e.g., "today", "yesterday", "14 days ago", "2 months ago").
 */
export function formatTimeAgo(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}

/**
 * Checks if a job was applied within the past N months (default 6 months).
 */
export function isAppliedWithinPastMonths(
  job: JobRecord,
  months = 6,
  referenceDate = new Date()
): boolean {
  const appDate = getApplicationDate(job);
  if (!appDate) return false;

  const cutoff = new Date(referenceDate);
  cutoff.setMonth(cutoff.getMonth() - months);

  // Must be applied on or after cutoff
  return appDate.getTime() >= cutoff.getTime();
}

/**
 * Scans existing tracker jobs and returns applications from the past 6 months
 * at the same company (same role ranked first) or with the same posting URL.
 * The same title at a different company is not a match. Matches are informational; a confirmed re-ingest is
 * always saved as a new row.
 */
export function findPastSixMonthsDuplicates(
  candidate: { company?: string; jobTitle?: string; url?: string; id?: string },
  existingJobs: JobRecord[],
  referenceDate = new Date(),
  months = 6
): DuplicateMatch[] {
  if (!candidate || (!candidate.company && !candidate.jobTitle && !candidate.url)) {
    return [];
  }

  const matches: DuplicateMatch[] = [];

  for (const existing of existingJobs) {
    // Skip if comparing against itself
    if (candidate.id && existing.id === candidate.id) continue;

    // Must be applied within the past 6 months
    if (!isAppliedWithinPastMonths(existing, months, referenceDate)) {
      continue;
    }

    const appDate = getApplicationDate(existing);
    const daysAgo = appDate
      ? Math.max(0, Math.floor((referenceDate.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    const appliedDateStr = existing.dateApplied || (appDate ? appDate.toISOString().split('T')[0] : 'Past 6 months');
    const timeAgoLabel = formatTimeAgo(daysAgo);

    const urlA = normalizeJobUrl(candidate.url);
    const urlMatch = Boolean(urlA && urlA === normalizeJobUrl(existing.url));
    const compMatch = Boolean(
      candidate.company &&
        !isPlaceholder(normalizeCompany(candidate.company)) &&
        isCompanyMatch(candidate.company, existing.company)
    );
    const roleMatch = compMatch && isRoleMatch(candidate.jobTitle, existing.jobTitle);

    // The same title at a different company is a normal part of a job search
    // and is not flagged. Any role at the same company is, since one
    // application there can be considered for several openings.
    if (!urlMatch && !compMatch) continue;

    const sameRole = urlMatch || roleMatch;
    matches.push({
      existingJob: existing,
      matchType: sameRole ? 'both' : 'company',
      matchedFields: sameRole ? ['company', 'role'] : ['company'],
      appliedDateStr,
      daysAgo,
      timeAgoLabel,
      reason: urlMatch
        ? `Applied to this same posting (${existing.jobTitle} at ${existing.company}) ${timeAgoLabel}`
        : roleMatch
        ? `Applied for the same role (${existing.jobTitle}) at ${existing.company} ${timeAgoLabel}`
        : `Applied to ${existing.company} for "${existing.jobTitle}" ${timeAgoLabel}`,
    });
  }

  // Same role first, then other roles at the company; newest first within each
  matches.sort((a, b) => {
    if (a.matchType !== b.matchType) return a.matchType === 'both' ? -1 : 1;
    return a.daysAgo - b.daysAgo;
  });

  return matches;
}
