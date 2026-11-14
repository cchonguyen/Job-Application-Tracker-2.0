import { useId, useState } from 'react';
import { X, FileText } from 'lucide-react';
import { JobStatus } from '../types';
import { STATUS_META, STATUS_ORDER } from '../lib/statusMeta';

interface ManualJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: { manualText: string; status: JobStatus; notes?: string }) => Promise<void>;
  isIngesting: boolean;
}

export const ManualJobModal = ({ isOpen, onClose, onSubmit, isIngesting }: ManualJobModalProps) => {
  const [manualText, setManualText] = useState('');
  const [targetStatus, setTargetStatus] = useState<JobStatus>('Applied');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const headingId = useId();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) {
      setErrorMsg('Please paste job description text or qualification details.');
      return;
    }
    setErrorMsg(null);
    try {
      await onSubmit({
        manualText: manualText.trim(),
        status: targetStatus,
        notes: notes.trim() || undefined,
      });
      setManualText('');
      setNotes('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to process manual entry');
    }
  };

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4 jat-scrim backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={() => !isIngesting && onClose()}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="relative w-full max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90dvh] pb-[env(safe-area-inset-bottom)]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 id={headingId} className="text-sm font-bold text-slate-900">Manual job description</h3>
              <p className="text-xs text-slate-500">Paste text from login-walled portals or private documents</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isIngesting}
            aria-label="Close manual entry dialog"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Job description <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={8}
              required
              disabled={isIngesting}
              placeholder="Paste the full job posting, title, company name, requirements, and salary details here. The AI parser will automatically extract structured fields..."
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Initial status
              </label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as JobStatus)}
                disabled={isIngesting}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {STATUS_ORDER.map((status) => {
                  const meta = STATUS_META[status];
                  return (
                    <option key={meta.value} value={meta.value}>
                      {meta.label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Personal notes
              </label>
              <input
                type="text"
                placeholder="e.g. Referred by coworker, applied via email"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isIngesting}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isIngesting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isIngesting}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
            >
              {isIngesting ? 'Parsing text…' : 'Parse & add job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
