import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

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

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
provider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline',
});

let isSigningIn = false;
// In-memory access token cache ONLY (Never in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let cachedUser: GoogleAuthUser | User | null = null;

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

export const signInWithGsi = async (): Promise<{ user: GoogleAuthUser; accessToken: string }> => {
  await loadGsi();
  if (!window.google?.accounts?.oauth2 || !firebaseConfig.oAuthClientId) {
    throw new Error('Google Identity Services client is not initialized or OAuth Client ID is missing.');
  }

  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: firebaseConfig.oAuthClientId,
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
  onAuthSuccess?: (user: GoogleAuthUser | User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        cachedUser = user;
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else if (cachedUser && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(cachedUser, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      cachedUser = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: GoogleAuthUser | User; accessToken: string } | null> => {
  try {
    isSigningIn = true;

    // 1. First attempt: Google Identity Services (GIS) Token Client
    // This connects directly using the provisioned Google Cloud OAuth Client ID, bypassing Firebase Auth domain checks
    if (firebaseConfig.oAuthClientId) {
      try {
        const gisResult = await signInWithGsi();
        if (gisResult?.accessToken) {
          cachedAccessToken = gisResult.accessToken;
          cachedUser = gisResult.user;
          return gisResult;
        }
      } catch (gisError: any) {
        console.warn('Google Identity Services attempt encountered:', gisError);
        // If user actively cancelled/closed the popup, propagate to avoid opening multiple popups
        if (
          gisError?.message?.includes('closed') ||
          gisError?.type === 'popup_closed' ||
          gisError?.message?.includes('user_cancel')
        ) {
          throw new Error('Sign-in popup was closed before authorization.');
        }
      }
    }

    // 2. Fallback: Firebase Auth signInWithPopup
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Workspace access token. Please ensure permissions were granted.');
    }

    cachedAccessToken = credential.accessToken;
    cachedUser = result.user;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async (): Promise<void> => {
  try {
    await auth.signOut();
  } catch {}
  cachedAccessToken = null;
  cachedUser = null;
};
