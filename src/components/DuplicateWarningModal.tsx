import { useState, useId } from 'react';
import {
  AlertTriangle,
  X,
  Building2,
  Briefcase,
  Calendar,
  MapPin,
  DollarSign,
  ExternalLink,
  Check,
  ChevronRight,
  Eye,
  ShieldAlert,
} from 'lucide-react';
import type { JobRecord, DuplicateMatch } from '../types';
import { getStatusMeta } from '../lib/statusMeta';
import { CompanyLogo } from './CompanyLogo';
import { Modal } from './Modal';

interface DuplicateWarningModalProps {
  isOpen: boolean;
  candidateJob: JobRecord | null;
  duplicates: DuplicateMatch[];
  isSubmitting?: boolean;
  onContinue: (candidate: JobRecord) => Promise<void> | void;
  onCancel: () => void;
  onViewExisting?: (job: JobRecord) => void;
}

export const DuplicateWarningModal = ({
  isOpen,
  candidateJob,
  duplicates,
  isSubmitting = false,
  onContinue,
  onCancel,
  onViewExisting,
}: DuplicateWarningModalProps) => {
  const [selectedMatchIdx, setSelectedMatchIdx] = useState(0);
  const headingId = useId();

  if (!isOpen || !candidateJob || duplicates.length === 0) return null;

  const currentMatch = duplicates[selectedMatchIdx] || duplicates[0];
  const existingJob = currentMatch.existingJob;

  const candidateStatusMeta = getStatusMeta(candidateJob.status);
  const existingStatusMeta = getStatusMeta(existingJob.status);

  const isCompanyMatched = currentMatch.matchedFields.includes('company');
  const isRoleMatched = currentMatch.matchedFields.includes('role');

  const matchTypeLabel =
    currentMatch.matchType === 'both'
      ? 'Duplicate Company & Role'
      : currentMatch.matchType === 'company'
      ? 'Duplicate Company'
      : 'Duplicate Role';

  return (
    <Modal
      labelledBy={headingId}
      onBackdropClick={() => !isSubmitting && onCancel()}
      layer="stacked"
      role="alertdialog"
      panelClassName="w-full max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-amber-200 overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[92vh] sm:my-auto pb-[env(safe-area-inset-bottom)]"
    >
      {/* Header with High-Visibility Warning Banner */}
      <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-amber-50 via-orange-50/70 to-amber-50 border-b border-amber-200/80 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id={headingId} className="text-base sm:text-lg font-bold text-slate-900">
                Potential Duplicate Application
              </h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                {matchTypeLabel}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              You applied to this company during the past 6 months. Review the comparison below before continuing.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-amber-100/60 transition-colors shrink-0"
          aria-label="Close duplicate warning"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Multi-match Selector (if more than 1 duplicate found) */}
      {duplicates.length > 1 && (
        <div className="px-5 sm:px-6 py-2.5 bg-amber-50/40 border-b border-amber-100 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="font-semibold text-slate-700 shrink-0">
            Matches ({duplicates.length}):
          </span>
          <div className="flex items-center gap-1.5">
            {duplicates.map((match, idx) => (
              <button
                key={match.existingJob.id}
                type="button"
                onClick={() => setSelectedMatchIdx(idx)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                  selectedMatchIdx === idx
                    ? 'bg-amber-500 text-white shadow-xs font-semibold'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-amber-300'
                }`}
              >
                <span>{match.existingJob.company}</span>
                <span className="opacity-75">· {match.timeAgoLabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal Scrollable Body */}
      <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
        {/* Reason Callout */}
        <div className="p-3 sm:p-3.5 bg-amber-50/80 border border-amber-200/90 rounded-xl flex items-center gap-2.5 text-xs text-amber-900">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Flagged Match: </span>
            <span>{currentMatch.reason}</span>
          </div>
          {onViewExisting && (
            <button
              type="button"
              onClick={() => onViewExisting(existingJob)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 hover:text-amber-950 underline shrink-0 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>View in tracker</span>
            </button>
          )}
        </div>

        {/* Side-by-Side Short Comparison View */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Candidate / New Entry Column */}
          <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/20 p-4 space-y-3.5 relative">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                New Entry (To Add)
              </span>
              <span className="text-[11px] font-medium text-slate-500">Candidate</span>
            </div>

            {/* Company */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block uppercase">Company</span>
              <div className="flex items-center gap-2 mt-0.5">
                <CompanyLogo company={candidateJob.company} size="sm" />
                <span className="text-sm font-bold text-slate-900">{candidateJob.company}</span>
                {isCompanyMatched && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    Company Match
                  </span>
                )}
              </div>
            </div>

            {/* Role */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block uppercase">Job Title / Role</span>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-sm font-semibold text-slate-900">{candidateJob.jobTitle}</span>
                {isRoleMatched && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    Role Match
                  </span>
                )}
              </div>
              {candidateJob.team && (
                <span className="text-xs text-slate-500 block mt-0.5">Team: {candidateJob.team}</span>
              )}
            </div>

            {/* Status */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block uppercase">Target Status</span>
              <div className="mt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${candidateStatusMeta.badge}`}
                >
                  <candidateStatusMeta.icon className={`w-3 h-3 ${candidateStatusMeta.iconClass}`} />
                  <span>{candidateJob.status}</span>
                </span>
              </div>
            </div>

            {/* Date Applied */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block uppercase">Date Applied</span>
              <div className="flex items-center gap-1.5 text-xs text-slate-800 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{candidateJob.dateApplied || 'Today (Newly created)'}</span>
              </div>
            </div>

            {/* Location & Salary */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-indigo-100/70 text-xs text-slate-700">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block uppercase">Location</span>
                <span className="truncate block mt-0.5">{candidateJob.location || 'Remote'}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block uppercase">Salary</span>
                <span className="truncate block mt-0.5 font-medium">{candidateJob.salary || 'Not listed'}</span>
              </div>
            </div>

            {/* URL */}
            {candidateJob.url && (
              <div className="text-xs pt-1 truncate">
                <a
                  href={candidateJob.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-[11px] font-medium truncate max-w-full"
                >
                  <span className="truncate">{candidateJob.url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            )}
          </div>

          {/* Existing Application Column */}
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50/20 p-4 space-y-3.5 relative">
            <div className="flex items-center justify-between pb-2 border-b border-amber-200">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Existing In Tracker
              </span>
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-200">
                Applied {currentMatch.timeAgoLabel}
              </span>
            </div>

            {/* Company */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block uppercase">Company</span>
              <div className="flex items-center gap-2 mt-0.5">
                <CompanyLogo company={existingJob.company} size="sm" />
                <span className="text-sm font-bold text-slate-900">{existingJob.company}</span>
                {isCompanyMatched && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200/90 text-amber-900 border border-amber-300">
                    Matched
                  </span>
                )}
              </div>
            </div>

            {/* Role */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block uppercase">Job Title / Role</span>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-sm font-semibold text-slate-900">{existingJob.jobTitle}</span>
                {isRoleMatched && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200/90 text-amber-900 border border-amber-300">
                    Matched
                  </span>
                )}
              </div>
              {existingJob.team && (
                <span className="text-xs text-slate-500 block mt-0.5">Team: {existingJob.team}</span>
              )}
            </div>

            {/* Status */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block uppercase">Current Status</span>
              <div className="mt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${existingStatusMeta.badge}`}
                >
                  <existingStatusMeta.icon className={`w-3 h-3 ${existingStatusMeta.iconClass}`} />
                  <span>{existingJob.status}</span>
                </span>
              </div>
            </div>

            {/* Date Applied */}
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block uppercase">Date Applied</span>
              <div className="flex items-center gap-1.5 text-xs text-slate-800 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-amber-950">
                  {currentMatch.appliedDateStr}
                </span>
                <span className="text-slate-500 font-normal">({currentMatch.timeAgoLabel})</span>
              </div>
            </div>

            {/* Location & Salary */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-200/60 text-xs text-slate-700">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block uppercase">Location</span>
                <span className="truncate block mt-0.5">{existingJob.location || 'Remote'}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block uppercase">Salary</span>
                <span className="truncate block mt-0.5 font-medium">{existingJob.salary || 'Not listed'}</span>
              </div>
            </div>

            {/* URL */}
            {existingJob.url && (
              <div className="text-xs pt-1 truncate">
                <a
                  href={existingJob.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 text-[11px] font-medium truncate max-w-full"
                >
                  <span className="truncate">{existingJob.url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer: Confirmation Question & Action Buttons */}
      <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-slate-700 font-medium text-center sm:text-left">
          <span>Do you want to continue adding this application anyway?</span>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onContinue(candidateJob)}
            disabled={isSubmitting}
            className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs hover:shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add application anyway</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
