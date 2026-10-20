/**
 * Addresses a user-supplied job link must never reach: loopback, private networks, link-local (including cloud
 * metadata at 169.254.169.254), carrier-grade NAT, multicast and reserved ranges. Plain code rather than
 * net.BlockList so the same check runs under Node and on Cloudflare Workers.
 */
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const BLOCKED_V6: Array<[string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

function parseIpv4(address: string): bigint | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    value = (value << 8n) | BigInt(Number(part));
  }
  return value;
}

function parseIpv6(address: string): bigint | null {
  let text = address.toLowerCase();
  if (!/^[0-9a-f:.]+$/.test(text) || text.split('::').length > 2) return null;
  // A trailing dotted IPv4 (e.g. ::ffff:127.0.0.1) stands for the last two groups.
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = parseIpv4(dotted[2]);
    if (v4 === null) return null;
    text = `${dotted[1]}${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
  }
  const [left, right] = text.split('::');
  const leftGroups = left ? left.split(':') : [];
  const rightGroups = right ? right.split(':') : [];
  const missing = 8 - leftGroups.length - rightGroups.length;
  if (right === undefined ? missing !== 0 : missing < 1) return null;
  const groups = [...leftGroups, ...Array(right === undefined ? 0 : missing).fill('0'), ...rightGroups];
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

function inRanges(value: bigint, ranges: Array<[string, number]>, width: bigint, parse: (a: string) => bigint | null) {
  return ranges.some(([prefix, bits]) => {
    const shift = width - BigInt(bits);
    return value >> shift === (parse(prefix) as bigint) >> shift;
  });
}

export function isBlockedAddress(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4 !== null) return inRanges(v4, BLOCKED_V4, 32n, parseIpv4);
  const v6 = parseIpv6(address);
  if (v6 !== null) {
    // IPv4-mapped (::ffff:a.b.c.d) is judged as the IPv4 address it carries.
    if (v6 >> 32n === 0xffffn) return inRanges(v6 & 0xffffffffn, BLOCKED_V4, 32n, parseIpv4);
    return inRanges(v6, BLOCKED_V6, 128n, parseIpv6);
  }
  return true;
}

function isIpLiteral(host: string): boolean {
  return parseIpv4(host) !== null || parseIpv6(host) !== null;
}

export type HostLookup = (hostname: string) => Promise<string[]>;

const runsOnCloudflare = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

/** Node: the system resolver, the same one fetch() then uses. */
const systemLookup: HostLookup = async (hostname) => {
  const dns = await import('node:dns/promises');
  return (await dns.lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
};

/** Cloudflare Workers have no system resolver, so ask Cloudflare's public DNS over HTTPS for A and AAAA records. */
export const dohLookup: HostLookup = async (hostname) => {
  const answers = await Promise.all(
    ['A', 'AAAA'].map(async (type) => {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
        { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(4000) }
      );
      if (!response.ok) throw new Error(`DNS lookup failed (${response.status}).`);
      const body = (await response.json()) as { Answer?: Array<{ type: number; data: string }> };
      // Type 1 is A, 28 is AAAA; CNAME entries (type 5) along the way are skipped.
      return (body.Answer || []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
    })
  );
  return answers.flat();
};

const defaultLookup: HostLookup = runsOnCloudflare ? dohLookup : systemLookup;

/** Throws unless the URL is plain http(s) on a standard port and every address its host resolves to is public. */
export async function assertPublicUrl(rawUrl: string, lookup: HostLookup = defaultLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Job link is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Job link must start with http:// or https://.');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('Job link must use a standard web port.');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIpLiteral(host) ? [host] : await lookup(host);
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new Error('Job link points to a private or internal address.');
  }
  return url;
}

const MAX_REDIRECTS = 5;

/**
 * fetch() for URLs that come from users. Checks the target before each request and follows redirects by hand so a
 * public page can't bounce the server onto an internal address.
 */
export async function fetchPublicUrl(rawUrl: string, init: RequestInit = {}, lookup?: HostLookup): Promise<Response> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current, lookup);
    const response = await fetch(url, { ...init, redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }
    return response;
  }
  throw new Error('Job link redirected too many times.');
}
