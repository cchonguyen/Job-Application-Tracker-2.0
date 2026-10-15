import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

function digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

/** Reads the caller's key from `Authorization: Bearer <key>` or `X-Api-Key`. */
export function readPresentedKey(req: Request): string | null {
  const header = req.get('authorization');
  if (header && /^bearer\s+/i.test(header)) {
    return header.replace(/^bearer\s+/i, '').trim() || null;
  }
  return req.get('x-api-key')?.trim() || null;
}

/**
 * Every /api call reads or writes the whole job table with the Supabase service-role key, so the API must not be
 * reachable by anyone who finds the deploy URL. Callers present API_ACCESS_KEY; the browser stores it once.
 * Without a key configured the API stays open for local development but refuses to serve in production.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.API_ACCESS_KEY?.trim();

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({
        success: false,
        error: 'Server is missing API_ACCESS_KEY. Set it in the hosting environment to enable the API.',
      });
      return;
    }
    next();
    return;
  }

  const presented = readPresentedKey(req);
  if (presented && crypto.timingSafeEqual(digest(presented), digest(expected))) {
    next();
    return;
  }

  res.status(401).json({ success: false, authRequired: true, error: 'Access key required.' });
}
