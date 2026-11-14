import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Context, MiddlewareHandler } from 'hono';
import {
  createUserSupabaseClient,
  isUsingSupabase,
  normalizeSupabaseUrl,
  type JobScope,
} from '../services/storage/index.ts';
import { LOCAL_DEV_USER_ID } from '../../src/lib/jobsStore.ts';
import type { AppEnv, RequestUser } from '../app.types.ts';

export type { RequestUser };

/** Verifies a Supabase access token and returns its user, or null when the token is invalid or expired. */
export type TokenVerifier = (accessToken: string) => Promise<RequestUser | null>;

/** Reads the caller's token from `Authorization: Bearer <token>`. */
export function readBearerToken(header: string | undefined | null): string | null {
  if (!header || !/^bearer\s+/i.test(header)) return null;
  return header.replace(/^bearer\s+/i, '').trim() || null;
}

/**
 * Lowercased set of emails allowed to use the API when ALLOWED_USER_EMAILS is set (comma-separated).
 * Null when unset or blank, leaving sign-in open to any Google account.
 */
export function allowedUserEmails(): Set<string> | null {
  const raw = process.env.ALLOWED_USER_EMAILS?.trim();
  if (!raw) return null;
  const emails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return emails.length > 0 ? new Set(emails) : null;
}

let verifierClient: SupabaseClient | undefined;

/** Checks the token's signature and expiry against Supabase Auth (locally via its published keys when available). */
export const verifySupabaseToken: TokenVerifier = async (accessToken) => {
  verifierClient ??= createClient(
    normalizeSupabaseUrl(process.env.SUPABASE_URL || ''),
    process.env.SUPABASE_ANON_KEY?.trim() || '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await verifierClient.auth.getClaims(accessToken);
  const claims = data?.claims;
  if (error || !claims?.sub || claims.role !== 'authenticated' || claims.is_anonymous) {
    return null;
  }
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
};

/**
 * Every /api call must come from a signed-in user, and the store scope it gets can only reach that user's jobs.
 * Without Supabase (local development) everyone is the single local user; production refuses to run that way.
 */
export function createRequireUser(verify: TokenVerifier = verifySupabaseToken): MiddlewareHandler<AppEnv> {
  return async function requireUser(c, next) {
    if (!isUsingSupabase()) {
      if (process.env.NODE_ENV === 'production') {
        return c.json(
          {
            success: false,
            error: 'Server is missing SUPABASE_URL and SUPABASE_ANON_KEY. Sign-in needs Supabase in production.',
          },
          503
        );
      }
      c.set('user', { id: LOCAL_DEV_USER_ID, email: null });
      c.set('jobScope', { userId: LOCAL_DEV_USER_ID, db: null });
      await next();
      return;
    }

    if (!process.env.SUPABASE_ANON_KEY?.trim()) {
      return c.json({ success: false, error: 'Server is missing SUPABASE_ANON_KEY.' }, 503);
    }

    const token = readBearerToken(c.req.header('authorization'));
    let user: RequestUser | null = null;
    if (token) {
      try {
        user = await verify(token);
      } catch (err: any) {
        console.warn('Sign-in token check failed:', err?.message);
      }
    }

    if (!token || !user) {
      return c.json({ success: false, authRequired: true, error: 'Please sign in.' }, 401);
    }

    const allowlist = allowedUserEmails();
    if (allowlist && (!user.email || !allowlist.has(user.email.toLowerCase()))) {
      return c.json(
        {
          success: false,
          error: 'This Google account is not authorized to access this tracker.',
        },
        403
      );
    }

    c.set('user', user);
    c.set('jobScope', { userId: user.id, db: createUserSupabaseClient(token) });
    await next();
  };
}

export const requireUser = createRequireUser();

/** The signed-in caller's store scope. Routes mounted behind requireUser always have one. */
export function scopeOf(c: Context<AppEnv>): JobScope {
  const scope = c.get('jobScope');
  if (!scope) {
    throw new Error('Route is missing requireUser.');
  }
  return scope;
}
