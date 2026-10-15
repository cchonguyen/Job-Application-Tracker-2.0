const STORAGE_KEY = 'jat.apiAccessKey';
export const AUTH_REQUIRED_EVENT = 'jat:auth-required';

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setApiKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode); the key then lasts only until reload.
  }
}

/** fetch() for this app's own /api, carrying the access key. A 401 asks the UI to prompt for the key. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const key = getApiKey();
  if (key) headers.set('Authorization', `Bearer ${key}`);

  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  }
  return res;
}
