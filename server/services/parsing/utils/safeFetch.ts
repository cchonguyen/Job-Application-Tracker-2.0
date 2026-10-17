import dns from 'dns/promises';
import net from 'net';

/**
 * Addresses a user-supplied job link must never reach: loopback, private networks, link-local (including cloud
 * metadata at 169.254.169.254), carrier-grade NAT, multicast and reserved ranges.
 */
const blocked = new net.BlockList();
for (const [prefix, bits] of [
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
] as const) {
  blocked.addSubnet(prefix, bits, 'ipv4');
}
for (const [prefix, bits] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(prefix, bits, 'ipv6');
}

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return true;
}

export type HostLookup = (hostname: string) => Promise<string[]>;

const systemLookup: HostLookup = async (hostname) =>
  (await dns.lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/** Throws unless the URL is plain http(s) on a standard port and every address its host resolves to is public. */
export async function assertPublicUrl(rawUrl: string, lookup: HostLookup = systemLookup): Promise<URL> {
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
  const addresses = net.isIP(host) ? [host] : await lookup(host);
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
