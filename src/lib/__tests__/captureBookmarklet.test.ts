import { describe, expect, it } from 'vitest';
import { buildBookmarklet, isCaptureHash, parseCaptureHash } from '../captureBookmarklet';

function runBookmarklet(href: string, page: { url: string; title: string; text: string; selection?: string }) {
  let opened = '';
  const code = decodeURIComponent(href.replace(/^javascript:/, ''));
  const fn = new Function(
    'window',
    'document',
    'location',
    'getSelection',
    'alert',
    code
  );
  const getSelection = () => page.selection || '';
  fn(
    { getSelection, open: (u: string) => ((opened = u), {}) },
    { body: { innerText: page.text }, title: page.title },
    { href: page.url },
    getSelection,
    () => {}
  );
  return opened;
}

describe('capture bookmarklet', () => {
  const page = {
    url: 'https://acme.darwinbox.com/ms/candidatev2/main/careers/jobDetails/abc123',
    title: 'Senior PM | Acme',
    text: 'Senior Product Manager\n\n\n\nWe are hiring a PM to own pharmacy workflows. Salary: $150,000 - $180,000',
  };

  it('opens the tracker with the page URL, title, text and token in the fragment', () => {
    const opened = runBookmarklet(buildBookmarklet('https://tracker.example.com', 'tok123'), page);
    expect(opened.startsWith('https://tracker.example.com/#capture=')).toBe(true);

    const hash = opened.slice(opened.indexOf('#'));
    expect(isCaptureHash(hash)).toBe(true);
    const payload = parseCaptureHash(hash)!;
    expect(payload.token).toBe('tok123');
    expect(payload.url).toBe(page.url);
    expect(payload.title).toBe(page.title);
    expect(payload.text).toContain('pharmacy workflows');
    expect(payload.text).not.toContain('\n\n\n');
  });

  it('prefers a substantial text selection over the whole page', () => {
    const selection = 'Selected JD body. '.repeat(20);
    const opened = runBookmarklet(buildBookmarklet('https://tracker.example.com', 't'), { ...page, selection });
    const payload = parseCaptureHash(opened.slice(opened.indexOf('#')))!;
    expect(payload.text).toBe(selection);
  });

  it('rejects malformed or non-http payloads', () => {
    expect(parseCaptureHash('#capture=not-json')).toBeNull();
    expect(parseCaptureHash('#capture=' + encodeURIComponent(JSON.stringify({ k: 't', u: 'javascript:alert(1)' })))).toBeNull();
    expect(parseCaptureHash('#other')).toBeNull();
  });
});
