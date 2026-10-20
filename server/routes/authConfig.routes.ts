import { Hono } from 'hono';
import { isUsingSupabase, normalizeSupabaseUrl } from '../services/storage/index.ts';

export const authConfigRouter = new Hono();

/**
 * GET /api/auth/config: what the browser needs to start Google sign-in. The anon key is public by design; row-level
 * security on the jobs table is what keeps each user's data private. Sign-in is off when Supabase isn't configured
 * (local development), and the app then runs as a single local user.
 */
authConfigRouter.get('/config', (c) => {
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!isUsingSupabase() || !anonKey) {
    return c.json({ success: true, enabled: false });
  }
  try {
    return c.json({
      success: true,
      enabled: true,
      supabaseUrl: normalizeSupabaseUrl(process.env.SUPABASE_URL || ''),
      supabaseAnonKey: anonKey,
      // With a client ID the browser signs in through Google's own popup on this site, so Google's account chooser
      // names this app's address rather than the Supabase project's. Without one it falls back to Supabase's redirect.
      googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || undefined,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});
