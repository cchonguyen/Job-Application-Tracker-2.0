import { describe, expect, it } from 'vitest';
import {
  appendStatusHistory,
  initialStatusHistory,
  normalizeStatusHistory,
} from '../statusHistory';

describe('statusHistory helpers', () => {
  const now = new Date('2026-09-21T15:30:00.000Z');

  it('seeds initial history with from: null', () => {
    expect(initialStatusHistory('Saved', now)).toEqual([
      { at: '2026-09-21T15:30:00.000Z', from: null, to: 'Saved' },
    ]);
  });

  it('appends a transition when status changes', () => {
    const history = initialStatusHistory('Saved', now);
    const next = appendStatusHistory(history, 'Saved', 'Applied', new Date('2026-09-22T10:00:00.000Z'));
    expect(next).toEqual([
      { at: '2026-09-21T15:30:00.000Z', from: null, to: 'Saved' },
      { at: '2026-09-22T10:00:00.000Z', from: 'Saved', to: 'Applied' },
    ]);
  });

  it('does not append when from === to', () => {
    const history = initialStatusHistory('Applied', now);
    expect(appendStatusHistory(history, 'Applied', 'Applied', now)).toEqual(history);
  });

  it('treats missing history as empty and appends', () => {
    expect(appendStatusHistory(undefined, 'Saved', 'Interviewing', now)).toEqual([
      { at: '2026-09-21T15:30:00.000Z', from: 'Saved', to: 'Interviewing' },
    ]);
  });

  it('normalizes malformed / legacy payloads gracefully', () => {
    expect(normalizeStatusHistory(undefined)).toEqual([]);
    expect(normalizeStatusHistory(null)).toEqual([]);
    expect(normalizeStatusHistory('nope')).toEqual([]);
    expect(
      normalizeStatusHistory([
        { at: '2026-09-21T00:00:00.000Z', from: null, to: 'Applied' },
        { at: '', from: 'Applied', to: 'Offer' },
        { at: '2026-09-22T00:00:00.000Z', from: 'Applied', to: 'NotAStatus' },
        { at: '2026-09-23T00:00:00.000Z', from: 'Applied', to: 'Interviewing' },
        { junk: true },
      ])
    ).toEqual([
      { at: '2026-09-21T00:00:00.000Z', from: null, to: 'Applied' },
      { at: '2026-09-23T00:00:00.000Z', from: 'Applied', to: 'Interviewing' },
    ]);
  });
});
