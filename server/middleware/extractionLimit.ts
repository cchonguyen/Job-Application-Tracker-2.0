import type { NextFunction, Request, Response } from 'express';

const DEFAULT_DAILY_LIMIT = 30;

/** Extractions each user may run per UTC day. EXTRACTION_DAILY_LIMIT overrides; 0 or less turns the limit off. */
export function dailyExtractionLimit(): number {
  const raw = process.env.EXTRACTION_DAILY_LIMIT?.trim();
  if (!raw) return DEFAULT_DAILY_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? DEFAULT_DAILY_LIMIT : parsed;
}

const usage = new Map<string, { day: string; count: number }>();

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Counts one use for the key (a user id, optionally prefixed by what it was spent on); false once that key has used
 * up today's allowance.
 */
export function takeExtraction(userId: string, now = new Date()): boolean {
  const limit = dailyExtractionLimit();
  if (limit <= 0) return true;

  const day = utcDay(now);
  const entry = usage.get(userId);
  const count = entry && entry.day === day ? entry.count : 0;
  if (count >= limit) return false;

  usage.set(userId, { day, count: count + 1 });
  if (usage.size > 10_000) {
    for (const [id, value] of usage) {
      if (value.day !== day) usage.delete(id);
    }
  }
  return true;
}

export function resetExtractionUsage(): void {
  usage.clear();
}

/**
 * Every extraction can spend Gemini quota and make the server fetch a URL, so each signed-in user gets a daily
 * allowance. Counts live in memory: a restart resets them, which is acceptable on a single small instance.
 */
export function extractionLimit(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  // Saving a job the user already extracted (after a duplicate warning) runs no extraction.
  const savesConfirmedCandidate = Boolean(req.body?.candidateJob && req.body?.confirmDuplicate);
  if (!userId || savesConfirmedCandidate) {
    next();
    return;
  }
  if (!takeExtraction(userId)) {
    res.status(429).json({
      success: false,
      error: `Daily limit reached: you can add ${dailyExtractionLimit()} jobs by link or pasted text per day. Try again tomorrow.`,
    });
    return;
  }
  next();
}

/**
 * Company-fact lookups can run a Google-Search-grounded Gemini call, so they get their own daily allowance per user.
 * It is separate from extractions so that browsing old jobs never blocks adding new ones.
 */
export function companyLookupLimit(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (userId && !takeExtraction(`company-facts:${userId}`)) {
    res.status(429).json({ success: false, error: 'Daily company lookup limit reached. Try again tomorrow.' });
    return;
  }
  next();
}
