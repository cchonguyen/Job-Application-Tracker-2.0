import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mail, X, Check, RefreshCw, ArrowRight, AlertTriangle } from 'lucide-react';
import type { JobStatus } from '../types';
import type { EmailSuggestion, UnmatchedRejection } from '../lib/emailSignals.types';
import { apiFetch } from '../lib/apiClient';
import { getStatusMeta } from '../lib/statusMeta';

const DISMISSED_KEY = 'jat.gmailDismissed';
const MAX_DISMISSED = 500;

function readDismissed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-MAX_DISMISSED)));
  } catch {
    // Storage unavailable; the suggestion just comes back next time.
  }
}

interface GmailSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (jobId: string, status: JobStatus) => Promise<void>;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'disabled' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      scanned: number;
      bridgeVersion: number | null;
      suggestions: EmailSuggestion[];
      unmatchedRejections: UnmatchedRejection[];
    };

/** Suggested status changes from recent Gmail, read through the owner's Apps Script bridge. Nothing changes until the user clicks Apply. */
export const GmailSuggestionsModal = ({ isOpen, onClose, onApply }: GmailSuggestionsModalProps) => {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await apiFetch('/api/email-suggestions?days=30');
      const body = await res.json();
      if (!body.enabled) return setState({ kind: 'disabled' });
      if (!body.success) return setState({ kind: 'error', message: body.error || 'Could not read Gmail' });
      const dismissed = new Set(readDismissed());
      setState({
        kind: 'ready',
        scanned: body.scanned ?? 0,
        bridgeVersion: typeof body.bridgeVersion === 'number' ? body.bridgeVersion : null,
        suggestions: (body.suggestions as EmailSuggestion[]).filter((s) => !dismissed.has(s.messageId)),
        unmatchedRejections: Array.isArray(body.unmatchedRejections)
          ? (body.unmatchedRejections as UnmatchedRejection[])
          : [],
      });
    } catch {
      setState({ kind: 'error', message: 'Could not reach the tracker' });
    }
  }, []);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const remove = (messageId: string) =>
    setState((prev) =>
      prev.kind === 'ready' ? { ...prev, suggestions: prev.suggestions.filter((s) => s.messageId !== messageId) } : prev,
    );

  const dismiss = (s: EmailSuggestion) => {
    writeDismissed([...readDismissed(), s.messageId]);
    remove(s.messageId);
  };

  const apply = async (s: EmailSuggestion) => {
    setBusyId(s.messageId);
    try {
      await onApply(s.jobId, s.toStatus);
      remove(s.messageId);
    } finally {
      setBusyId(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-40 overflow-y-auto flex items-end sm:items-center justify-center jat-scrim backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gmail-suggestions-title"
        className="w-full max-w-2xl max-h-[90dvh] sm:max-h-[85vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 id="gmail-suggestions-title" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Mail className="h-4 w-4 text-rose-500" /> Gmail suggestions
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
              aria-label="Check Gmail again"
            >
              <RefreshCw className={`h-4 w-4 ${state.kind === 'loading' ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
              aria-label="Close Gmail suggestions"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 text-sm text-slate-700">
          {state.kind === 'loading' && <p className="text-slate-500">Reading the last 30 days of job emails…</p>}
          {state.kind === 'disabled' && (
            <p className="text-slate-500">
              Gmail isn't connected. Follow docs/GMAIL_BRIDGE.md to set up the Apps Script bridge.
            </p>
          )}
          {state.kind === 'error' && <p className="text-rose-600">{state.message}</p>}
          {state.kind === 'ready' && state.suggestions.length === 0 && (
            <p className="text-slate-500">No status changes found in {state.scanned} recent emails.</p>
          )}
          {state.kind === 'ready' && state.suggestions.length > 0 && (
            <ul className="space-y-3">
              {state.suggestions.map((s) => {
                const fromMeta = getStatusMeta(s.fromStatus);
                const toMeta = getStatusMeta(s.toStatus);
                const FromIcon = fromMeta.icon;
                const ToIcon = toMeta.icon;
                return (
                <li key={s.messageId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-slate-800">
                      {s.company} <span className="font-normal text-slate-500">· {s.jobTitle}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium ${fromMeta.badge}`}>
                        <FromIcon className={`h-3 w-3 ${fromMeta.iconClass}`} />
                        {fromMeta.label}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-semibold ${toMeta.badge}`}>
                        <ToIcon className={`h-3 w-3 ${toMeta.iconClass}`} />
                        {toMeta.label}
                      </span>
                      {s.confidence === 'low' && (
                        <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700">
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                          check this
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-600" title={s.subject}>
                    {s.subject}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {s.sender} · {s.date ? new Date(s.date).toLocaleDateString() : ''} · {s.reason}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === s.messageId}
                      onClick={() => void apply(s)}
                      className="flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => dismiss(s)}
                      className="rounded px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
          {state.kind === 'ready' && state.unmatchedRejections.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-xs font-medium text-slate-500">
                Unmatched rejection emails ({state.unmatchedRejections.length})
              </p>
              <ul className="mt-2 space-y-1.5">
                {state.unmatchedRejections.map((u) => (
                  <li key={u.messageId} className="rounded border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-xs">
                    <div className="truncate font-medium text-slate-600" title={u.subject}>
                      {u.subject || '(No subject)'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {u.sender}
                      {u.date ? ` · ${new Date(u.date).toLocaleDateString()}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {state.kind === 'ready' && (
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            Scanned {state.scanned} recent emails · {state.bridgeVersion ? `Bridge v${state.bridgeVersion}` : 'Bridge pre-v3'}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
