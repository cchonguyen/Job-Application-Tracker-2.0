import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertTriangle, Briefcase, Loader2 } from 'lucide-react';
import {
  createSignInNonce,
  getAuthClient,
  getAuthConfig,
  signInWithGoogle,
  signInWithGoogleIdToken,
  signOut,
} from '../lib/auth';
import { loadGsi } from '../lib/googleAuth';
import { AUTH_REQUIRED_EVENT } from '../lib/apiClient';
import { clearSheetsConnection } from '../hooks/useGoogleSheetsSync';

interface Account {
  email: string | null;
  signOut: () => Promise<void>;
}

/** The signed-in account, or null when the app runs without sign-in (local development). */
const AccountContext = createContext<Account | null>(null);

export const useAccount = () => useContext(AccountContext);

type GateState =
  | { kind: 'loading' }
  | { kind: 'disabled' }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; session: Session }
  | { kind: 'error'; message: string };

async function signOutAndReset() {
  await signOut();
  // This browser's Sheets link and the in-memory Google token belong to the account that just left.
  clearSheetsConnection();
  window.location.assign('/');
}

/** Shows the sign-in screen until the browser has a session, then renders the tracker for that account. */
export const AuthGate = ({ children, capture = false }: { children: ReactNode; capture?: boolean }) => {
  const [state, setState] = useState<GateState>({ kind: 'loading' });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    getAuthClient()
      .then(async (client) => {
        if (cancelled) return;
        if (!client) {
          setState({ kind: 'disabled' });
          return;
        }

        const { data } = await client.auth.getSession();
        if (cancelled) return;
        setState(data.session ? { kind: 'signedIn', session: data.session } : { kind: 'signedOut' });
        if (data.session && new URLSearchParams(window.location.search).has('code')) {
          // Google sign-in returns with ?code=…; once exchanged for a session it only clutters the address bar.
          history.replaceState(null, '', window.location.pathname + window.location.hash);
        }

        const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
          setState(session ? { kind: 'signedIn', session } : { kind: 'signedOut' });
        });
        unsubscribe = () => listener.subscription.unsubscribe();
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: err.message || 'Could not reach the tracker.' });
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    // The server turned a request away: refresh the session once, and show sign-in if that fails too.
    const onAuthRequired = async () => {
      const client = await getAuthClient().catch(() => null);
      if (!client) return;
      const { data, error } = await client.auth.refreshSession();
      if (error || !data.session) setState({ kind: 'signedOut' });
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  if (state.kind === 'disabled') return <>{children}</>;

  if (state.kind === 'signedIn') {
    const account: Account = { email: state.session.user.email ?? null, signOut: signOutAndReset };
    return (
      // Keyed by user so a different account never sees the previous one's jobs while they reload.
      <AccountContext.Provider value={account} key={state.session.user.id}>
        {children}
      </AccountContext.Provider>
    );
  }

  return <SignInScreen state={state} capture={capture} />;
};

const SignInScreen = ({ state, capture }: { state: GateState; capture: boolean }) => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startGoogle = async () => {
    setError(null);
    setIsRedirecting(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google sign-in could not start.');
      setIsRedirecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-5 text-sm">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <Briefcase className="w-5 h-5" />
          </div>
          <h1 className="text-base font-semibold text-slate-900">Job Application Tracker</h1>
        </div>

        {state.kind === 'loading' && (
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span>Checking your sign-in…</span>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="flex items-start gap-2.5 text-slate-700">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{state.message}</span>
          </div>
        )}

        {state.kind === 'signedOut' && capture && (
          <>
            <p className="text-slate-600">
              Sign in to your tracker in this browser first, then click the bookmark on the job page again.
            </p>
            <a
              href="/"
              className="block w-full text-center px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
            >
              Open tracker to sign in
            </a>
          </>
        )}

        {state.kind === 'signedOut' && !capture && (
          <>
            <p className="text-slate-600">Sign in to see and track your applications. Your jobs are visible only to you.</p>
            <GoogleIdentityButton
              onError={setError}
              fallback={
                <button
                  type="button"
                  onClick={startGoogle}
                  disabled={isRedirecting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-60"
                >
                  {isRedirecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleMark />}
                  <span>Continue with Google</span>
                </button>
              }
            />
            {error && <p className="text-rose-600 text-xs">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Google's own sign-in button. Signing in happens in a Google popup on this site and the ID token goes straight to
 * Supabase, so Google's account chooser names this app instead of the Supabase project. Falls back to the redirect
 * button when the server has no Google client ID or Google's script can't load.
 */
const GoogleIdentityButton = ({ fallback, onError }: { fallback: ReactNode; onError: (message: string) => void }) => {
  const slot = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'loading' | 'google' | 'fallback'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const config = await getAuthConfig().catch(() => null);
      const clientId = config?.googleClientId;
      if (!clientId || !(await loadGsi()) || !window.google?.accounts?.id || cancelled) {
        if (!cancelled) setMode('fallback');
        return;
      }
      const nonce = await createSignInNonce();
      if (cancelled || !slot.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce: nonce.hashed,
        callback: async ({ credential }: { credential?: string }) => {
          if (!credential) return;
          try {
            await signInWithGoogleIdToken(credential, nonce.raw);
          } catch (err: any) {
            onError(err.message || 'Google sign-in failed.');
          }
        },
      });
      window.google.accounts.id.renderButton(slot.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'center',
        width: Math.min(400, slot.current.offsetWidth || 320),
      });
      setMode('google');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={slot} className={mode === 'google' ? 'flex justify-center min-h-10' : 'w-full'} hidden={mode === 'fallback'} />
      {mode === 'fallback' && fallback}
    </>
  );
};

const GoogleMark = () => (
  <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);
