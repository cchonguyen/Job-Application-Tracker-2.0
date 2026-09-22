import type { JobStatus, StatusHistoryEntry } from '../types';

const VALID_STATUSES = new Set<JobStatus>([
  'Saved',
  'Applied',
  'Interviewing',
  'Offer',
  'Accepted',
  'Rejected',
  'Declined',
]);

function asStatus(value: unknown): JobStatus | null {
  if (value === null) return null;
  if (typeof value === 'string' && VALID_STATUSES.has(value as JobStatus)) {
    return value as JobStatus;
  }
  return null;
}

/** Normalize unknown / missing history from old records. */
export function normalizeStatusHistory(raw: unknown): StatusHistoryEntry[] {
  if (!Array.isArray(raw)) return [];

  const out: StatusHistoryEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const at = typeof record.at === 'string' && record.at.trim() ? record.at : null;
    const to = asStatus(record.to);
    if (!at || !to) continue;
    const from =
      record.from === null || record.from === undefined
        ? null
        : asStatus(record.from);
    // Skip malformed from values that aren't null/valid status
    if (record.from !== null && record.from !== undefined && from === null) continue;
    out.push({ at, from, to });
  }
  return out;
}

/** Append a status transition when from !== to. */
export function appendStatusHistory(
  history: StatusHistoryEntry[] | undefined | null,
  from: JobStatus | null,
  to: JobStatus,
  now = new Date()
): StatusHistoryEntry[] {
  const base = normalizeStatusHistory(history);
  if (from === to) return base;
  return [...base, { at: now.toISOString(), from, to }];
}

/** Seed history for a newly created job. */
export function initialStatusHistory(status: JobStatus, now = new Date()): StatusHistoryEntry[] {
  return [{ at: now.toISOString(), from: null, to: status }];
}
