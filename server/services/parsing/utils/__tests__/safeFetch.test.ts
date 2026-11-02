import { describe, expect, it, vi } from 'vitest';
import { assertPublicUrl, isBlockedAddress, readResponseTextUpTo } from '../safeFetch.ts';

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

describe('readResponseTextUpTo', () => {
  it('reads a stream cleanly up to maxBytes and cancels the reader when exceeded', async () => {
    let cancelCalled = false;
    const chunk1 = new TextEncoder().encode('Hello, ');
    const chunk2 = new TextEncoder().encode('world! This is a longer stream.');
    const chunk3 = new TextEncoder().encode('Extra chunk that should not be read.');

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk1);
        controller.enqueue(chunk2);
        controller.enqueue(chunk3);
        controller.close();
      },
      cancel() {
        cancelCalled = true;
      },
    });

    const response = new Response(stream);
    // Limit to 12 bytes: 'Hello, ' (7 bytes) + 'world' (5 bytes) = 'Hello, world'
    const result = await readResponseTextUpTo(response, 12);
    expect(result).toBe('Hello, world');
    expect(cancelCalled).toBe(true);
  });

  it('reads full stream when size is below maxBytes', async () => {
    const text = 'Short response';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });

    const response = new Response(stream);
    const result = await readResponseTextUpTo(response, 1024);
    expect(result).toBe(text);
  });

  it('handles UTF-8 multibyte characters cleanly even when truncated midway', async () => {
    // 🌍 is 4 bytes in UTF-8: 0xF0 0x9F 0x8C 0x8E
    const emojiText = 'A🌍B';
    const encoded = new TextEncoder().encode(emojiText); // 'A' (1) + 4 bytes + 'B' (1) = 6 bytes

    // Truncate at 3 bytes ('A' + first 2 bytes of 🌍)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });

    const response = new Response(stream);
    // fatal: false replaces incomplete UTF-8 bytes with U+FFFD instead of throwing
    const result = await readResponseTextUpTo(response, 3);
    expect(result).toBeDefined();
    expect(result.startsWith('A')).toBe(true);
  });

  it('handles response without reader or body fallback', async () => {
    const mockResponseNoBody = {
      body: null,
      text: async () => 'Fallback text content',
    } as unknown as Response;

    const result = await readResponseTextUpTo(mockResponseNoBody, 100);
    expect(result).toBe('Fallback text content');

    const truncatedResult = await readResponseTextUpTo(mockResponseNoBody, 8);
    expect(truncatedResult).toBe('Fallback');
  });

  it('returns empty string if maxBytes is 0 or negative', async () => {
    const response = new Response('Some content');
    const result = await readResponseTextUpTo(response, 0);
    expect(result).toBe('');
  });
});
