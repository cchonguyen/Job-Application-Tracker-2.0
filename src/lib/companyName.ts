// Shared, dependency-free helpers for deriving a clean employer brand name from
// the noisy signals available on job postings (URL slugs, page <title>, og tags).
// Kept pure and framework-free so it can be unit tested and reused server-side.

// Words that never represent a real employer brand. Used to reject ATS platform
// names, generic career-site boilerplate, and location/role noise.
export const NON_COMPANY_TOKENS = new Set([
  'workable',
  'greenhouse',
  'lever',
  'ashby',
  'ashbyhq',
  'gem',
  'workday',
  'darwinbox',
  'smartrecruiters',
  'icims',
  'jobvite',
  'bamboohr',
  'recruitee',
  'breezy',
  'pinpoint',
  'teamtailor',
  'personio',
  'rippling',
  'dover',
  'jazzhr',
  'paylocity',
  'taleo',
  'oracle',
  'successfactors',
  'linkedin',
  'indeed',
  'glassdoor',
  'wellfound',
  'angellist',
  'builtin',
  'ziprecruiter',
  'yc',
  'ycombinator',
  'applytojob',
  'apply',
  'jobs',
  'job',
  'careers',
  'career',
  'hiring',
  'openings',
  'current openings',
  'job application',
  'job posting',
  'we are hiring',
  'join us',
  'join our team',
  'home',
]);

// Role/seniority keywords that indicate a title segment rather than a brand.
const ROLE_KEYWORDS =
  /\b(manager|engineer|developer|architect|designer|analyst|scientist|specialist|consultant|director|lead|intern|internship|administrator|coordinator|associate|representative|recruiter|accountant|counsel|officer|president|vp|head\s+of|technician|nurse|physician|marketer|strategist|writer|editor|producer|owner|agent|supervisor|clerk|assistant|advisor|ambassador)\b/i;

function stripLegalNoise(value: string): string {
  return value
    .replace(/\((?:remote|hybrid|on-?site|us|usa|uk|emea|apac|contract|full-?time|part-?time)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeCompany(candidate: string): boolean {
  const cleaned = candidate.trim();
  if (cleaned.length < 2 || cleaned.length > 60) return false;
  if (NON_COMPANY_TOKENS.has(cleaned.toLowerCase())) return false;
  if (ROLE_KEYWORDS.test(cleaned)) return false;
  // Reject pure numbers / ids.
  if (/^[\d\W]+$/.test(cleaned)) return false;
  return true;
}

/**
 * Convert a URL/account slug into a human company name.
 * e.g. "innovaccer-analytics" -> "Innovaccer Analytics", "acme_inc" -> "Acme Inc".
 */
export function slugToCompanyName(slug: string): string {
  const words = decodeURIComponent(slug)
    .replace(/[._]+/g, '-')
    .split('-')
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => (/^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w));
  return words.join(' ').trim();
}

/**
 * Derive the employer brand from a page <title> / og:title.
 *
 * Handles the dominant ATS title conventions:
 *   "{Role} - {Company}"            (Workable, Lever)
 *   "{Role} at {Company}"           (many career pages)
 *   "{Company} - Current Openings"  (board landing pages)
 *   "{Role} - {Team} - {Company}"   (multi-segment)
 *
 * Returns null when no confident brand can be isolated.
 */
export function deriveCompanyFromTitle(rawTitle?: string | null): string | null {
  if (!rawTitle) return null;
  const title = rawTitle.replace(/\s+/g, ' ').trim();
  if (!title) return null;

  // "{Role} at {Company}" — company is everything after the last " at ".
  const atMatch = title.match(/\bat\s+([^|\-–—]+)$/i);
  if (atMatch) {
    const candidate = stripLegalNoise(atMatch[1]);
    if (looksLikeCompany(candidate)) return candidate;
  }

  // Split on common separators (" - ", " – ", " — ", " | ") and inspect segments.
  const segments = title
    .split(/\s+[-–—|]\s+/)
    .map((s) => stripLegalNoise(s))
    .filter(Boolean);

  if (segments.length >= 2) {
    // Prefer the trailing segment (ATS convention: "{Role} - {Company}"),
    // skipping generic boilerplate like "Current Openings" or "Careers".
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (looksLikeCompany(seg)) return seg;
    }
  }

  return null;
}

/**
 * Legal-entity words shared by the 'match' and 'exact' levels. 'mail' keeps its
 * own trailing-only list (see MAIL_TRAILING_SUFFIXES) because it never stripped
 * "incorporated" or "limited".
 */
const LEGAL_ENTITY_WORDS: readonly string[] = [
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
];

/** 'match': words dropped anywhere in a name for duplicate detection. */
const MATCH_STOP_WORDS = new Set<string>([
  ...LEGAL_ENTITY_WORDS,
  'the',
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

/** 'mail': words dropped only from the end of a name when matching Gmail senders and subjects. */
const MAIL_TRAILING_SUFFIXES = new Set<string>([
  'inc',
  'llc',
  'ltd',
  'corp',
  'corporation',
  'co',
  'company',
  'technologies',
  'labs',
  'group',
]);

/** 'exact': legal forms dropped anywhere in a name for Wikidata / company-facts lookup. */
const EXACT_LEGAL_FORM_PATTERN = new RegExp(
  `\\b(${[...LEGAL_ENTITY_WORDS, 'gmbh', 'plc', 'sa', 'ag', 'bv', 'pbc'].join('|')})\\b`,
  'g'
);

/**
 * Reduces a company name to a comparison key. One home for the three rule sets:
 *
 * - 'match': duplicate detection. Lowercases, drops text in parentheses and
 *   punctuation, then removes stop words and legal suffixes wherever they appear.
 *   e.g. "Stripe, Inc." -> "stripe", "Globex Systems" -> "globex".
 * - 'mail': Gmail matching. Keeps letters and digits in any script, then removes
 *   legal suffixes only from the end. e.g. "Maven Clinic, Inc." -> "maven clinic".
 * - 'exact': Wikidata / company-facts lookup. Turns "&" into "and", keeps ASCII
 *   letters and digits only, and removes legal forms (Inc, GmbH, SA, ...) anywhere.
 *   e.g. "Johnson & Johnson" -> "johnson and johnson".
 *
 * Returns '' for null, undefined or blank input.
 */
export function normalizeCompanyName(
  name: string | null | undefined,
  level: 'match' | 'mail' | 'exact'
): string {
  if (!name) return '';

  if (level === 'match') {
    let cleaned = name.toLowerCase().trim();
    // Strip parenthesized text like (US), (Remote)
    cleaned = cleaned.replace(/\([^)]*\)/g, ' ');
    // Replace punctuation and symbols with space
    cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"@+?|–—]/g, ' ');
    return cleaned
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !MATCH_STOP_WORDS.has(t))
      .join(' ');
  }

  if (level === 'mail') {
    const tokens = name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
    while (tokens.length > 0 && MAIL_TRAILING_SUFFIXES.has(tokens[tokens.length - 1])) {
      tokens.pop();
    }
    return tokens.join(' ');
  }

  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(EXACT_LEGAL_FORM_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
