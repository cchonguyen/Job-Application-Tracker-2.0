import { getAuthConfig } from './auth';

declare global {
  interface Window {
    google?: any;
  }
}

export interface GoogleAuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

// Workspace Scopes for Drive & Google Sheets
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

async function resolveOAuthClientId(): Promise<string> {
  const config = await getAuthConfig().catch(() => null);
  return config?.googleClientId?.trim() || '';
}

// In-memory access token cache ONLY (Never in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let cachedUser: GoogleAuthUser | null = null;

export const loadGsi = (): Promise<boolean> => {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.accounts?.oauth2) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.getElementById('google-gsi-client');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
};

export const signInWithGsi = async (clientIdOverride?: string): Promise<{ user: GoogleAuthUser; accessToken: string }> => {
  await loadGsi();
  const clientId = clientIdOverride || (await resolveOAuthClientId());
  if (!window.google?.accounts?.oauth2 || !clientId) {
    throw new Error('Google Identity Services client is not initialized or OAuth Client ID is missing.');
  }

  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: WORKSPACE_SCOPES.join(' '),
        callback: async (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          if (!response.access_token) {
            reject(new Error('No access token received from Google'));
            return;
          }

          const accessToken = response.access_token;
          let profile: GoogleAuthUser = {
            uid: 'google-user',
            displayName: 'Google Connected',
            email: null,
            photoURL: null,
          };

          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userRes.ok) {
              const data = await userRes.json();
              profile = {
                uid: data.sub || 'google-user',
                displayName: data.name || data.email || 'Google Connected',
                email: data.email || null,
                photoURL: data.picture || null,
              };
            }
          } catch {
            // Profile fetch is optional, accessToken is primary
          }

          cachedAccessToken = accessToken;
          cachedUser = profile;
          resolve({ user: profile, accessToken });
        },
        error_callback: (err: any) => {
          reject(err);
        },
      });

      client.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      reject(err);
    }
  });
};

export const initAuth = (
  onAuthSuccess?: (user: GoogleAuthUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (cachedUser && cachedAccessToken) {
    onAuthSuccess?.(cachedUser, cachedAccessToken);
  } else {
    onAuthFailure?.();
  }
  return () => {};
};

export const googleSignIn = async (): Promise<{ user: GoogleAuthUser; accessToken: string } | null> => {
  try {
    // Google Identity Services (GIS) Token Client is the only sign-in path.
    // It connects directly using the provisioned Google Cloud OAuth Client ID.
    const clientId = await resolveOAuthClientId();
    if (!clientId) {
      throw new Error('Google Sheets sync needs GOOGLE_OAUTH_CLIENT_ID to be set.');
    }
    try {
      const gisResult = await signInWithGsi(clientId);
      if (gisResult?.accessToken) {
        cachedAccessToken = gisResult.accessToken;
        cachedUser = gisResult.user;
        return gisResult;
      }
      return null;
    } catch (gisError: any) {
      console.warn('Google Identity Services attempt encountered:', gisError);
      // If user actively cancelled/closed the popup, surface a clear message
      if (
        gisError?.message?.includes('closed') ||
        gisError?.type === 'popup_closed' ||
        gisError?.message?.includes('user_cancel')
      ) {
        throw new Error('Sign-in popup was closed before authorization.');
      }
      throw gisError;
    }
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async (): Promise<void> => {
  cachedAccessToken = null;
  cachedUser = null;
};
