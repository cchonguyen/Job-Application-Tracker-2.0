import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Filter,
  FileSpreadsheet,
  FileCode,
  ArrowUpDown,
  ExternalLink,
  Info,
  Edit2,
  Trash2,
  MapPin,
  TableProperties,
  LayoutGrid,
  Settings,
  ChevronDown,
  MoreVertical,
  Upload,
  Loader2,
  Inbox,
  Building2,
  Briefcase,
  DollarSign,
  History,
  Cloud,
  Clock,
} from 'lucide-react';
import { JobRecord, JobStatus } from '../types';
import { exportJobsToCsv, exportJobsToJson } from '../utils/export';
import { parseJobsImportFile } from '../utils/import';
import { CompanyLogo } from './CompanyLogo';
import {
  getStatusMeta,
  STATUS_ORDER,
  DEFAULT_VISIBLE_STATUSES,
  STATUS_TIER_RANK,
} from '../lib/statusMeta';
import {
  getWorkArrangementMeta,
  getCleanCityLocation,
  formatMicroSalary,
  getStatusBorderAccent,
  getCompactTimeline,
  getStatusDurationMs,
  getJobAgeTimestampMs,
} from '../lib/formatHelpers';

interface JobSpreadsheetProps {
  jobs: JobRecord[];
  onStatusChange: (id: string, newStatus: JobStatus) => Promise<void>;
  onSelectJob: (job: JobRecord) => void;
  onEditJob: (job: JobRecord) => void;
  onDeleteJob: (id: string) => Promise<void>;
  onImportJobs: (jobs: JobRecord[]) => Promise<void>;
  isImporting?: boolean;
}

type SortField = 'dateApplied' | 'company' | 'jobTitle' | 'salary';
type SortOrder = 'asc' | 'desc';

export const JobSpreadsheet = ({
  jobs,
  onStatusChange,
  onSelectJob,
  onEditJob,
  onDeleteJob,
  onImportJobs,
  isImporting = false,
}: JobSpreadsheetProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<JobStatus>>(
    () => new Set(DEFAULT_VISIBLE_STATUSES)
  );
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'full' | 'compact'>('compact');
  const [sortField, setSortField] = useState<SortField>('dateApplied');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [isActionsDropdownOpen, setIsActionsDropdownOpen] = useState(false);
  const [openActionRowId, setOpenActionRowId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeRowActions = () => {
    setOpenActionRowId(null);
    setConfirmDeleteId(null);
  };

  const handleToggleStatus = (status: JobStatus) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const handleSelectAllStatuses = () => {
    setSelectedStatuses(new Set(STATUS_ORDER));
  };

  const handleSelectNoneStatuses = () => {
    setSelectedStatuses(new Set());
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = parseJobsImportFile(file.name, text);
      await onImportJobs(parsed.jobs);
      setIsActionsDropdownOpen(false);
    } catch (err: any) {
      setImportError(err.message || 'Failed to import file');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const filteredAndSortedJobs = useMemo(() => {
    return jobs
      .filter((job) => {
        // Multi-select status filter
        if (!selectedStatuses.has(job.status)) {
          return false;
        }
        // Search query
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          job.company.toLowerCase().includes(q) ||
          job.jobTitle.toLowerCase().includes(q) ||
          (job.team && job.team.toLowerCase().includes(q)) ||
          job.location.toLowerCase().includes(q) ||
          job.industry.toLowerCase().includes(q) ||
          job.summary.toLowerCase().includes(q) ||
          (job.positionMetadata?.requiredSkills || []).some((s) => s.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        // 1. Primary order: Status Tier Ranking
        // Accepted -> Offer -> Interviewing -> Applied -> Saved -> Rejected -> Declined
        const rankA = STATUS_TIER_RANK[a.status] ?? 99;
        const rankB = STATUS_TIER_RANK[b.status] ?? 99;

        if (rankA !== rankB) {
          return rankA - rankB;
        }

        // Within same status tier, check if user specifically clicked a column header
        if (sortField === 'company') {
          const comp = a.company.localeCompare(b.company);
          if (comp !== 0) return sortOrder === 'asc' ? comp : -comp;
        } else if (sortField === 'jobTitle') {
          const comp = a.jobTitle.localeCompare(b.jobTitle);
          if (comp !== 0) return sortOrder === 'asc' ? comp : -comp;
        } else if (sortField === 'salary') {
          const salA = a.salaryMin ?? 0;
          const salB = b.salaryMin ?? 0;
          if (salA !== salB) return sortOrder === 'asc' ? salA - salB : salB - salA;
        }

        // 2. Ranking of least to highest amount since last status:
        // Smaller duration = more recently updated in status (least elapsed time)
        const durationA = getStatusDurationMs(a);
        const durationB = getStatusDurationMs(b);
        if (durationA !== durationB) {
          return durationA - durationB;
        }

        // 3. Ranking by youngest to oldest:
        // Youngest = highest creation/applied timestamp
        const ageTimeA = getJobAgeTimestampMs(a);
        const ageTimeB = getJobAgeTimestampMs(b);
        return ageTimeB - ageTimeA;
      });
  }, [jobs, searchQuery, selectedStatuses, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getRowHoverClass = (status: JobStatus) => {
    switch (status) {
      case 'Applied':
        return 'hover:bg-indigo-50/20';
      case 'Interviewing':
        return 'hover:bg-amber-50/20';
      case 'Offer':
        return 'hover:bg-emerald-50/20';
      case 'Accepted':
        return 'hover:bg-teal-50/15';
      case 'Rejected':
        return 'hover:bg-rose-50/15';
      case 'Declined':
        return 'hover:bg-stone-50/40';
      case 'Saved':
      default:
        return 'hover:bg-slate-50';
    }
  };

  const renderStatusSelect = (job: JobRecord) => {
    const meta = getStatusMeta(job.status);
    const Icon = meta.icon;
    return (
      <div className="relative inline-flex items-center group/status cursor-pointer">
        <div className="flex items-center gap-1.5 py-1 px-1.5 rounded-md hover:bg-slate-100 transition-colors">
          <Icon className={`w-3.5 h-3.5 ${meta.iconClass} shrink-0`} />
          <span className={`text-xs font-semibold ${meta.iconClass}`}>{meta.label}</span>
          <ChevronDown className="w-3 h-3 text-slate-300 group-hover/status:text-slate-500 transition-colors shrink-0" />
        </div>
        <select
          aria-label={`Update status for ${job.jobTitle} at ${job.company}`}
          value={job.status}
          onChange={(e) => onStatusChange(job.id, e.target.value as JobStatus)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-xs"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const renderCompactStatusIcon = (job: JobRecord) => {
    const meta = getStatusMeta(job.status);
    const Icon = meta.icon;
    return (
      <div
        className="relative inline-flex items-center group/status shrink-0"
        onClick={(e) => e.stopPropagation()}
        title={`Status: ${meta.label} (Click to change)`}
      >
        <div className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 transition-colors cursor-pointer">
          <Icon className={`w-4 h-4 ${meta.iconClass}`} />
        </div>
        <select
          aria-label={`Update status for ${job.jobTitle} at ${job.company}`}
          value={job.status}
          onChange={(e) => onStatusChange(job.id, e.target.value as JobStatus)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full text-[10px]"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const renderLocationElement = (job: JobRecord, isCompact: boolean = false) => {
    const wa = getWorkArrangementMeta(job.location, job.positionMetadata);
    const cleanCity = getCleanCityLocation(job.location);
    const icon =
      wa.type === 'Remote' ? (
        <Cloud className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
      ) : wa.type === 'Hybrid' ? (
        <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      ) : (
        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      );

    return (
      <div className={`flex items-center gap-1.5 ${isCompact ? 'text-[11px]' : 'text-xs'} text-slate-700 min-w-0 max-w-[140px] truncate`} title={job.location}>
        {icon}
        <span className="font-semibold shrink-0">{wa.label}</span>
        {cleanCity && wa.type !== 'Remote' && (
          <>
            <span className="text-slate-300 font-normal select-none shrink-0">•</span>
            <span className="text-slate-600 font-normal truncate max-w-[80px]">
              {cleanCity}
            </span>
          </>
        )}
      </div>
    );
  };

  const renderSalaryElement = (job: JobRecord, isCompact: boolean = false) => {
    const s = formatMicroSalary(job.salary, job.salaryMin, job.salaryMax, isCompact);
    return (
      <div
        className={`flex items-center gap-1 ${isCompact ? 'text-[11px]' : 'text-xs'} ${
          s.isReal ? 'font-semibold text-slate-700' : 'text-slate-400 italic font-normal'
        } whitespace-nowrap`}
      >
        <DollarSign className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>{s.text}</span>
      </div>
    );
  };

  const renderTimelineElement = (job: JobRecord, isCompact: boolean = false) => {
    const timeline = getCompactTimeline(job);
    return (
      <div className={`flex items-center gap-1.5 ${isCompact ? 'text-[11px]' : 'text-xs'} text-slate-500 font-mono whitespace-nowrap`}>
        {job.statusHistory && job.statusHistory.length > 1 && (
          <span
            className="inline-flex items-center gap-0.5 text-indigo-600 font-medium"
            title={`${job.statusHistory.length} status stages tracked`}
          >
            <History className="w-3 h-3 text-indigo-500 shrink-0" />
            <span>{job.statusHistory.length}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-slate-500" title={`Added: ${timeline.ageText}`}>
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{timeline.ageText}</span>
        </span>
        <span className="text-slate-300 select-none">•</span>
        <span className="font-medium text-slate-700" title={`Current status duration: ${timeline.stateDurationText}`}>
          {timeline.stateDurationText}
        </span>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Spreadsheet Control Bar */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-row items-center justify-between gap-3.5 flex-wrap">
        {/* Left: Search and Filters */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search box */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search company, title, location, skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Status Multi-Select Filter */}
          <div className="relative">
            <button
              id="status-multiselect-filter-button"
              type="button"
              aria-label="Filter jobs by status"
              onClick={() => setIsStatusFilterOpen(!isStatusFilterOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border shadow-2xs transition-colors cursor-pointer select-none ${
                selectedStatuses.size === STATUS_ORDER.length
                  ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : selectedStatuses.size === 0
                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                  : 'border-indigo-300 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100/60'
              }`}
            >
              <Filter className={`w-3.5 h-3.5 ${selectedStatuses.size < STATUS_ORDER.length ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>
                {selectedStatuses.size === STATUS_ORDER.length
                  ? 'Status: All'
                  : selectedStatuses.size === 0
                  ? 'Status: None (0)'
                  : selectedStatuses.size === DEFAULT_VISIBLE_STATUSES.length && DEFAULT_VISIBLE_STATUSES.every((s) => selectedStatuses.has(s))
                  ? `Status: Active (${selectedStatuses.size})`
                  : `Status (${selectedStatuses.size}/${STATUS_ORDER.length})`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {isStatusFilterOpen && (
              <>
                {/* Backdrop dismiss */}
                <div
                  className="fixed inset-0 z-50 cursor-default"
                  onClick={() => setIsStatusFilterOpen(false)}
                />
                {/* Popover Dropdown */}
                <div className="absolute left-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex items-center justify-between px-3 pb-2 mb-1 border-b border-slate-100">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Filter Pipeline
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllStatuses}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={handleSelectNoneStatuses}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                      >
                        Select None
                      </button>
                    </div>
                  </div>

                  <div className="space-y-0.5 px-1.5">
                    {STATUS_ORDER.map((status) => {
                      const isSelected = selectedStatuses.has(status);
                      const meta = getStatusMeta(status);
                      const Icon = meta.icon;
                      const count = jobs.filter((j) => j.status === status).length;

                      return (
                        <label
                          key={status}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                            isSelected
                              ? 'bg-slate-50 hover:bg-slate-100/80 text-slate-800'
                              : 'hover:bg-slate-50 text-slate-500'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleStatus(status)}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                            />
                            <Icon className={`w-3.5 h-3.5 ${meta.iconClass} shrink-0`} />
                            <span className={`font-medium ${isSelected ? 'text-slate-800' : 'text-slate-600'}`}>
                              {meta.label}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                              count > 0 ? 'bg-slate-100 text-slate-600' : 'text-slate-400'
                            }`}
                          >
                            {count}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <span className="text-xs text-slate-500 font-medium">
            Showing <strong className="text-slate-800">{filteredAndSortedJobs.length}</strong> of {jobs.length} records
          </span>
        </div>

        {/* Right: Actions & Views Dropdown */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsActionsDropdownOpen(!isActionsDropdownOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer select-none"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Options & Actions</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isActionsDropdownOpen && (
              <>
                {/* Overlay back-click handler */}
                <div 
                  className="fixed inset-0 z-50 cursor-default" 
                  onClick={() => setIsActionsDropdownOpen(false)} 
                />
                {/* Dropdown Menu */}
                <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-100 font-medium">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                    View Style
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('compact');
                      setIsActionsDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      viewMode === 'compact' ? 'text-indigo-600 font-bold bg-indigo-50/50' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Compact View (Default)</span>
                    </div>
                    {viewMode === 'compact' && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">Active</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('full');
                      setIsActionsDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                      viewMode === 'full' ? 'text-indigo-600 font-bold bg-indigo-50/50' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <TableProperties className="w-3.5 h-3.5" />
                      <span>Full Grid View</span>
                    </div>
                    {viewMode === 'full' && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">Active</span>}
                  </button>

                  <div className="border-t border-slate-100 my-1" />

                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                    Data Portability
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      exportJobsToCsv(jobs);
                      setIsActionsDropdownOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 flex items-center gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      exportJobsToJson(jobs);
                      setIsActionsDropdownOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 flex items-center gap-2 hover:bg-slate-50 transition-colors"
                  >
                    <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Export JSON</span>
                  </button>
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => {
                      setImportError(null);
                      fileInputRef.current?.click();
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 flex items-center gap-2 hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    {isImporting ? (
                      <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-indigo-600" />
                    )}
                    <span>{isImporting ? 'Importing…' : 'Import JSON / CSV'}</span>
                  </button>
                  {importError && (
                    <p className="px-3 pb-2 text-[11px] text-rose-600 leading-snug">{importError}</p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    className="hidden"
                    onChange={(e) => handleImportFile(e.target.files?.[0] || null)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
    </div>

      {/* Responsive View Switcher: Card List on Mobile, Table Grid on Desktop */}
      {/* 1. Mobile Vertical Card List View */}
      <div className="block md:hidden divide-y divide-slate-100 bg-white">
        {filteredAndSortedJobs.length === 0 ? (
          <div className="px-4 py-12 text-center text-slate-400">
            <div className="max-w-sm mx-auto space-y-2 flex flex-col items-center">
              <Inbox className="w-8 h-8 text-indigo-400" />
              <p className="font-semibold text-slate-600">No matching job records found</p>
              <p className="text-xs text-slate-400">
                Try adjusting your search criteria or paste a new job posting URL above.
              </p>
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredAndSortedJobs.map((job) => (
              viewMode === 'compact' ? (
                /* 1A. Highly Polished Compact Mobile Card View (Status Left, 2-Line Role/Company, Age & Time in State) */
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  onClick={() => onSelectJob(job)}
                  className={`p-3 transition-colors cursor-pointer relative border-l-4 ${getStatusBorderAccent(
                    job.status
                  )} ${getRowHoverClass(job.status)}`}
                >
                  {/* First Row: Status Icon (Left), Company Logo, 2-Line Role & Company, Quick Actions */}
                  <div className="flex items-center justify-between gap-2">
                    {/* Left block: Status Icon + Company Logo + Role & Company */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {/* Status Icon on the left */}
                      {renderCompactStatusIcon(job)}

                      {/* Company Logo */}
                      <CompanyLogo company={job.company} url={job.url} size="xs" className="shrink-0" />

                      {/* Role & Company formatted cleanly into 2 lines */}
                      <div className="min-w-0 flex-1">
                        {/* Line 1: Job Title + Team */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-slate-950 text-xs truncate leading-tight shrink">
                            {job.jobTitle}
                          </span>
                          {job.team && (
                            <span className="text-indigo-600 font-semibold text-xs truncate leading-tight shrink min-w-0" title={job.team}>
                              • {job.team}
                            </span>
                          )}
                        </div>
                        {/* Line 2: Company Name (with headcount if available) */}
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 leading-tight truncate">
                          <span className="font-semibold text-slate-600 truncate">{job.company}</span>
                          {job.companyMetadata?.headcount && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-400 text-[10px] truncate">{job.companyMetadata.headcount}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Quick Actions */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          if (openActionRowId === job.id) {
                            closeRowActions();
                          } else {
                            setOpenActionRowId(job.id);
                            setConfirmDeleteId(null);
                          }
                        }}
                        aria-label={`More actions for ${job.company}`}
                        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer border ${
                          openActionRowId === job.id
                            ? 'text-indigo-600 bg-indigo-50 border-indigo-200'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100 border-transparent'
                        }`}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Second Row: Work-Arrangement, Micro-Salary & Timeline */}
                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100/80 text-[10px]">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {/* Work-Arrangement */}
                      {renderLocationElement(job, true)}

                      {/* Micro-Salary Range */}
                      <span className="text-slate-300 select-none">•</span>
                      {renderSalaryElement(job, true)}
                    </div>

                    {/* Right: Timeline (Age + Duration in State) */}
                    {renderTimelineElement(job, true)}
                  </div>

                  {openActionRowId === job.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={closeRowActions} />
                      <div className="absolute right-2 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 text-left font-medium animate-in fade-in slide-in-from-top-1 duration-100">
                        {job.url && (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            onClick={closeRowActions}
                            className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Open URL</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            onSelectJob(job);
                            closeRowActions();
                          }}
                          className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                        >
                          <Info className="w-3.5 h-3.5 text-indigo-500" />
                          <span>View Details</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onEditJob(job);
                            closeRowActions();
                          }}
                          className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Edit Attributes</span>
                        </button>
                        <div className="border-t border-slate-100 my-1" />
                        {confirmDeleteId === job.id ? (
                          <div className="px-3 py-1.5 space-y-1.5">
                            <p className="text-[11px] text-rose-700 font-medium">Delete this record?</p>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteJob(job.id);
                                  closeRowActions();
                                }}
                                className="px-2 py-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors cursor-pointer"
                              >
                                Yes, Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 text-[11px] text-slate-600 hover:text-slate-900 rounded-md transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(job.id)}
                            className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete Record</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              ) : (
                /* 1B. Full Grid Mobile Card View with Left Border Accent */
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  onClick={() => onSelectJob(job)}
                  className={`p-4 transition-colors cursor-pointer relative border-l-4 ${getStatusBorderAccent(
                    job.status
                  )} ${getRowHoverClass(job.status)}`}
                >
                  {/* Logo, Name and Action Trigger */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <CompanyLogo company={job.company} url={job.url} size="md" />
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="font-bold text-slate-900 block truncate">{job.company}</span>
                        <div className="font-semibold text-slate-700 text-xs flex items-center gap-1 min-w-0 leading-tight">
                          <span className="truncate shrink">{job.jobTitle}</span>
                          {job.team && (
                            <span className="text-indigo-600 font-semibold text-xs truncate min-w-0 shrink max-w-[150px]" title={job.team}>
                              • {job.team}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Top Right Actions Popout Trigger */}
                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          if (openActionRowId === job.id) {
                            closeRowActions();
                          } else {
                            setOpenActionRowId(job.id);
                            setConfirmDeleteId(null);
                          }
                        }}
                        aria-label={`More actions for ${job.company}`}
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors cursor-pointer border ${
                          openActionRowId === job.id
                            ? 'text-indigo-600 bg-indigo-50 border-indigo-200'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100 border-transparent'
                        }`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {openActionRowId === job.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={closeRowActions} />
                          <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 text-left font-medium animate-in fade-in slide-in-from-top-1 duration-100">
                            {job.url && (
                              <a
                                href={job.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                onClick={closeRowActions}
                                className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                                <span>Open URL</span>
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                onSelectJob(job);
                                closeRowActions();
                              }}
                              className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                            >
                              <Info className="w-3.5 h-3.5 text-slate-400" />
                              <span>View Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onEditJob(job);
                                closeRowActions();
                              }}
                              className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>Edit Attributes</span>
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            {confirmDeleteId === job.id ? (
                              <div className="px-3 py-1.5 space-y-1.5">
                                <p className="text-[11px] text-rose-700 font-medium">Delete this record?</p>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteJob(job.id);
                                      closeRowActions();
                                    }}
                                    className="px-2 py-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors cursor-pointer"
                                  >
                                    Yes, Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2 py-1 text-[11px] text-slate-600 hover:text-slate-900 rounded-md transition-colors cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(job.id)}
                                className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Record</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Info Attributes */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3.5 pt-3.5 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Location</span>
                      {renderLocationElement(job, false)}
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Salary / Comp</span>
                      {renderSalaryElement(job, false)}
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Status</span>
                      {renderStatusSelect(job)}
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Timeline & State</span>
                      {(() => {
                        const timeline = getCompactTimeline(job);
                        return (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-slate-600 font-mono text-xs">
                              {job.statusHistory && job.statusHistory.length > 1 && (
                                <span className="inline-flex items-center gap-0.5 text-indigo-600 font-medium" title={`${job.statusHistory.length} status stages tracked`}>
                                  <History className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span>{job.statusHistory.length}</span>
                                </span>
                              )}
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{timeline.ageText}</span>
                              <span className="text-slate-300">•</span>
                              <span className="font-medium text-slate-700">{timeline.stateDurationText}</span>
                            </div>
                            {job.dateApplied && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                Applied: {job.dateApplied}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {job.industry && (
                      <div className="col-span-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Industry</span>
                        <span className="text-slate-700 font-semibold break-words whitespace-normal leading-relaxed text-[11px]">
                          {job.industry}
                        </span>
                      </div>
                    )}

                    {job.summary && (
                      <div className="col-span-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Description Summary</span>
                        <p className="text-slate-600 line-clamp-2 leading-relaxed text-[11px]">
                          {job.summary}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* 2. Desktop-Only Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700 border-collapse">
          {/* Table Header */}
          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold sticky top-0 z-10 select-none text-[11px] uppercase tracking-wider">
            <tr>
              {/* Col 0 (leftmost): Action Popout */}
              <th className="px-1.5 py-3 whitespace-nowrap w-[32px] text-center text-[10px]">
                <span className="sr-only">Actions</span>
              </th>

              {/* Col 1: Status (Moved to the left of Role & Company) */}
              <th className={`py-3 whitespace-nowrap ${viewMode === 'compact' ? 'px-2 w-[52px] text-center' : 'px-4 min-w-[140px]'}`}>
                <div className={`flex items-center ${viewMode === 'compact' ? 'justify-center' : 'gap-1'}`}>
                  <Filter className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className={viewMode === 'compact' ? 'sr-only' : ''}>
                    {viewMode === 'full' ? '1. Status' : 'Status'}
                  </span>
                </div>
              </th>

              {viewMode === 'full' ? (
                <>
                  {/* Col 2: Company */}
                  <th
                    onClick={() => handleSort('company')}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-200/70 transition-colors whitespace-nowrap min-w-[160px]"
                  >
                    <div className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>2. Company</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                    </div>
                  </th>

                  {/* Col 3: Job Title */}
                  <th
                    onClick={() => handleSort('jobTitle')}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-200/70 transition-colors whitespace-nowrap min-w-[180px]"
                  >
                    <div className="flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>3. Job Title</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                    </div>
                  </th>
                </>
              ) : (
                /* Combined: Role & Company */
                <th
                  onClick={() => handleSort('jobTitle')}
                  className="px-4 py-3 cursor-pointer hover:bg-slate-200/70 transition-colors whitespace-nowrap min-w-[230px]"
                >
                  <div className="flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>Role & Company</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                  </div>
                </th>
              )}

              {/* Col: Location */}
              <th className="px-4 py-3 whitespace-nowrap min-w-[130px]">
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>{viewMode === 'full' ? '4. Location' : 'Location'}</span>
                </div>
              </th>

              {/* Col: Salary / Compensation */}
              <th
                onClick={() => handleSort('salary')}
                className="px-4 py-3 cursor-pointer hover:bg-slate-200/70 transition-colors whitespace-nowrap min-w-[120px]"
              >
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>{viewMode === 'full' ? '5. Salary / Comp' : 'Salary / Comp'}</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
              </th>

              {/* Col: Timeline & State */}
              <th
                onClick={() => handleSort('dateApplied')}
                className="px-4 py-3 cursor-pointer hover:bg-slate-200/70 transition-colors whitespace-nowrap min-w-[150px]"
              >
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span>{viewMode === 'full' ? '6. Timeline & State' : 'Timeline & State'}</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />
                </div>
              </th>

              {/* View mode sensitive columns */}
              {viewMode === 'full' && (
                <>
                  {/* Col 7: Industry */}
                  <th className="px-4 py-3 whitespace-nowrap min-w-[140px]">
                    <span>7. Industry</span>
                  </th>

                  {/* Col 8: Job Description Summary */}
                  <th className="px-4 py-3 whitespace-nowrap min-w-[280px]">
                    <span>8. Description Summary</span>
                  </th>
                </>
              )}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-200 bg-white">
            {filteredAndSortedJobs.length === 0 ? (
              <tr>
                <td colSpan={viewMode === 'full' ? 9 : 6} className="px-4 py-12 text-center text-slate-400">
                  <div className="max-w-sm mx-auto space-y-2 flex flex-col items-center">
                    <Inbox className="w-8 h-8 text-indigo-400" />
                    <p className="font-semibold text-slate-600">No matching job records found</p>
                    <p className="text-xs text-slate-400">
                      Try adjusting your search criteria or paste a new job posting URL above.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              <AnimatePresence initial={false}>
                {filteredAndSortedJobs.map((job) => (
                  <motion.tr
                    key={job.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    onClick={() => onSelectJob(job)}
                    className={`transition-colors cursor-pointer group border-b border-slate-200/60 ${getRowHoverClass(
                      job.status
                    )}`}
                  >
                    {/* Col 0 (leftmost): Action Popout */}
                    <td className={`${viewMode === 'full' ? 'px-1.5 py-3.5' : 'px-1.5 py-2'} text-center relative w-[32px]`} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          if (openActionRowId === job.id) {
                            closeRowActions();
                          } else {
                            setOpenActionRowId(job.id);
                            setConfirmDeleteId(null);
                          }
                        }}
                        className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer border ${
                          openActionRowId === job.id
                            ? 'text-indigo-600 bg-indigo-50 border-indigo-200'
                            : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100 border-transparent'
                        }`}
                        title="Actions"
                        aria-label={`More actions for ${job.company}`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {openActionRowId === job.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={closeRowActions} />
                          <div className="absolute left-1 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 text-left font-medium animate-in fade-in slide-in-from-top-1 duration-100">
                            {job.url && (
                              <a
                                href={job.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                onClick={closeRowActions}
                                className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
                                <span>Open URL</span>
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                onSelectJob(job);
                                closeRowActions();
                              }}
                              className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                            >
                              <Info className="w-3.5 h-3.5 text-indigo-500" />
                              <span>View Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onEditJob(job);
                                closeRowActions();
                              }}
                              className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-indigo-500" />
                              <span>Edit Attributes</span>
                            </button>
                            <div className="border-t border-slate-100 my-1" />
                            {confirmDeleteId === job.id ? (
                              <div className="px-3 py-1.5 space-y-1.5">
                                <p className="text-[11px] text-rose-700 font-medium">Delete this record?</p>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteJob(job.id);
                                      closeRowActions();
                                    }}
                                    className="px-2 py-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors cursor-pointer"
                                  >
                                    Yes, Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2 py-1 text-[11px] text-slate-600 hover:text-slate-900 rounded-md transition-colors cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(job.id)}
                                className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer text-left"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </td>

                    {/* Col 1: Status (Moved to left of Role & Company) */}
                    <td
                      className={`${viewMode === 'full' ? 'px-4 py-3.5' : 'px-2 py-2 text-center'}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {viewMode === 'compact' ? renderCompactStatusIcon(job) : renderStatusSelect(job)}
                    </td>

                    {/* Col 2 & 3: Company + Job Title (Full view) OR Combined Role & Company (Compact view) */}
                    {viewMode === 'full' ? (
                      <>
                        {/* Company */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <CompanyLogo company={job.company} url={job.url} size="sm" />
                            <div className="space-y-0.5">
                              <span className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors block">
                                {job.company}
                              </span>
                              {job.companyMetadata?.headcount && (
                                <span className="text-[10px] text-slate-400 block truncate max-w-[130px]">
                                {job.companyMetadata.headcount}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Job Title */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 min-w-0 max-w-[260px]">
                            <span className="font-semibold text-slate-800 truncate shrink">{job.jobTitle}</span>
                            {job.team && (
                              <span className="text-indigo-600 font-semibold text-xs truncate min-w-0 shrink max-w-[150px]" title={job.team}>
                                • {job.team}
                              </span>
                            )}
                          </div>
                        </td>
                      </>
                    ) : (
                      /* Combined: Role & Company formatted cleanly on 2 lines */
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5">
                          <CompanyLogo company={job.company} url={job.url} size="xs" />
                          <div className="space-y-0.5 min-w-0">
                            {/* Line 1: Job Title + Team (Role + Team) */}
                            <div className="flex items-center gap-1.5 min-w-0 max-w-[280px] whitespace-nowrap overflow-hidden">
                              <span className="font-bold text-slate-950 group-hover:text-indigo-700 transition-colors text-xs leading-tight truncate shrink">
                                {job.jobTitle}
                              </span>
                              {job.team && (
                                <span className="text-indigo-600 font-semibold text-xs truncate min-w-0 flex-1" title={job.team}>
                                  • {job.team}
                                </span>
                              )}
                            </div>
                            {/* Line 2: Company Name + Headcount */}
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 leading-tight truncate">
                              <span className="font-semibold text-slate-600">{job.company}</span>
                              {job.companyMetadata?.headcount && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-slate-400 text-[10px]">
                                    {job.companyMetadata.headcount}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    )}

                    {/* Col: Location */}
                    <td className={viewMode === 'full' ? "px-4 py-3.5" : "px-4 py-2"}>
                      {renderLocationElement(job, viewMode === 'compact')}
                    </td>

                    {/* Col: Salary / Compensation */}
                    <td className={viewMode === 'full' ? "px-4 py-3.5" : "px-4 py-2"}>
                      {renderSalaryElement(job, viewMode === 'compact')}
                    </td>

                    {/* Col: Timeline & State */}
                    {viewMode === 'full' ? (
                      <td className="px-4 py-3.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {(() => {
                          const timeline = getCompactTimeline(job);
                          return (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                {job.statusHistory && job.statusHistory.length > 1 && (
                                  <span className="inline-flex items-center gap-0.5 text-indigo-600 font-medium" title={`${job.statusHistory.length} status stages tracked`}>
                                    <History className="w-3 h-3 text-indigo-500 shrink-0" />
                                    <span>{job.statusHistory.length}</span>
                                  </span>
                                )}
                                <span className="flex items-center gap-1 text-slate-500" title={`Added: ${timeline.ageText}`}>
                                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>{timeline.ageText}</span>
                                </span>
                                <span className="text-slate-300">•</span>
                                <span className="font-medium text-slate-700" title={`Current status duration: ${timeline.stateDurationText}`}>
                                  {timeline.stateDurationText}
                                </span>
                              </div>
                              {job.dateApplied && (
                                <span className="text-[10px] text-slate-400 font-mono" title="Date Applied">
                                  App: {job.dateApplied}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    ) : (
                      /* Compact Timeline: Age & Duration in State (Date Applied hidden) */
                      <td className="px-4 py-2 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {renderTimelineElement(job, true)}
                      </td>
                    )}

                    {/* Full Grid Columns */}
                    {viewMode === 'full' && (
                      <>
                        {/* Col 7: Industry */}
                        <td className="px-4 py-3.5">
                          <span className="text-slate-700 font-semibold leading-relaxed block break-words whitespace-normal max-w-[130px]">
                            {job.industry || 'Technology'}
                          </span>
                        </td>

                        {/* Col 8: Job Description Summary */}
                        <td className="px-4 py-3.5">
                          <p className="text-slate-600 line-clamp-2 text-[11px] leading-relaxed max-w-[340px]">
                            {job.summary || 'Summary unavailable.'}
                          </p>
                        </td>
                      </>
                    )}
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {/* Spreadsheet Footer Status */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <span>Persistent storage synced with Supabase (or local JSON in dev)</span>
        </div>
        <div>
          <span>Click any row to open the complete inspection drawer</span>
        </div>
      </div>
    </div>
  );
};
