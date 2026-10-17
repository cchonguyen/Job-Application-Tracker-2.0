import { currentAccessToken } from './auth';

export const AUTH_REQUIRED_EVENT = 'jat:auth-required';

// Earlier versions stored a shared API access key here; sign-in replaced it, so drop the leftover secret.
try {
  localStorage.removeItem('jat.apiAccessKey');
} catch {
  // Storage unavailable (private mode); nothing was stored.
}

/** fetch() for this app's own /api, carrying the signed-in user's token. A 401 asks the UI to sign in again. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await currentAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  }
  return res;
}
