import { useState, useRef } from 'react';
import {
  ExternalLink,
  Eye,
  Edit2,
  Trash2,
  Clock,
  RotateCcw,
  Cloud,
  Building2,
  MapPin,
  Check,
} from 'lucide-react';
import { JobRecord, JobStatus } from '../../types';
import { CompanyLogo } from '../CompanyLogo';
import { getStatusMeta, STATUS_ORDER } from '../../lib/statusMeta';
import {
  getWorkArrangementMeta,
  getCleanCityLocation,
  formatMicroSalary,
  getCompactTimeline,
  getStatusDotColor,
} from '../../lib/formatHelpers';
import { PortalDropdown } from '../PortalDropdown';

interface MobileJobCardProps {
  job: JobRecord;
  onSelectJob: (job: JobRecord) => void;
  onEditJob: (job: JobRecord) => void;
  onDeleteJob: (id: string) => Promise<void>;
  onStatusChange: (id: string, newStatus: JobStatus) => Promise<void>;
  openActionRowId: string | null;
  onOpenActions: (id: string) => void;
  onCloseActions: () => void;
  confirmDeleteId: string | null;
  onSetConfirmDeleteId: (id: string | null) => void;
}

export const MobileJobCard = ({
  job,
  onSelectJob,
  onEditJob,
  onDeleteJob,
  onStatusChange,
  confirmDeleteId,
  onSetConfirmDeleteId,
}: MobileJobCardProps) => {
  const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);
  const statusBtnRef = useRef<HTMLButtonElement>(null);

  const statusMeta = getStatusMeta(job.status);
  const StatusIcon = statusMeta.icon;
  const locMeta = getWorkArrangementMeta(job.location, job.positionMetadata);
  const cleanCity = getCleanCityLocation(job.location);
  const microSalary = formatMicroSalary(job.salary, job.salaryMin, job.salaryMax, true);
  const timeline = getCompactTimeline(job);
  const historyCount = job.statusHistory ? job.statusHistory.length : 0;

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

  return (
    <div className="p-3.5 bg-white hover:bg-slate-50/70 transition-colors border-b border-slate-100 flex flex-col gap-2.5">
      {/* Top Header: Logo, Company on top, Role + Team below, and Status Icon on Right */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <CompanyLogo company={job.company} url={job.url} size="sm" />
          <div className="min-w-0 flex-1">
            {/* Company name on top and more prominent */}
            <div className="flex items-center gap-1.5 min-w-0 leading-snug">
              <button
                type="button"
                onClick={() => onSelectJob(job)}
                className="text-left font-bold text-slate-900 text-sm hover:text-indigo-600 transition-colors cursor-pointer truncate"
              >
                {job.company}
              </button>
            </div>
            {/* Role + Team below: less prominent and same font size with no delimiter */}
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 text-xs text-slate-500 mt-0.5 leading-none">
              <button
                type="button"
                onClick={() => onSelectJob(job)}
                className="text-left text-xs font-normal text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer truncate"
              >
                {job.jobTitle}
              </button>
              {job.team && (
                <span className="text-xs font-normal text-slate-400 whitespace-nowrap">
                  {job.team}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status Icon Button (Clean icon, no bubble pill) */}
        <div className="relative shrink-0">
          <button
            ref={statusBtnRef}
            type="button"
            onClick={() => setIsStatusPickerOpen(!isStatusPickerOpen)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors inline-flex items-center justify-center cursor-pointer select-none"
            title={`Status: ${job.status} (tap to change)`}
          >
            {StatusIcon && <StatusIcon className={`w-4 h-4 ${statusMeta.iconClass}`} />}
          </button>

          {/* Portal-rendered Status Picker */}
          <PortalDropdown
            isOpen={isStatusPickerOpen}
            onClose={() => setIsStatusPickerOpen(false)}
            triggerRef={statusBtnRef}
            align="right"
            className="w-44 py-1"
          >
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
              Update Status
            </div>
            {STATUS_ORDER.map((status) => {
              const isCurrent = job.status === status;
              const meta = getStatusMeta(status);
              const ItemIcon = meta.icon;
              const dotColor = getStatusDotColor(status);

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
        </div>
      </div>

      {/* Middle Row: Meta details (Location, Salary, Timeline) */}
      <div className="flex items-center justify-between flex-wrap gap-y-1 text-xs text-slate-600 pt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <ArrangementIcon className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
            <span className="font-medium text-slate-800">{locMeta.label}</span>
            {cleanCity && (
              <span className="text-slate-400 text-[11px] truncate max-w-[110px]">
                • {cleanCity}
              </span>
            )}
          </div>

          <span className="text-slate-300">•</span>

          <div className="flex items-center gap-0.5">
            <span
              className={
                microSalary.isReal
                  ? 'text-slate-800 font-semibold'
                  : 'text-slate-400 italic font-normal'
              }
            >
              {microSalary.text}
            </span>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          {historyCount > 1 && (
            <span
              className="flex items-center gap-0.5 text-indigo-600 font-medium"
              title={`${historyCount} status changes logged`}
            >
              <RotateCcw className="w-3 h-3 text-indigo-500 shrink-0" />
              <span>{historyCount}</span>
            </span>
          )}
          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
          <span>{timeline.ageText}</span>
        </div>
      </div>

      {/* Bottom Row: Direct Action Buttons with touch targets */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer noopener"
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50/50 rounded-lg border border-slate-200 inline-flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="w-3 h-3 text-slate-400" />
              <span>Link</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => onSelectJob(job)}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50/50 rounded-lg border border-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Eye className="w-3 h-3 text-slate-400" />
            <span>Details</span>
          </button>
          <button
            type="button"
            onClick={() => onEditJob(job)}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50/50 rounded-lg border border-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Edit2 className="w-3 h-3 text-slate-400" />
            <span>Edit</span>
          </button>
        </div>

        {/* Delete button or Confirm Delete */}
        <div>
          {confirmDeleteId === job.id ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onDeleteJob(job.id)}
                className="px-2 py-1 text-xs font-bold text-white bg-rose-600 rounded-lg cursor-pointer"
              >
                Delete?
              </button>
              <button
                type="button"
                onClick={() => onSetConfirmDeleteId(null)}
                className="px-2 py-1 text-xs text-slate-600 bg-slate-100 rounded-lg cursor-pointer"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onSetConfirmDeleteId(job.id)}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer inline-flex items-center"
              title="Delete job"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
