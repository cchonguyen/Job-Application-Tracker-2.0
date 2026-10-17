import { Router } from 'express';
import { isUsingSupabase, normalizeSupabaseUrl } from '../services/storage/index.ts';

export const authConfigRouter = Router();

/**
 * GET /api/auth/config: what the browser needs to start Google sign-in. The anon key is public by design; row-level
 * security on the jobs table is what keeps each user's data private. Sign-in is off when Supabase isn't configured
 * (local development), and the app then runs as a single local user.
 */
authConfigRouter.get('/config', (_req, res) => {
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!isUsingSupabase() || !anonKey) {
    res.json({ success: true, enabled: false });
    return;
  }
  try {
    res.json({
      success: true,
      enabled: true,
      supabaseUrl: normalizeSupabaseUrl(process.env.SUPABASE_URL || ''),
      supabaseAnonKey: anonKey,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
