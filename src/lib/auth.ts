import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface AuthConfig {
  enabled: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  googleClientId?: string;
}

let configPromise: Promise<AuthConfig> | null = null;
let clientPromise: Promise<SupabaseClient | null> | null = null;

/** Sign-in settings from the server, fetched once per page load. */
export function getAuthConfig(): Promise<AuthConfig> {
  configPromise ??= loadAuthConfig().catch((err) => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

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
  clientPromise ??= getAuthConfig()
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

/** A one-time nonce: the raw value goes to Supabase, its SHA-256 hex digest to Google, so a token can't be replayed. */
export async function createSignInNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed };
}

/** Exchanges the ID token from Google's sign-in popup for a Supabase session. */
export async function signInWithGoogleIdToken(idToken: string, rawNonce: string): Promise<void> {
  const client = await getAuthClient();
  if (!client) return;
  const { error } = await client.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce });
  if (error) throw error;
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
