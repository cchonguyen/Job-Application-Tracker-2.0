import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import {
  X,
  Building2,
  MapPin,
  Calendar,
  ExternalLink,
  Edit,
  Trash2,
  Briefcase,
  FileText,
  Save,
  History,
  Banknote,
  Factory,
  Clock,
} from 'lucide-react';
import { JobRecord, JobStatus } from '../types';
import { CompanyLogo } from './CompanyLogo';
import { getStatusMeta, STATUS_ORDER } from '../lib/statusMeta';
import { normalizeStatusHistory } from '../lib/statusHistory';
import { companyFactsForDisplay, needsManualReview } from '../lib/formatHelpers';

interface JobDetailModalProps {
  job: JobRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (id: string, newStatus: JobStatus) => Promise<void>;
  onEditClick: (job: JobRecord) => void;
  onDeleteClick: (id: string) => Promise<void>;
  onUpdateNotes: (id: string, notes: string) => Promise<void>;
  onUpdateDateApplied: (id: string, dateApplied: string | null) => Promise<void>;
}

function formatHistoryTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const JobDetailModal = ({
  job,
  isOpen,
  onClose,
  onStatusChange,
  onEditClick,
  onDeleteClick,
  onUpdateNotes,
  onUpdateDateApplied,
}: JobDetailModalProps) => {
  const [notes, setNotes] = useState('');
  const [dateApplied, setDateApplied] = useState<string>('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isSavingDate, setIsSavingDate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const dragControls = useDragControls();

  // Prevent background layer from moving/scrolling on mobile while modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (job) {
      setNotes(job.notes || '');
      setDateApplied(job.dateApplied || '');
      setShowDeleteConfirm(false);
    }
  }, [job]);

  const statusMeta = job ? getStatusMeta(job.status) : null;
  const StatusIcon = statusMeta?.icon;
  const history = job ? normalizeStatusHistory(job.statusHistory) : [];

  const handleNotesSave = async () => {
    if (!job) return;
    setIsSavingNotes(true);
    await onUpdateNotes(job.id, notes);
    setIsSavingNotes(false);
  };

  const handleDateSave = async () => {
    if (!job) return;
    setIsSavingDate(true);
    await onUpdateDateApplied(job.id, dateApplied.trim() || null);
    setIsSavingDate(false);
  };

  const companyFacts = companyFactsForDisplay(job?.companyMetadata);

  return (
    <AnimatePresence>
      {isOpen && job && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs cursor-pointer touch-none"
            onClick={onClose}
          />

          {/* Bottom Sheet on Mobile / Centered Card on Desktop */}
          <motion.div
            initial={{ y: '100%', opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 90 || info.velocity.y > 350) {
                onClose();
              }
            }}
            className="relative bg-white rounded-t-3xl sm:rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[90dvh] sm:max-h-[92vh] flex flex-col pb-[env(safe-area-inset-bottom)] z-10"
          >
            {/* Mobile Drag Handle */}
            <div
              className="sm:hidden pt-3 pb-2.5 px-6 flex justify-center bg-slate-50 border-b border-slate-100 cursor-grab active:cursor-grabbing touch-none select-none"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-12 h-1.5 bg-slate-300 hover:bg-slate-400 rounded-full transition-colors" />
            </div>

            {/* Header */}
            <div
              className="shrink-0 px-4 pt-3 pb-3 sm:px-6 sm:pt-5 sm:pb-5 border-b border-slate-200 bg-slate-50 space-y-2.5"
              onPointerDown={(e) => {
                const target = e.target as HTMLElement;
                if (!target.closest('button, select, input, a, textarea')) {
                  dragControls.start(e);
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <CompanyLogo
                    company={job.company}
                    url={job.url}
                    size="lg"
                    className="!w-9 !h-9 sm:!w-11 sm:!h-11 text-xs sm:text-sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-base sm:text-xl font-bold text-slate-900 leading-snug break-words">
                      {job.company}
                    </p>
                    <p className="text-sm sm:text-base font-semibold text-slate-700 leading-snug break-words mt-0.5">
                      {job.jobTitle}
                      {job.team && (
                        <span className="text-indigo-600 font-medium ml-1">({job.team})</span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 -mr-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {StatusIcon && statusMeta && (
                  <div className="relative">
                    <StatusIcon
                      className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${statusMeta.iconClass}`}
                    />
                    <select
                      aria-label="Job status selector"
                      value={job.status}
                      onChange={(e) => onStatusChange(job.id, e.target.value as JobStatus)}
                      className={`pl-7 pr-2 py-1.5 sm:px-3 sm:pl-8 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${statusMeta.badge}`}
                    >
                      {STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <span className="flex items-center gap-1 text-xs text-slate-500 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">{job.location}</span>
                </span>
                {job.dateApplied && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    Applied {job.dateApplied}
                  </span>
                )}
                {job.extractedVia && (
                  <span className="text-xs text-indigo-600 font-medium truncate max-w-[12rem] sm:max-w-none">
                    via {job.extractedVia}
                  </span>
                )}
                {needsManualReview(job.extractedVia) && (
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                    title="The posting page could not be read automatically, so unknown fields were left as Unknown. Open the posting to check the details."
                  >
                    Needs review
                  </span>
                )}
              </div>
            </div>

            {/* Content — min-h-0 for nested flex scroll */}
            <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto overscroll-contain flex-1 min-h-0">
              {/* Key Metrics Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Banknote className="w-3.5 h-3.5 text-indigo-500" />
                    Compensation
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{job.salary}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Factory className="w-3.5 h-3.5 text-indigo-500" />
                    Industry Sector
                  </div>
                  <div className="text-sm font-semibold text-indigo-700 mt-0.5">{job.industry}</div>
                </div>
              </div>

              {/* Dates & Timeline info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Date Applied</span>
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      aria-label="Date applied"
                      value={dateApplied}
                      onChange={(e) => setDateApplied(e.target.value)}
                      className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleDateSave}
                      disabled={isSavingDate || dateApplied === (job.dateApplied || '')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" />
                      <span>{isSavingDate ? 'Saving…' : 'Save'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    Date Added
                  </div>
                  <div className="text-xs font-semibold text-slate-800 mt-1">
                    {job.dateAdded || job.createdAt?.split('T')[0] || 'Unknown'}
                  </div>
                </div>
              </div>

              {/* Status Changelog Timeline */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-indigo-600" />
                  <span>Status Change Log</span>
                </h4>
                {history.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-slate-50 border border-slate-200 rounded-xl p-3">
                    No status changes recorded yet. Updates appear here as you move this job through the pipeline.
                  </p>
                ) : (
                  <ol className="space-y-2 border border-slate-200 rounded-xl bg-slate-50/80 p-3">
                    {[...history].reverse().map((entry, idx) => {
                      const toMeta = getStatusMeta(entry.to);
                      const ToIcon = toMeta.icon;
                      return (
                        <li
                          key={`${entry.at}-${entry.to}-${idx}`}
                          className="flex items-start gap-2.5 text-xs"
                        >
                          <div className={`mt-0.5 p-1 rounded-md border ${toMeta.chipBg}`}>
                            <ToIcon className={`w-3.5 h-3.5 ${toMeta.iconClass}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-800">
                              {entry.from ? (
                                <>
                                  <span className="text-slate-500">{entry.from}</span>
                                  <span className="text-slate-400 mx-1">→</span>
                                  <span className="text-indigo-700">{entry.to}</span>
                                </>
                              ) : (
                                <>
                                  Created as <span className="text-indigo-700">{entry.to}</span>
                                </>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{formatHistoryTime(entry.at)}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              {/* Job Description Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Job Description Summary</span>
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed bg-indigo-50/30 p-3.5 rounded-xl border border-indigo-100 whitespace-pre-wrap">
                  {job.summary || 'No summary extracted.'}
                </p>
              </div>

              {/* Company Intelligence */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-indigo-500" />
                  <span>Company Intelligence</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Headcount:</span>
                    <span className="font-semibold text-slate-800">{companyFacts.headcount}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Headquarters:</span>
                    <span className="font-semibold text-slate-800">{companyFacts.headquarters}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Ownership:</span>
                    <span className="font-semibold text-slate-800">{companyFacts.ownership}</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Founding Year:</span>
                    <span className="font-semibold text-slate-800">{companyFacts.foundingYear}</span>
                  </div>
                </div>
              </div>

              {/* Position Intelligence & Skills */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-indigo-500" />
                  <span>Position Attributes & Tech Stack</span>
                </h4>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center gap-4 text-slate-700">
                    <div>
                      <span className="text-slate-400 mr-1">Seniority:</span>
                      <span className="font-semibold text-slate-900">{job.positionMetadata?.seniority || 'Unknown'}</span>
                    </div>
                    {job.team && (
                      <div>
                        <span className="text-slate-400 mr-1">Team:</span>
                        <span className="font-semibold text-indigo-700">{job.team}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400 mr-1">Department:</span>
                      <span className="font-semibold text-slate-900">{job.positionMetadata?.department || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 mr-1">Type:</span>
                      <span className="font-semibold text-slate-900">{job.positionMetadata?.employmentType || 'Unknown'}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-1.5 font-medium text-[11px]">Required Skills & Technologies:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {job.positionMetadata?.requiredSkills?.map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-white border border-indigo-200 text-indigo-800 rounded-md text-xs font-medium shadow-2xs"
                        >
                          {skill}
                        </span>
                      ))}
                      {(!job.positionMetadata?.requiredSkills || job.positionMetadata.requiredSkills.length === 0) && (
                        <span className="text-slate-400 italic">None specified</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* User Notes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    Personal Application Notes
                  </h4>
                  <button
                    type="button"
                    onClick={handleNotesSave}
                    disabled={isSavingNotes}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingNotes ? 'Saving...' : 'Save Notes'}</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record interviewer names, discussion points, follow-up timeline..."
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              {/* Original Link */}
              {job.url && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
                  <span className="text-slate-500 shrink-0">Original Listing:</span>
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium underline truncate"
                  >
                    <span className="truncate">{(() => { try { return new URL(job.url).hostname; } catch { return job.url; } })()}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <div>
                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Delete Record</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-700 font-medium">Confirm?</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeleteClick(job.id);
                        onClose();
                      }}
                      className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors cursor-pointer"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 rounded-md transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditClick(job);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

