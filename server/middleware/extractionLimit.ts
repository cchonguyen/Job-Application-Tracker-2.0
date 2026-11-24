import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app.types.ts';
import type { JobScope } from '../services/storage/index.ts';

const DEFAULT_DAILY_LIMIT = 30;

/** Gemini extractions each user may run per UTC day (company-fact lookups get the same number). EXTRACTION_DAILY_LIMIT overrides; 0 or less turns the limit off. */
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
 * In-memory count for one key (a user id, optionally prefixed by what it was spent on); false once that key has used
 * up today's allowance. Used in local development and as the fallback when the Supabase counter is unavailable.
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

export type UsageKind = 'extraction' | 'company-facts';

let warnedFallback = false;

/**
 * Counts one use of `kind` for the signed-in user; false once today's allowance is spent. With Supabase the count
 * lives in the database (`take_daily_usage`), so it holds across restarts and across the many short-lived copies of
 * the server that Cloudflare runs. If that call fails (for example the migration has not been applied yet) the count
 * falls back to this process's memory rather than blocking the user. The extraction pipeline calls it for 'extraction'
 * only right before a Gemini step, so ATS-API, fast-path and bot-wall results cost nothing.
 */
export async function takeDailyUsage(scope: JobScope, kind: UsageKind): Promise<boolean> {
  const limit = dailyExtractionLimit();
  if (limit <= 0) return true;
  const memoryKey = kind === 'extraction' ? scope.userId : `${kind}:${scope.userId}`;
  if (!scope.db) return takeExtraction(memoryKey);

  const { data, error } = await scope.db.rpc('take_daily_usage', { p_kind: kind, p_limit: limit });
  if (error || typeof data !== 'boolean') {
    if (!warnedFallback) {
      warnedFallback = true;
      console.warn('Daily limit counter in Supabase unavailable, counting in memory instead:', error?.message ?? data);
    }
    return takeExtraction(memoryKey);
  }
  return data;
}

/**
 * Company-fact lookups can run a Google-Search-grounded Gemini call, so they get their own daily allowance per user.
 * It is separate from extractions so that browsing old jobs never blocks adding new ones.
 */
export const companyLookupLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const scope = c.get('jobScope');
  if (scope && !(await takeDailyUsage(scope, 'company-facts'))) {
    return c.json({ success: false, error: 'Daily company lookup limit reached. Try again tomorrow.' }, 429);
  }
  await next();
};
