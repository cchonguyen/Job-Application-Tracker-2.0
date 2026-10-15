const TOKEN_STORAGE_KEY = 'jat.captureToken';
const HASH_PREFIX = '#capture=';
/** Enough for any posting; keeps the popup URL well under browser limits. */
export const MAX_CAPTURE_CHARS = 30_000;

export interface CapturePayload {
  token: string;
  url: string;
  title: string;
  text: string;
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The bookmarklet embeds this token so the capture page only saves jobs sent by your own bookmarklet,
 * not by any site that opens the tracker with a crafted link. Regenerating it retires old bookmarklets.
 */
export function getCaptureToken(regenerate = false): string {
  try {
    const existing = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (existing && !regenerate) return existing;
    const token = randomToken();
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return token;
  } catch {
    return '';
  }
}

export function isValidCaptureToken(token: string): boolean {
  try {
    const expected = localStorage.getItem(TOKEN_STORAGE_KEY);
    return !!expected && token === expected;
  } catch {
    return false;
  }
}

/**
 * Builds the javascript: URL for the bookmark. Clicked on a job page, it opens the tracker in a popup with the
 * page's URL and visible text (or the current selection, if one is made) in the URL fragment. The fragment never
 * reaches a server, and pages that render in the browser (Darwinbox, Workday, LinkedIn) are already rendered.
 */
export function buildBookmarklet(appOrigin: string, token: string): string {
  const code = `(function(){
var s=String(window.getSelection?getSelection():'');
var b=(document.body&&document.body.innerText)||'';
var x=(s.length>200?s:b).replace(/\\n{3,}/g,'\\n\\n').slice(0,${MAX_CAPTURE_CHARS});
var p={k:${JSON.stringify(token)},u:location.href,t:document.title,x:x};
var w=window.open(${JSON.stringify(appOrigin)}+'/${HASH_PREFIX}'+encodeURIComponent(JSON.stringify(p)),'_blank','width=520,height=640');
if(!w)alert('Allow pop-ups on this site to save jobs to your tracker.');
})();`.replace(/\n/g, '');
  return `javascript:${encodeURIComponent(code)}`;
}

export function isCaptureHash(hash: string): boolean {
  return hash.startsWith(HASH_PREFIX);
}

export function parseCaptureHash(hash: string): CapturePayload | null {
  if (!isCaptureHash(hash)) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(hash.slice(HASH_PREFIX.length)));
    if (typeof raw?.k !== 'string' || typeof raw?.u !== 'string' || !/^https?:\/\//i.test(raw.u)) return null;
    return {
      token: raw.k,
      url: raw.u,
      title: typeof raw.t === 'string' ? raw.t : '',
      text: typeof raw.x === 'string' ? raw.x.slice(0, MAX_CAPTURE_CHARS) : '',
    };
  } catch {
    return null;
  }
}
