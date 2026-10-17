import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import {
  createUserSupabaseClient,
  isUsingSupabase,
  normalizeSupabaseUrl,
  type JobScope,
} from '../services/storage/index.ts';
import { LOCAL_DEV_USER_ID } from '../../src/lib/jobsStore.ts';

export interface RequestUser {
  id: string;
  email: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireUser: who is calling, and a store scope limited to their jobs. */
      user?: RequestUser;
      jobScope?: JobScope;
    }
  }
}

/** Verifies a Supabase access token and returns its user, or null when the token is invalid or expired. */
export type TokenVerifier = (accessToken: string) => Promise<RequestUser | null>;

/** Reads the caller's token from `Authorization: Bearer <token>`. */
export function readBearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header || !/^bearer\s+/i.test(header)) return null;
  return header.replace(/^bearer\s+/i, '').trim() || null;
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
export function createRequireUser(verify: TokenVerifier = verifySupabaseToken) {
  return async function requireUser(req: Request, res: Response, next: NextFunction) {
    if (!isUsingSupabase()) {
      if (process.env.NODE_ENV === 'production') {
        res.status(503).json({
          success: false,
          error: 'Server is missing SUPABASE_URL and SUPABASE_ANON_KEY. Sign-in needs Supabase in production.',
        });
        return;
      }
      req.user = { id: LOCAL_DEV_USER_ID, email: null };
      req.jobScope = { userId: LOCAL_DEV_USER_ID, db: null };
      next();
      return;
    }

    if (!process.env.SUPABASE_ANON_KEY?.trim()) {
      res.status(503).json({ success: false, error: 'Server is missing SUPABASE_ANON_KEY.' });
      return;
    }

    const token = readBearerToken(req);
    let user: RequestUser | null = null;
    if (token) {
      try {
        user = await verify(token);
      } catch (err: any) {
        console.warn('Sign-in token check failed:', err?.message);
      }
    }

    if (!token || !user) {
      res.status(401).json({ success: false, authRequired: true, error: 'Please sign in.' });
      return;
    }

    req.user = user;
    req.jobScope = { userId: user.id, db: createUserSupabaseClient(token) };
    next();
  };
}

export const requireUser = createRequireUser();

/** The signed-in caller's store scope. Routes mounted behind requireUser always have one. */
export function scopeOf(req: Request): JobScope {
  if (!req.jobScope) {
    throw new Error('Route is missing requireUser.');
  }
  return req.jobScope;
}
