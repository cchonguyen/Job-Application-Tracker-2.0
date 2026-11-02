import { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';
import { CapturePayload, isValidCaptureToken, parseCaptureHash } from '../lib/captureBookmarklet';
import { JobRecord } from '../types';

type CaptureState =
  | { kind: 'saving' }
  | { kind: 'saved'; job: JobRecord; upgraded?: boolean }
  | { kind: 'duplicate'; candidate: JobRecord; existing: string }
  | { kind: 'error'; message: string };

function broadcastJobSync(type: 'job-saved' | 'job-upgraded', job: JobRecord) {
  const payload = { type, job, timestamp: Date.now() };
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('jat-jobs-sync');
      channel.postMessage(payload);
      channel.close();
    }
  } catch (err) {
    console.warn('BroadcastChannel error:', err);
  }
  try {
    localStorage.setItem('jat-sync-event', JSON.stringify(payload));
  } catch (err) {
    console.warn('localStorage sync error:', err);
  }
}

async function postJson(body: unknown) {
  const res = await apiFetch('/api/extract-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || `Request failed with HTTP ${res.status}`);
  return data;
}

/** Popup opened by the bookmarklet: saves the captured page as a new job and reports the result. */
export const CapturePage = () => {
  const [initialPayload] = useState(() => parseCaptureHash(window.location.hash));
  const payloadRef = useRef<CapturePayload | null>(null);
  const startedRef = useRef(false);
  const [state, setState] = useState<CaptureState>({ kind: 'saving' });

  const ingest = async () => {
    const payload = payloadRef.current;
    if (!payload) return;
    setState({ kind: 'saving' });
    try {
      const data = await postJson({ url: payload.url, manualText: payload.text || undefined });
      if (data.potentialDuplicate && data.candidateJob) {
        const first = data.duplicates?.[0];
        setState({
          kind: 'duplicate',
          candidate: data.candidateJob,
          existing: first ? `${first.existingJob.company} – ${first.existingJob.jobTitle} (${first.timeAgoLabel})` : '',
        });
      } else {
        const isUpgraded = Boolean(data.upgradedExistingStub);
        broadcastJobSync(isUpgraded ? 'job-upgraded' : 'job-saved', data.job);
        setState({ kind: 'saved', job: data.job, upgraded: isUpgraded });
      }
    } catch (err: any) {
      setState({ kind: 'error', message: err.message || 'Could not save this job.' });
    }
  };

  const saveAnyway = async (candidate: JobRecord) => {
    setState({ kind: 'saving' });
    try {
      const data = await postJson({ candidateJob: candidate, confirmDuplicate: true });
      broadcastJobSync('job-saved', data.job);
      setState({ kind: 'saved', job: data.job, upgraded: false });
    } catch (err: any) {
      setState({ kind: 'error', message: err.message || 'Could not save this job.' });
    }
  };

  useEffect(() => {
    // Run once even when StrictMode replays effects, so a capture never saves twice.
    if (startedRef.current) return;
    startedRef.current = true;
    const payload = initialPayload;
    // Drop the captured text from the address bar and history.
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!payload) {
      setState({ kind: 'error', message: 'This capture link is incomplete. Click the bookmark again on the job page.' });
      return;
    }
    if (!isValidCaptureToken(payload.token)) {
      setState({
        kind: 'error',
        message: 'This bookmark is not linked to this tracker. Drag a fresh one from Settings › One-click capture.',
      });
      return;
    }
    payloadRef.current = payload;
    ingest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4 text-sm">
        {state.kind === 'saving' && (
          <div className="flex items-center gap-3 text-slate-700">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
            <span>Saving this job to your tracker…</span>
          </div>
        )}

        {state.kind === 'saved' && (
          <>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900">
                  {state.upgraded ? 'Snapshot upgraded' : 'Saved'}
                </div>
                <div className="text-slate-600">
                  {state.job.company} – {state.job.jobTitle}
                </div>
                {state.upgraded && (
                  <div className="text-xs text-emerald-700 mt-1">
                    Upgraded existing stub in-place with full posting details.
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <a href="/" className="flex-1 text-center px-3 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">
                Open tracker
              </a>
              <button type="button" onClick={() => window.close()} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                Close
              </button>
            </div>
          </>
        )}

        {state.kind === 'duplicate' && (
          <>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900">Possible duplicate</div>
                <div className="text-slate-600">
                  You applied to a similar role recently{state.existing ? `: ${state.existing}` : ''}.
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => saveAnyway(state.candidate)} className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700">
                Save anyway
              </button>
              <button type="button" onClick={() => window.close()} className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                Skip
              </button>
            </div>
          </>
        )}

        {state.kind === 'error' && (
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-slate-700">{state.message}</div>
          </div>
        )}
      </div>
    </div>
  );
};
