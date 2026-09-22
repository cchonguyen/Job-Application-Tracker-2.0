import type { JobStatus } from '../types';

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().split('T')[0];
}

/** Date set when creating a new job record for a given initial status. */
export function initialDateAppliedForStatus(status: JobStatus, now = new Date()): string | null {
  return status === 'Applied' ? todayIsoDate(now) : null;
}

/**
 * Resolve dateApplied on PATCH / edit.
 * - Auto-fill today's date only when status changes Saved → Applied and date is empty.
 * - Never auto-set for any other status transition (e.g. Interviewing → Applied).
 * - Never clear the date when leaving Applied (Interviewing / Offer / etc.).
 * - Honor an explicit dateApplied from the client when provided.
 */
export function resolveDateApplied(options: {
  previousDate: string | null | undefined;
  previousStatus?: JobStatus | null;
  nextStatus: JobStatus;
  explicitDate?: string | null;
  now?: Date;
}): string | null {
  const { previousDate, nextStatus, previousStatus, now = new Date() } = options;
  let date: string | null | undefined =
    options.explicitDate !== undefined ? options.explicitDate : previousDate;

  if (typeof date === 'string') {
    date = date.trim() || null;
  } else {
    date = date ?? null;
  }

  const isSavedToApplied = previousStatus === 'Saved' && nextStatus === 'Applied';
  if (isSavedToApplied && !date) {
    date = todayIsoDate(now);
  }

  return date;
}
