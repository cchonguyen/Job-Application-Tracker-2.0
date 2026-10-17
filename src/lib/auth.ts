import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface AuthConfig {
  enabled: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

let clientPromise: Promise<SupabaseClient | null> | null = null;

async function loadAuthConfig(): Promise<AuthConfig> {
  const res = await fetch('/api/auth/config');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Could not load sign-in settings (HTTP ${res.status}).`);
  }
  return data as AuthConfig;
}

/**
 * The browser's Supabase client, or null when the server runs without sign-in (local development). The session it
 * keeps (with a refresh token) persists in this browser, so the bookmarklet's capture popup is signed in too.
 */
export function getAuthClient(): Promise<SupabaseClient | null> {
  clientPromise ??= loadAuthConfig()
    .then((config) => {
      if (!config.enabled || !config.supabaseUrl || !config.supabaseAnonKey) return null;
      return createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    })
    .catch((err) => {
      clientPromise = null;
      throw err;
    });
  return clientPromise;
}

/** Access token for /api calls, or null when signed out or sign-in is off. */
export async function currentAccessToken(): Promise<string | null> {
  const client = await getAuthClient().catch(() => null);
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Sends the browser to Google, which returns it to the tracker's home page signed in. */
export async function signInWithGoogle(): Promise<void> {
  const client = await getAuthClient();
  if (!client) return;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const client = await getAuthClient();
  if (!client) return;
  await client.auth.signOut();
}
