import { describe, expect, it } from 'vitest';
import { assertPublicUrl, isBlockedAddress } from '../safeFetch.ts';

const resolvesTo = (...addresses: string[]) => async () => addresses;

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.5',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['104.18.32.7', '8.8.8.8', '2606:4700::6810:84e5'])('allows public %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it('accepts a public job link', async () => {
    const url = await assertPublicUrl('https://boards.greenhouse.io/acme/jobs/1', resolvesTo('104.18.32.7'));
    expect(url.hostname).toBe('boards.greenhouse.io');
  });

  it.each([
    'http://127.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://10.0.0.8/',
  ])('rejects the literal internal address in %s', async (url) => {
    await expect(assertPublicUrl(url, resolvesTo('104.18.32.7'))).rejects.toThrow(/private or internal/);
  });

  it('rejects a hostname that resolves to an internal address', async () => {
    await expect(assertPublicUrl('https://sneaky.example.com/', resolvesTo('104.18.32.7', '10.0.0.1'))).rejects.toThrow(
      /private or internal/
    );
  });

  it('rejects non-web schemes and unusual ports', async () => {
    await expect(assertPublicUrl('file:///etc/passwd', resolvesTo())).rejects.toThrow(/http/);
    await expect(assertPublicUrl('https://example.com:6379/', resolvesTo('104.18.32.7'))).rejects.toThrow(/port/);
  });
});

describe('isBlockedAddress edge cases', () => {
  it.each(['::ffff:7f00:1', '0:0:0:0:0:0:0:1', '172.31.255.255', '224.0.0.1', 'not-an-ip', '1.2.3', '256.1.1.1'])(
    'blocks %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(true);
    }
  );

  it.each(['172.32.0.1', '100.128.0.1', '2001:4860:4860::8888'])('allows public %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});
