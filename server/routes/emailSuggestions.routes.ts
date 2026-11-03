import { Hono } from 'hono';
import type { AppEnv } from '../app.types.ts';
import { jobRepository } from '../services/storage/index.ts';
import { scopeOf } from '../middleware/requireUser.ts';
import { buildSuggestions } from '../../src/lib/emailSignals.ts';
import type { EmailItem } from '../../src/lib/emailSignals.types.ts';

export const emailSuggestionsRouter = new Hono<AppEnv>();

const BRIDGE_TIMEOUT_MS = 20_000;

interface BridgeConfig {
  url: string;
  key: string;
  ownerEmail: string;
}

function bridgeConfig(): BridgeConfig | null {
  const url = process.env.GMAIL_BRIDGE_URL?.trim();
  const key = process.env.GMAIL_BRIDGE_KEY?.trim();
  const ownerEmail = process.env.GMAIL_BRIDGE_OWNER_EMAIL?.trim().toLowerCase();
  if (!url || !key || !ownerEmail) return null;
  return { url, key, ownerEmail };
}

function asEmailItems(raw: unknown): EmailItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .filter((it) => typeof it.id === 'string' && typeof it.threadId === 'string')
    .map((it) => ({
      id: String(it.id),
      threadId: String(it.threadId),
      date: typeof it.date === 'string' ? it.date : '',
      from: typeof it.from === 'string' ? it.from : '',
      subject: typeof it.subject === 'string' ? it.subject : '',
      snippet: typeof it.snippet === 'string' ? it.snippet.slice(0, 1500) : '',
      links: Array.isArray(it.links) ? it.links.filter((l): l is string => typeof l === 'string').slice(0, 20) : [],
    }));
}

/**
 * GET /api/email-suggestions?days=14: asks the owner's Gmail Apps Script bridge for recent job emails and returns
 * suggested status changes for the owner's jobs. Nothing is changed here; the browser applies a suggestion through
 * PATCH /api/jobs/:id after the user confirms it. Only the account named in GMAIL_BRIDGE_OWNER_EMAIL may use it,
 * so other accounts never see the owner's mail.
 */
emailSuggestionsRouter.get('/', async (c) => {
  const config = bridgeConfig();
  if (!config) return c.json({ success: true, enabled: false, suggestions: [] });

  const user = c.get('user');
  const isLocalDev = !process.env.SUPABASE_URL && process.env.NODE_ENV !== 'production';
  if (!isLocalDev && (user?.email || '').toLowerCase() !== config.ownerEmail) {
    return c.json({ success: true, enabled: false, suggestions: [] });
  }

  const days = Math.min(60, Math.max(1, Number.parseInt(c.req.query('days') || '14', 10) || 14));
  const bridgeUrl = new URL(config.url);
  bridgeUrl.searchParams.set('key', config.key);
  bridgeUrl.searchParams.set('days', String(days));

  try {
    const res = await fetch(bridgeUrl, { redirect: 'follow', signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS) });
    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok !== true) {
      const reason = body?.error === 'unauthorized' ? 'The Gmail bridge rejected the key' : 'The Gmail bridge did not answer';
      return c.json({ success: false, enabled: true, error: reason }, 502);
    }
    const items = asEmailItems(body.items);
    const jobs = await jobRepository.listJobs(scopeOf(c));
    const suggestions = buildSuggestions(items, jobs);
    return c.json({ success: true, enabled: true, scanned: items.length, suggestions });
  } catch (err: any) {
    const reason = err?.name === 'TimeoutError' ? 'The Gmail bridge timed out' : 'Could not reach the Gmail bridge';
    return c.json({ success: false, enabled: true, error: reason }, 502);
  }
});
