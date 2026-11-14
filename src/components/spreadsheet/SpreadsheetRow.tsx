import { useRef, useState } from 'react';
import {
  ExternalLink,
  Eye,
  Edit2,
  Trash2,
  Clock,
  MapPin,
  Building2,
  Cloud,
  MoreVertical,
  Check,
  RotateCcw,
  Copy,
} from 'lucide-react';
import { motion } from 'motion/react';
import { JobRecord, JobStatus } from '../../types';
import {
  formatMicroSalary,
  getCompactTimeline,
  getCleanCityLocation,
  getWorkArrangementMeta,
} from '../../lib/formatHelpers';
import { STATUS_ORDER, getStatusMeta } from '../../lib/statusMeta';
import { CompanyLogo } from '../CompanyLogo';
import { PortalDropdown } from '../PortalDropdown';

interface SpreadsheetRowProps {
  job: JobRecord;
  viewMode: 'full' | 'compact';
  onSelectJob: (job: JobRecord) => void;
  onEditJob: (job: JobRecord) => void;
  onDeleteJob: (id: string) => void;
  onStatusChange: (id: string, newStatus: JobStatus) => void;
  openActionRowId: string | null;
  onOpenActions: (id: string) => void;
  onCloseActions: () => void;
  confirmDeleteId: string | null;
  onSetConfirmDeleteId: (id: string | null) => void;
}

export const SpreadsheetRow = ({
  job,
  viewMode,
  onSelectJob,
  onEditJob,
  onDeleteJob,
  onStatusChange,
  openActionRowId,
  onOpenActions,
  onCloseActions,
  confirmDeleteId,
  onSetConfirmDeleteId,
}: SpreadsheetRowProps) => {
  const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const actionBtnRef = useRef<HTMLButtonElement>(null);

  const isCompact = viewMode === 'compact';
  const statusMeta = getStatusMeta(job.status);
  const StatusIcon = statusMeta.icon;
  const isActionOpen = openActionRowId === job.id;

  const renderLocation = (compact = false) => {
    const locMeta = getWorkArrangementMeta(job.location, job.positionMetadata);
    const cleanCity = getCleanCityLocation(job.location);

    const ArrangementIcon =
      locMeta.type === 'Remote'
        ? Cloud
        : locMeta.type === 'Hybrid'
        ? Building2
        : MapPin;

    const iconColor =
      locMeta.type === 'Remote'
        ? 'text-indigo-500'
        : locMeta.type === 'Hybrid'
        ? 'text-amber-500'
        : 'text-slate-400';

    if (compact) {
      return (
        <div className="flex items-center gap-1 text-xs truncate" title={`${locMeta.label}${cleanCity ? ` • ${cleanCity}` : ''}`}>
          <ArrangementIcon className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
          <span className="text-slate-800 font-medium truncate">{locMeta.label}</span>
          {cleanCity && (
            <span className="text-slate-400 text-[11px] truncate">
              • {cleanCity}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-xs">
          <ArrangementIcon className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
          <span className="text-slate-800 font-medium">{locMeta.label}</span>
          {cleanCity && (
            <span
              className="text-xs text-slate-700 font-medium truncate max-w-[130px]"
              title={cleanCity}
            >
              • {cleanCity}
            </span>
          )}
        </div>
        {job.location && (
          <div className="text-[11px] text-slate-500 truncate max-w-[160px]" title={job.location}>
            {job.location}
          </div>
        )}
      </div>
    );
  };

  const renderSalary = () => {
    const micro = formatMicroSalary(job.salary, job.salaryMin, job.salaryMax, isCompact);
    if (!micro.isReal) {
      return <span className="text-slate-400 italic text-xs truncate block">{micro.text}</span>;
    }
    return (
      <span className="font-semibold text-slate-800 text-xs tracking-tight truncate block" title={micro.text}>
        {micro.text}
      </span>
    );
  };

  const renderTimeline = () => {
    const timeline = getCompactTimeline(job);
    const historyCount = job.statusHistory ? job.statusHistory.length : 0;

    return (
      <div className="flex items-center gap-1 text-xs truncate" title={timeline.ageText}>
        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="font-medium text-slate-800 truncate">{timeline.ageText}</span>
        {historyCount > 1 && (
          <span
            className="inline-flex items-center gap-0.5 text-indigo-600 font-medium text-[11px] shrink-0"
            title={`${historyCount} status transitions logged`}
          >
            <RotateCcw className="w-3 h-3 text-indigo-500 shrink-0" />
            <span>{historyCount}</span>
          </span>
        )}
      </div>
    );
  };

  const handleCopyUrl = () => {
    if (job.url) {
      navigator.clipboard.writeText(job.url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    const target = e.target as HTMLElement;
    // Don't trigger if clicked on an action button, anchor, input, or inside a portal dropdown
    if (target.closest('button, a, input, select, textarea, [data-portal-dropdown]')) {
      return;
    }
    onSelectJob(job);
  };

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.12 }}
      onClick={handleRowClick}
      className="group hover:bg-slate-50/80 transition-colors border-b border-slate-100 cursor-pointer"
    >
      {/* Col 0: Status Icon Only (Clean icon, no text or bubble format) */}
      <td className={`py-2.5 whitespace-nowrap text-center ${isCompact ? 'w-9 px-1' : 'w-[44px] px-2'}`}>
        <button
          ref={statusBtnRef}
          type="button"
          onClick={() => setIsStatusPickerOpen(!isStatusPickerOpen)}
          className="p-1 rounded-md hover:bg-slate-100 transition-colors inline-flex items-center justify-center cursor-pointer select-none"
          title={`Status: ${job.status} (click to change)`}
          aria-label={`Change status for ${job.company}`}
        >
          {StatusIcon && <StatusIcon className={`w-4 h-4 ${statusMeta.iconClass}`} />}
        </button>

        {/* Portal-rendered Status Picker */}
        <PortalDropdown
          isOpen={isStatusPickerOpen}
          onClose={() => setIsStatusPickerOpen(false)}
          triggerRef={statusBtnRef}
          align="left"
          className="w-44 py-1"
        >
          <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
            Update Status
          </div>
          {STATUS_ORDER.map((status) => {
            const isCurrent = job.status === status;
            const meta = getStatusMeta(status);
            const ItemIcon = meta.icon;

            return (
              <button
                key={status}
                type="button"
                onClick={() => {
                  onStatusChange(job.id, status);
                  setIsStatusPickerOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                  isCurrent ? 'bg-indigo-50/70 font-bold text-indigo-700' : 'text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ItemIcon className={`w-3.5 h-3.5 ${meta.iconClass}`} />
                  <span>{status}</span>
                </div>
                {isCurrent && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </button>
            );
          })}
        </PortalDropdown>
      </td>

      {/* Role & Company */}
      {!isCompact ? (
        <>
          <td className="px-3 py-2.5 whitespace-nowrap min-w-[140px]">
            <div className="flex items-center gap-2">
              <CompanyLogo company={job.company} url={job.url} size="sm" />
              <button
                type="button"
                onClick={() => onSelectJob(job)}
                className="text-left font-bold text-slate-900 text-xs hover:text-indigo-600 transition-colors cursor-pointer truncate max-w-[130px]"
                title={job.company}
              >
                {job.company}
              </button>
            </div>
          </td>
          <td className="px-3 py-2.5 whitespace-nowrap min-w-[160px]">
            <div className="flex items-center gap-1.5 min-w-0 text-xs">
              <button
                type="button"
                onClick={() => onSelectJob(job)}
                className="text-left text-xs font-normal text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer truncate shrink min-w-0"
                title={job.jobTitle}
              >
                {job.jobTitle}
              </button>
              {job.team && (
                <span
                  className="text-xs font-normal text-slate-400 truncate shrink min-w-0"
                  title={job.team}
                >
                  {job.team}
                </span>
              )}
            </div>
          </td>
        </>
      ) : (
        /* Compact Mode: Company on top, Role & Team below */
        <td className="px-2 sm:px-3 py-2.5 w-[44%] truncate">
          <div className="flex items-center gap-2 min-w-0">
            <CompanyLogo company={job.company} url={job.url} size="sm" />
            <div className="min-w-0 flex-1 truncate">
              {/* Company name on top and more prominent */}
              <div className="flex items-center gap-1.5 min-w-0 leading-tight">
                <button
                  type="button"
                  onClick={() => onSelectJob(job)}
                  className="text-left font-bold text-slate-900 text-xs sm:text-sm hover:text-indigo-600 transition-colors cursor-pointer truncate"
                  title={job.company}
                >
                  {job.company}
                </button>
              </div>
              {/* Role + Team below: less prominent and same font size with no delimiter */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 leading-none min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectJob(job)}
                  className="text-left text-xs font-normal text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer truncate shrink min-w-0"
                  title={job.jobTitle}
                >
                  {job.jobTitle}
                </button>
                {job.team && (
                  <span
                    className="text-xs font-normal text-slate-400 truncate shrink min-w-0"
                    title={job.team}
                  >
                    {job.team}
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>
      )}

      {/* Location */}
      <td className={`py-2.5 truncate ${isCompact ? 'px-2 w-[20%]' : 'px-3 whitespace-nowrap min-w-[110px]'}`}>
        {renderLocation(isCompact)}
      </td>

      {/* Salary */}
      <td className={`py-2.5 truncate ${isCompact ? 'px-2 w-[13%]' : 'px-3 whitespace-nowrap min-w-[100px]'}`}>
        {renderSalary()}
      </td>

      {/* Timeline */}
      <td className={`py-2.5 truncate ${isCompact ? 'px-2 w-[13%]' : 'px-3 whitespace-nowrap min-w-[110px]'}`}>
        {renderTimeline()}
      </td>

      {/* Full Mode: Industry & Summary */}
      {!isCompact && (
        <>
          <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600 min-w-[120px]">
            {job.industry || <span className="text-slate-300">—</span>}
          </td>
          <td className="px-3 py-2.5 text-xs text-slate-600 min-w-[220px]">
            <p className="line-clamp-1 text-slate-600 truncate max-w-xs" title={job.summary}>
              {job.summary || <span className="text-slate-300">—</span>}
            </p>
          </td>
        </>
      )}

      {/* Col: Actions */}
      <td className={`py-2.5 text-right whitespace-nowrap ${isCompact ? 'w-16 px-1' : 'w-[76px] px-2'}`}>
        <div className="flex items-center justify-end gap-1">
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer noopener"
              title="Open original job posting"
              className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors inline-flex items-center justify-center cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <button
            type="button"
            onClick={() => onEditJob(job)}
            title="Edit attributes"
            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors inline-flex items-center justify-center cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>

          <button
            ref={actionBtnRef}
            type="button"
            onClick={() => {
              if (isActionOpen) onCloseActions();
              else onOpenActions(job.id);
            }}
            aria-label="More row options"
            className={`p-1 rounded-md transition-colors inline-flex items-center justify-center cursor-pointer ${
              isActionOpen
                ? 'text-indigo-600 bg-indigo-50'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action Menu Portal */}
        <PortalDropdown
          isOpen={isActionOpen}
          onClose={onCloseActions}
          triggerRef={actionBtnRef}
          align="right"
          className="w-44 py-1"
        >
          {job.url && (
            <button
              type="button"
              onClick={() => {
                handleCopyUrl();
                onCloseActions();
              }}
              className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>{copiedUrl ? 'Copied URL' : 'Copy Link'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onSelectJob(job);
              onCloseActions();
            }}
            className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span>Inspect Details</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onEditJob(job);
              onCloseActions();
            }}
            className="w-full px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Edit Fields</span>
          </button>

          <div className="border-t border-slate-100 my-1" />

          {confirmDeleteId === job.id ? (
            <div className="px-3 py-1.5 space-y-1 bg-rose-50">
              <p className="text-[11px] font-semibold text-rose-700">Delete this posting?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteJob(job.id);
                    onCloseActions();
                  }}
                  className="px-2 py-0.5 text-xs bg-rose-600 text-white font-medium rounded hover:bg-rose-700 cursor-pointer"
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={() => onSetConfirmDeleteId(null)}
                  className="px-2 py-0.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onSetConfirmDeleteId(job.id)}
              className="w-full px-3 py-1.5 text-xs text-left text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Delete Job</span>
            </button>
          )}
        </PortalDropdown>
      </td>
    </motion.tr>
  );
};
