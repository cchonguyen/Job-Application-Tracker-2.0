import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const BRIDGE_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'apps-script/GmailBridge.gs'),
  'utf8',
);

interface MockMessage {
  getId: () => string;
  getDate: () => Date;
  getFrom: () => string;
  getSubject: () => string;
  getPlainBody: () => string;
  getBody: () => string;
}

interface MockThread {
  getId: () => string;
  getLastMessageDate: () => Date;
  getMessages: () => MockMessage[];
}

function createMessage(opts: {
  id: string;
  date: string;
  from: string;
  subject: string;
  plainBody?: string;
  body?: string;
}): MockMessage {
  return {
    getId: () => opts.id,
    getDate: () => new Date(opts.date),
    getFrom: () => opts.from,
    getSubject: () => opts.subject,
    getPlainBody: () => opts.plainBody ?? '',
    getBody: () => opts.body ?? '',
  };
}

function createThread(opts: {
  id: string;
  lastMessageDate: string;
  messages?: MockMessage[];
}): MockThread {
  return {
    getId: () => opts.id,
    getLastMessageDate: () => new Date(opts.lastMessageDate),
    getMessages: () => opts.messages ?? [],
  };
}

function loadBridge(overrides?: {
  search?: (query: string, start: number, max: number) => MockThread[];
  activeEmail?: string;
  bridgeKey?: string | null;
}) {
  const searchSpy = vi.fn(overrides?.search ?? (() => []));
  const context: Record<string, unknown> = {
    GmailApp: { search: searchSpy },
    Session: {
      getActiveUser: () => ({
        getEmail: () => overrides?.activeEmail ?? 'me@example.com',
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) =>
          key === 'BRIDGE_KEY' ? (overrides?.bridgeKey ?? 'test-key') : null,
        setProperty: vi.fn(),
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text: string) => ({
        setMimeType: () => text,
      }),
    },
    Utilities: {
      getUuid: () => '12345678-1234-1234-1234-1234567890ab',
    },
    Logger: { log: vi.fn() },
  };

  vm.runInNewContext(BRIDGE_SOURCE, context);

  return {
    searchSpy,
    collectThreads: context.collectThreads as (days: number) => MockThread[],
    collectItems: context.collectItems as (days: number) => Array<{
      id: string;
      threadId: string;
      date: string;
      from: string;
      subject: string;
      snippet: string;
      links: string[];
    }>,
  };
}

describe('GmailBridge.gs', () => {
  it('runs each flat search group, deduplicates threads, and sorts newest-first', () => {
    const older = createThread({ id: 't1', lastMessageDate: '2026-10-01T10:00:00Z' });
    const newest = createThread({ id: 't2', lastMessageDate: '2026-10-03T10:00:00Z' });
    const middle = createThread({ id: 't3', lastMessageDate: '2026-10-02T10:00:00Z' });

    const { searchSpy, collectThreads } = loadBridge({
      search: (query) => {
        if (query.includes('from:(')) return [older, newest];
        if (query.includes('subject:(')) return [newest, middle];
        return [older];
      },
    });

    const threads = collectThreads(14);

    expect(searchSpy).toHaveBeenCalledTimes(3);
    for (const [query, start, max] of searchSpy.mock.calls) {
      expect(query).toMatch(/^newer_than:14d -in:chats -category:promotions /);
      expect(start).toBe(0);
      expect(max).toBe(100);
    }
    expect(searchSpy.mock.calls[0][0]).toContain('from:(');
    expect(searchSpy.mock.calls[1][0]).toContain('subject:(');
    expect(searchSpy.mock.calls[2][0]).toContain('"thank you for your interest"');

    expect(threads.map((t) => t.getId())).toEqual(['t2', 't3', 't1']);
  });

  it('skips messages from the active user and extracts expected item fields', () => {
    const selfMsgBare = createMessage({
      id: 'm1',
      date: '2026-10-01T08:00:00Z',
      from: 'me@example.com',
      subject: 'Re: Application',
      plainBody: 'Following up',
    });
    const selfMsgDisplay = createMessage({
      id: 'm2',
      date: '2026-10-01T09:00:00Z',
      from: 'Charlie <ME@example.com>',
      subject: 'Re: Application',
      plainBody: 'Another reply',
    });
    const recruiterMsg = createMessage({
      id: 'm3',
      date: '2026-10-02T12:30:00Z',
      from: 'Recruiter <jobs@greenhouse.io>',
      subject: 'Interview invitation',
      plainBody: 'Hello   world\n\nnext steps',
      body: '<a href="https://example.com/apply?a=1&amp;b=2">Apply</a><a href="https://example.com/apply?a=1&amp;b=2">Dup</a>',
    });

    const thread = createThread({
      id: 't10',
      lastMessageDate: '2026-10-02T12:30:00Z',
      messages: [selfMsgBare, selfMsgDisplay, recruiterMsg],
    });

    const { collectItems } = loadBridge({
      activeEmail: 'me@example.com',
      search: (_q, _s, _m) => [thread],
    });

    const items = collectItems(7);
    expect(items).toEqual([
      {
        id: 'm3',
        threadId: 't10',
        date: '2026-10-02T12:30:00.000Z',
        from: 'Recruiter <jobs@greenhouse.io>',
        subject: 'Interview invitation',
        snippet: 'Hello world next steps',
        links: ['https://example.com/apply?a=1&b=2'],
      },
    ]);
  });
});
