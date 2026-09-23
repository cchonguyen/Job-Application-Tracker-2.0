import { useState } from 'react';
import { X, FileText, Send, Bookmark, Calendar, Award, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { JobStatus } from '../types';

interface ManualJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (params: { manualText: string; status: JobStatus; notes?: string }) => Promise<void>;
  isIngesting: boolean;
}

const STATUS_OPTIONS: { value: JobStatus; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { value: 'Applied', label: 'Applied', icon: Send, color: 'text-indigo-600' },
  { value: 'Saved', label: 'Saved', icon: Bookmark, color: 'text-slate-600' },
  { value: 'Interviewing', label: 'Interviewing', icon: Calendar, color: 'text-amber-600' },
  { value: 'Offer', label: 'Offer', icon: Award, color: 'text-emerald-600' },
  { value: 'Accepted', label: 'Accepted', icon: CheckCircle2, color: 'text-teal-600' },
  { value: 'Rejected', label: 'Rejected', icon: XCircle, color: 'text-rose-600' },
  { value: 'Declined', label: 'Declined', icon: Ban, color: 'text-stone-600' },
];

export const ManualJobModal = ({ isOpen, onClose, onSubmit, isIngesting }: ManualJobModalProps) => {
  const [manualText, setManualText] = useState('');
  const [targetStatus, setTargetStatus] = useState<JobStatus>('Applied');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={() => !isIngesting && onClose()}
      />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Manual Job Description Entry</h3>
              <p className="text-xs text-slate-500">Paste text from login-walled portals or private documents</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isIngesting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
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
              Job Description / Listing Text <span className="text-rose-500">*</span>
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
                Initial Status
              </label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as JobStatus)}
                disabled={isIngesting}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Personal Notes (Optional)
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
              {isIngesting ? 'Parsing Text...' : 'Parse & Add to Tracker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
