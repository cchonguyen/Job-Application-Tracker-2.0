import { JobRecord, JobStatus, PositionMetadata, StatusHistoryEntry } from '../types';
import { formatSalaryDisplay, parseSalaryRange } from './salary';
import { STATUS_META } from './statusMeta';

export type WorkArrangementType = 'Remote' | 'Hybrid' | 'Onsite';

export interface WorkArrangementMeta {
  type: WorkArrangementType;
  label: string;
  pillClass: string;
  iconType: 'cloud' | 'building' | 'mapPin';
}

/**
 * Parses location string and position metadata to determine work arrangement (Remote | Hybrid | Onsite).
 */
export function getWorkArrangementMeta(
  location?: string,
  positionMeta?: PositionMetadata
): WorkArrangementMeta {
  const combined = `${location || ''} ${positionMeta?.employmentType || ''}`.toLowerCase();

  if (
    combined.includes('remote') ||
    combined.includes('anywhere') ||
    combined.includes('wfh') ||
    combined.includes('virtual') ||
    combined.includes('distributed')
  ) {
    return {
      type: 'Remote',
      label: 'Remote',
      pillClass: 'bg-slate-100 text-slate-700 border border-slate-200',
      iconType: 'cloud',
    };
  }

  if (
    combined.includes('hybrid') ||
    combined.includes('flexible') ||
    combined.includes('part-time remote')
  ) {
    return {
      type: 'Hybrid',
      label: 'Hybrid',
      pillClass: 'bg-amber-50 text-amber-800 border-amber-200/70',
      iconType: 'building',
    };
  }

  return {
    type: 'Onsite',
    label: 'Onsite',
    pillClass: 'bg-slate-100 text-slate-700 border-slate-200/80',
    iconType: 'mapPin',
  };
}

/**
 * Extracts a concise city/state location (stripping 'Remote' / 'Hybrid' / 'Onsite' tags).
 */
export function getCleanCityLocation(location?: string): string {
  if (!location) return '';
  // Remove parentheticals like (Hybrid), (Remote), (Onsite)
  let cleaned = location
    .replace(/\((.*?)\)/g, '')
    .replace(/^(remote|hybrid|onsite|on-site)\s*[-:—–/]\s*/i, '')
    .replace(/\s*[-:—–/]\s*(remote|hybrid|onsite|on-site)$/i, '')
    .trim();

  const lower = cleaned.toLowerCase();
  if (
    lower === 'remote' ||
    lower === 'hybrid' ||
    lower === 'onsite' ||
    lower === 'on-site' ||
    lower === 'us' ||
    lower === 'usa' ||
    lower === 'united states'
  ) {
    // If it was just "Remote (US)" or "Hybrid", return empty city for clean badge
    if (lower === 'us' || lower === 'usa' || lower === 'united states') {
      return '';
    }
    return '';
  }

  return cleaned;
}

/**
 * Splits stored location into normalized arrangement option and conditional location detail.
 */
export function parseLocationParts(location?: string): {
  arrangement: WorkArrangementType;
  specificLocation: string;
} {
  const meta = getWorkArrangementMeta(location);
  const specificLocation = getCleanCityLocation(location);
  return {
    arrangement: meta.type,
    specificLocation,
  };
}

/**
 * Formats normalized arrangement and conditional location string for storage.
 */
export function formatNormalizedLocation(
  arrangement: WorkArrangementType,
  specificLocation?: string
): string {
  const cleanCity = (specificLocation || '').trim();
  if (arrangement === 'Remote') {
    return cleanCity ? `Remote - ${cleanCity}` : 'Remote';
  }
  if (arrangement === 'Hybrid') {
    return cleanCity ? `Hybrid - ${cleanCity}` : 'Hybrid';
  }
  // Onsite
  return cleanCity ? `Onsite - ${cleanCity}` : 'Onsite';
}

/**
 * Formats salary strictly as '100k' without dollar signs (e.g. '195k - 275k', '120k', '120k+').
 * If truncateDecimals is true (used in Compact view), values are truncated before decimal points (e.g. 195.5k -> 195k).
 */
export function formatMicroSalary(
  rawSalary?: string,
  salaryMin?: number | null,
  salaryMax?: number | null,
  truncateDecimals: boolean = false
): { text: string; isReal: boolean } {
  return formatSalaryDisplay(salaryMin, salaryMax, rawSalary, { truncateDecimals });
}

/**
 * Calculates human-readable elapsed duration (e.g. "Today", "2d ago", "3w ago", "2mo ago").
 */
export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return 'Today';
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1d ago';
    if (diffDays < 7) return `${diffDays}d ago`;
    const weeks = Math.floor(diffDays / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(diffDays / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(diffDays / 365);
    return `${years}y ago`;
  } catch {
    return dateString;
  }
}

/**
 * Calculates how long a job has been in its current/most recent state.
 */
export function formatStateDuration(
  statusHistory?: StatusHistoryEntry[],
  createdAt?: string,
  currentStatus?: JobStatus
): string {
  let transitionTime: string | undefined;

  if (Array.isArray(statusHistory) && statusHistory.length > 0) {
    const latest = statusHistory[statusHistory.length - 1];
    if (latest && latest.at) {
      transitionTime = latest.at;
    }
  }

  if (!transitionTime) {
    transitionTime = createdAt;
  }

  if (!transitionTime) return 'Today';

  try {
    const d = new Date(transitionTime);
    if (Number.isNaN(d.getTime())) return 'Today';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 0) return 'Today';
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1d in state';
    if (diffDays < 7) return `${diffDays}d in state`;
    const weeks = Math.floor(diffDays / 7);
    if (weeks < 5) return `${weeks}w in state`;
    const months = Math.floor(diffDays / 30);
    return `${months}mo in state`;
  } catch {
    return 'Today';
  }
}

/**
 * Returns compact view timeline metrics: how old the entry is & duration in current state.
 */
export function getCompactTimeline(job: JobRecord): {
  ageText: string;
  stateDurationText: string;
} {
  const addedDate = job.dateApplied || job.dateAdded || job.createdAt;
  const ageText = formatRelativeTime(addedDate);
  const stateDurationText = formatStateDuration(job.statusHistory, job.createdAt, job.status);

  return { ageText, stateDurationText };
}

/**
 * Returns the 4px semantic left border accent color for a card based on pipeline status.
 */
export function getStatusBorderAccent(status: JobStatus): string {
  return STATUS_META[status]?.borderAccent ?? 'border-l-slate-300';
}

/**
 * Returns a solid colored dot background class for status.
 */
export function getStatusDotColor(status: JobStatus): string {
  return STATUS_META[status]?.dot ?? 'bg-slate-300';
}

/**
 * Returns elapsed milliseconds since the job transitioned into its current status.
 * Used for ranking least to highest amount since last status (smallest duration first).
 */
export function getStatusDurationMs(job: JobRecord): number {
  let transitionTime: string | undefined;

  if (Array.isArray(job.statusHistory) && job.statusHistory.length > 0) {
    const latest = job.statusHistory[job.statusHistory.length - 1];
    if (latest && latest.at) {
      transitionTime = latest.at;
    }
  }

  if (!transitionTime) {
    transitionTime = job.dateApplied || job.createdAt || job.dateAdded;
  }

  if (!transitionTime) return 0;

  try {
    const d = new Date(transitionTime);
    const time = d.getTime();
    if (Number.isNaN(time)) return 0;
    return Math.max(0, Date.now() - time);
  } catch {
    return 0;
  }
}

/**
 * Returns the epoch timestamp (ms) of the job's creation or application date.
 * Used for ranking youngest to oldest (youngest = highest timestamp first).
 */
export function getJobAgeTimestampMs(job: JobRecord): number {
  const raw = job.dateApplied || job.dateAdded || job.createdAt;
  if (!raw) return 0;
  try {
    const d = new Date(raw);
    const time = d.getTime();
    return Number.isNaN(time) ? 0 : time;
  } catch {
    return 0;
  }
}


/**
 * True when no model actually read the posting and the job was filled by a deterministic fallback
 * (scraper blocked, Gemini unavailable). Those snapshots carry "Unknown" fields and are worth a manual look.
 */
export function needsManualReview(extractedVia?: string | null): boolean {
  return !!extractedVia && /deterministic|resilient dom parser/i.test(extractedVia);
}

const LEGACY_PLACEHOLDER = { headcount: '1,000+ employees', headquarters: 'United States', ownership: 'Private' };

/**
 * Company facts as they should be shown. Before v0.3.0 every fallback path (ATS API without Gemini, deterministic
 * parsers) stored the same hard-coded trio below, so jobs saved then all look identical. That exact trio is a
 * placeholder, not data, and is shown as Unknown; the stored snapshot itself is left untouched.
 */
export function companyFactsForDisplay(meta?: {
  headcount?: string;
  headquarters?: string;
  ownership?: string;
  foundingYear?: string | number;
}): { headcount: string; headquarters: string; ownership: string; foundingYear: string } {
  const isPlaceholder =
    meta?.headcount === LEGACY_PLACEHOLDER.headcount &&
    meta?.headquarters === LEGACY_PLACEHOLDER.headquarters &&
    meta?.ownership === LEGACY_PLACEHOLDER.ownership;
  if (!meta || isPlaceholder) {
    return { headcount: 'Unknown', headquarters: 'Unknown', ownership: 'Unknown', foundingYear: meta?.foundingYear ? String(meta.foundingYear) : 'Unknown' };
  }
  return {
    headcount: meta.headcount || 'Unknown',
    headquarters: meta.headquarters || 'Unknown',
    ownership: meta.ownership || 'Unknown',
    foundingYear: meta.foundingYear ? String(meta.foundingYear) : 'Unknown',
  };
}
