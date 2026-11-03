// Pure helpers that turn job-related Gmail items into status suggestions for tracked jobs.
// No I/O: the caller supplies the email summaries and the job list.

import type { JobRecord, JobStatus } from '../types';
import { detectAts } from './atsDetect';
import type { EmailClassification, EmailItem, EmailSuggestion } from './emailSignals.types';

const MATCHABLE_STATUSES: readonly JobStatus[] = ['Saved', 'Applied', 'Interviewing', 'Offer'];

const STATUS_RANK: Partial<Record<JobStatus, number>> = {
  Saved: 0,
  Applied: 1,
  Interviewing: 2,
  Offer: 3,
};

const ATS_TYPES = new Set(['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters']);

const COMPANY_SUFFIXES = new Set([
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

const TITLE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'of', 'a', 'an', 'to', 'in', 'at', 'on', 'job', 'role', 'remote', 'hybrid', 'part', 'time', 'full',
]);

const ALERT_PHRASES = ['job alert', 'jobs you may like', 'recommended jobs', 'new jobs for you'];
const REJECT_PHRASES = [
  'unfortunately',
  'not to move forward',
  'not moving forward',
  'will not be moving forward',
  'decided to pursue other candidates',
  'move forward with other candidates',
  'position has been filled',
  'no longer considering',
  'not selected',
];
const OFFER_PHRASES = ['offer letter', 'pleased to offer', 'extend an offer', 'extend you an offer'];
const INTERVIEW_PHRASES = [
  'schedule an interview',
  'interview invitation',
  'invite you to interview',
  'phone screen',
  'your availability',
  'next steps in the interview',
];
const INTERVIEW_LINK_PATTERNS = ['calendly.com', 'goodtime.io', 'gem.com/schedul', 'modernloop'];
const APPLIED_PHRASES = [
  'thank you for applying',
  'application received',
  'received your application',
  'thanks for applying',
  'application has been submitted',
];

function findPhrase(haystack: string, phrases: readonly string[]): string | undefined {
  return phrases.find((phrase) => haystack.includes(phrase));
}

function findInterviewLink(item: EmailItem): string | undefined {
  const haystack = [...item.links, item.snippet, item.subject].join(' ').toLowerCase();
  const pattern = findPhrase(haystack, INTERVIEW_LINK_PATTERNS);
  if (pattern) return pattern;
  if (/\.ics\b/.test(haystack)) return '.ics';
  return undefined;
}

export function classifyEmail(item: EmailItem): EmailClassification {
  const text = `${item.subject} ${item.snippet}`.toLowerCase();

  const alert = findPhrase(text, ALERT_PHRASES);
  if (alert) return { status: null, confidence: 'high', reason: `matched "${alert}" (job alert)` };

  const rejected = findPhrase(text, REJECT_PHRASES);
  if (rejected) return { status: 'Rejected', confidence: 'high', reason: `matched "${rejected}"` };

  const offer = findPhrase(text, OFFER_PHRASES);
  if (offer) return { status: 'Offer', confidence: 'high', reason: `matched "${offer}"` };

  const interviewPhrase = findPhrase(text, INTERVIEW_PHRASES);
  if (interviewPhrase) {
    return { status: 'Interviewing', confidence: 'high', reason: `matched "${interviewPhrase}"` };
  }
  const interviewLink = findInterviewLink(item);
  if (interviewLink) {
    return { status: 'Interviewing', confidence: 'high', reason: `matched link "${interviewLink}"` };
  }

  const applied = findPhrase(text, APPLIED_PHRASES);
  if (applied) return { status: 'Applied', confidence: 'high', reason: `matched "${applied}"` };

  if (/\binterview\b/.test(text)) {
    return { status: 'Interviewing', confidence: 'low', reason: 'matched "interview"' };
  }

  return { status: null, confidence: 'low', reason: 'no signal' };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeCompany(value: string): string {
  const tokens = normalizeText(value).split(' ').filter(Boolean);
  while (tokens.length > 0 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(' ');
}

/** True when the normalized company name appears in the normalized text (whole words for short names). */
function containsCompany(normalizedText: string, companyNorm: string): boolean {
  if (companyNorm.length < 3) return false;
  if (companyNorm.length < 5) return ` ${normalizedText} `.includes(` ${companyNorm} `);
  return normalizedText.includes(companyNorm);
}

function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  const trimmed = from.trim();
  return { name: '', email: trimmed.includes('@') ? trimmed : '' };
}

const SECOND_LEVEL_SUFFIXES = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);

/** The brand label of a sender domain: acme from careers.acme.com, acme from careers.acme.co.uk. */
function senderDomainLabel(email: string): string | undefined {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return undefined;
  const parts = domain.split('.');
  if (parts.length < 2) return undefined;
  if (parts.length >= 3 && parts[parts.length - 1].length === 2 && SECOND_LEVEL_SUFFIXES.has(parts[parts.length - 2])) {
    return parts[parts.length - 3];
  }
  return parts[parts.length - 2];
}

function domainMatchesCompany(email: string, companyNorm: string): boolean {
  const label = senderDomainLabel(email);
  if (!label) return false;
  const labelNorm = normalizeCompany(label.replace(/-/g, ' '));
  if (labelNorm.length < 3) return false;
  return labelNorm === companyNorm || labelNorm.replace(/ /g, '') === companyNorm.replace(/ /g, '');
}

/** ATS board slug from a tracked job URL, e.g. "acme" from boards.greenhouse.io/acme/jobs/1. */
function atsSlugForJob(url: string): string | undefined {
  if (!url) return undefined;
  let detection;
  try {
    detection = detectAts(url);
  } catch {
    return undefined;
  }
  if (!detection.type || !ATS_TYPES.has(detection.type) || !detection.board) return undefined;
  const slug = detection.board.toLowerCase();
  return slug.length >= 3 ? slug : undefined;
}

function emailMentionsSlug(item: EmailItem, slug: string): boolean {
  for (const link of item.links) {
    try {
      const url = new URL(link);
      const segments = [...url.hostname.toLowerCase().split('.'), ...url.pathname.toLowerCase().split('/')];
      if (segments.includes(slug)) return true;
    } catch {
      // Not a parseable URL; ignore it.
    }
  }
  return item.from.toLowerCase().split(/[^a-z0-9-]+/).includes(slug);
}

function significantTitleWords(title: string): string[] {
  return normalizeText(title)
    .split(' ')
    .filter((word) => word.length >= 3 && !TITLE_STOPWORDS.has(word));
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

interface JobScore {
  job: JobRecord;
  score: number;
  reasons: string[];
}

function scoreJob(item: EmailItem, job: JobRecord): JobScore {
  const reasons: string[] = [];
  let score = 0;

  const slug = atsSlugForJob(job.url);
  if (slug && emailMentionsSlug(item, slug)) {
    score += 60;
    reasons.push(`ATS board "${slug}"`);
  }

  const companyNorm = normalizeCompany(job.company);
  const sender = parseSender(item.from);
  const senderMatch =
    (sender.name !== '' && containsCompany(normalizeText(sender.name), companyNorm)) ||
    domainMatchesCompany(sender.email, companyNorm);
  if (senderMatch) {
    score += 50;
    reasons.push('company in sender');
  } else if (containsCompany(normalizeText(item.subject), companyNorm)) {
    score += 40;
    reasons.push(`company in subject`);
  }

  const bodyWords = new Set(normalizeText(`${item.subject} ${item.snippet}`).split(' '));
  const overlap = significantTitleWords(job.jobTitle).filter((word) => bodyWords.has(word)).length;
  if (overlap >= 2) {
    score += 15;
    reasons.push('title words');
  }

  return { job, score, reasons };
}

export function matchEmailToJobs(
  item: EmailItem,
  jobs: JobRecord[],
  knownThreadJobIds?: Record<string, string>
): { jobId: string; confidence: 'high' | 'low'; reason: string } | null {
  const eligible = jobs.filter((job) => MATCHABLE_STATUSES.includes(job.status));
  if (eligible.length === 0) return null;

  const threadJobId = knownThreadJobIds?.[item.threadId];
  if (threadJobId && eligible.some((job) => job.id === threadJobId)) {
    return { jobId: threadJobId, confidence: 'high', reason: 'same Gmail thread as a tracked job' };
  }

  const scored = eligible
    .map((job) => scoreJob(item, job))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;

  const best = scored[0];
  const runnerUp = scored[1]?.score ?? 0;
  const reason = best.reasons.join(', ');

  if (best.score >= 50 && best.score - runnerUp >= 20) {
    return { jobId: best.job.id, confidence: 'high', reason };
  }
  if (best.score >= 40) {
    return { jobId: best.job.id, confidence: 'low', reason };
  }
  return null;
}

function isForwardMove(current: JobStatus, to: JobStatus): boolean {
  if (to === 'Rejected') return MATCHABLE_STATUSES.includes(current);
  const toRank = STATUS_RANK[to];
  const currentRank = STATUS_RANK[current];
  if (toRank === undefined || currentRank === undefined) return false;
  return toRank > currentRank;
}

interface Candidate {
  item: EmailItem;
  classification: EmailClassification;
  jobId: string;
  match: { confidence: 'high' | 'low'; reason: string };
  toStatus: JobStatus;
}

/** Candidates arrive oldest first. A newest Rejected wins; otherwise the most advanced status wins. */
function pickCandidate(list: Candidate[]): Candidate {
  const newest = list[list.length - 1];
  if (newest.toStatus === 'Rejected') return newest;
  let best: Candidate | undefined;
  for (const candidate of list) {
    if (candidate.toStatus === 'Rejected') continue;
    if (!best || (STATUS_RANK[candidate.toStatus] ?? 0) >= (STATUS_RANK[best.toStatus] ?? 0)) {
      best = candidate;
    }
  }
  return best ?? newest;
}

function parseSenderLabel(from: string): string {
  const sender = parseSender(from);
  return sender.name || sender.email || from.trim();
}

export function buildSuggestions(
  items: EmailItem[],
  jobs: JobRecord[],
  opts: { dismissedIds?: string[]; knownThreadJobIds?: Record<string, string> } = {}
): EmailSuggestion[] {
  const dismissed = new Set(opts.dismissedIds ?? []);
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const byJob = new Map<string, Candidate[]>();

  const oldestFirst = [...items].sort((a, b) => timestamp(a.date) - timestamp(b.date));
  for (const item of oldestFirst) {
    if (dismissed.has(item.id)) continue;
    const classification = classifyEmail(item);
    if (!classification.status) continue;
    const match = matchEmailToJobs(item, jobs, opts.knownThreadJobIds);
    if (!match) continue;
    const job = jobById.get(match.jobId);
    if (!job || !isForwardMove(job.status, classification.status)) continue;

    const list = byJob.get(job.id) ?? [];
    list.push({
      item,
      classification,
      jobId: job.id,
      match,
      toStatus: classification.status,
    });
    byJob.set(job.id, list);
  }

  const suggestions: EmailSuggestion[] = [];
  for (const [jobId, list] of byJob) {
    const chosen = pickCandidate(list);
    const job = jobById.get(jobId)!;
    suggestions.push({
      messageId: chosen.item.id,
      threadId: chosen.item.threadId,
      jobId,
      company: job.company,
      jobTitle: job.jobTitle,
      fromStatus: job.status,
      toStatus: chosen.toStatus,
      confidence: chosen.classification.confidence === 'high' && chosen.match.confidence === 'high' ? 'high' : 'low',
      reason: `${chosen.classification.reason}; ${chosen.match.reason}`,
      subject: chosen.item.subject,
      sender: parseSenderLabel(chosen.item.from),
      date: chosen.item.date,
    });
  }

  return suggestions.sort((a, b) => timestamp(b.date) - timestamp(a.date));
}
