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
  const rawA = companyA.toLowerCase().trim();
  const rawB = companyB.toLowerCase().trim();
  if (rawA === rawB) return true;

  const normA = normalizeCompany(companyA);
  const normB = normalizeCompany(companyB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

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
 * Normalizes a role / job title.
 * Removes parenthetical locations, seniority brackets, extra symbols.
 */
export function normalizeRole(title?: string | null): string {
  if (!title) return '';
  let cleaned = title.toLowerCase().trim();
  // Strip parenthesized text like (Remote), (Hybrid), [Remote]
  cleaned = cleaned.replace(/[\(\[][^\)\]]*[\)\]]/g, ' ');
  // Strip punctuation
  cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"@+?|–—]/g, ' ');
  // Collapse whitespace
  return cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Determines whether two job titles / roles match.
 */
export function isRoleMatch(roleA?: string | null, roleB?: string | null): boolean {
  if (!roleA || !roleB) return false;
  const normA = normalizeRole(roleA);
  const normB = normalizeRole(roleB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // Check multi-word phrase containment (e.g. "Senior Product Manager" matches "Senior Product Manager - Care")
  const wordsA = normA.split(' ');
  const wordsB = normB.split(' ');
  if (wordsA.length >= 2 && wordsB.length >= 2) {
    if (normA.includes(normB) || normB.includes(normA)) {
      return true;
    }
  }

  return false;
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
 * Scans existing tracker jobs and returns all matches for potentially duplicate
 * roles or companies from any application applied during the past 6 months.
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

    const compMatch = Boolean(candidate.company && isCompanyMatch(candidate.company, existing.company));
    const roleMatch = Boolean(candidate.jobTitle && isRoleMatch(candidate.jobTitle, existing.jobTitle));
    const urlMatch = Boolean(
      candidate.url &&
      existing.url &&
      candidate.url.trim().toLowerCase() === existing.url.trim().toLowerCase()
    );

    if (compMatch || roleMatch || urlMatch) {
      let matchType: DuplicateMatchType;
      const matchedFields: ('company' | 'role')[] = [];
      let reason = '';

      if (urlMatch || (compMatch && roleMatch)) {
        matchType = 'both';
        matchedFields.push('company', 'role');
        reason = `Applied for the same role (${existing.jobTitle}) at ${existing.company} ${timeAgoLabel}`;
      } else if (compMatch) {
        matchType = 'company';
        matchedFields.push('company');
        reason = `Applied to ${existing.company} for "${existing.jobTitle}" ${timeAgoLabel}`;
      } else {
        matchType = 'role';
        matchedFields.push('role');
        reason = `Applied for the matching role "${existing.jobTitle}" at ${existing.company} ${timeAgoLabel}`;
      }

      matches.push({
        existingJob: existing,
        matchType,
        matchedFields,
        appliedDateStr,
        daysAgo,
        timeAgoLabel,
        reason,
      });
    }
  }

  // Sort matches: 'both' first, then 'company', then 'role', and within that by newest applied date (smallest daysAgo)
  matches.sort((a, b) => {
    const priority = { both: 0, company: 1, role: 2 };
    if (priority[a.matchType] !== priority[b.matchType]) {
      return priority[a.matchType] - priority[b.matchType];
    }
    return a.daysAgo - b.daysAgo;
  });

  return matches;
}
