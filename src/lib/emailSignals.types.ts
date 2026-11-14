import type { JobStatus } from '../types';

/**
 * One job-related email as summarized by the Gmail Apps Script bridge (apps-script/GmailBridge.gs).
 * The script returns `{ ok: true, items: EmailItem[] }` from its web app URL.
 */
export interface EmailItem {
  /** Gmail message id. */
  id: string;
  /** Gmail thread id. */
  threadId: string;
  /** ISO 8601 timestamp of the message. */
  date: string;
  /** Raw From header, e.g. `"Acme Recruiting" <no-reply@us.greenhouse-mail.io>`. */
  from: string;
  subject: string;
  /** Plain text start of the body, at most 1,500 characters. */
  snippet: string;
  /** Up to 20 link URLs found in the body. */
  links: string[];
}

export interface EmailClassification {
  /** Status the email signals, or null when it signals nothing (alerts, newsletters, unclear). */
  status: JobStatus | null;
  confidence: 'high' | 'low';
  /** Short human-readable reason, e.g. `matched "not moving forward"`. */
  reason: string;
}

export interface EmailSuggestion {
  messageId: string;
  threadId: string;
  jobId: string;
  company: string;
  jobTitle: string;
  fromStatus: JobStatus;
  toStatus: JobStatus;
  /** High only when both the classification and the job match are high confidence. */
  confidence: 'high' | 'low';
  reason: string;
  subject: string;
  sender: string;
  date: string;
}

export interface UnmatchedRejection {
  messageId: string;
  subject: string;
  sender: string;
  date: string;
  reason: string;
}
