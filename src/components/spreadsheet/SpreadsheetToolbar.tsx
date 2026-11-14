import { useRef, useState } from 'react';
import {
  Search,
  Filter,
  FileSpreadsheet,
  FileCode,
  LayoutGrid,
  TableProperties,
  ChevronDown,
  Upload,
  Loader2,
  Download,
  X,
} from 'lucide-react';
import { JobRecord, JobStatus } from '../../types';
import { exportJobsToCsv, exportJobsToJson } from '../../utils/export';
import { parseJobsImportFile } from '../../utils/import';
import { STATUS_ORDER, DEFAULT_VISIBLE_STATUSES, getStatusMeta } from '../../lib/statusMeta';
import { PortalDropdown } from '../PortalDropdown';

interface SpreadsheetToolbarProps {
  jobs: JobRecord[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedStatuses: Set<JobStatus>;
  onToggleStatus: (status: JobStatus) => void;
  onSelectAllStatuses: () => void;
  onSelectNoneStatuses: () => void;
  viewMode: 'full' | 'compact';
  onViewModeChange: (mode: 'full' | 'compact') => void;
  onImportJobs: (jobs: JobRecord[]) => Promise<void>;
  isImporting?: boolean;
  onOpenGoogleSheetsModal?: () => void;
}

export const SpreadsheetToolbar = ({
  jobs,
  searchQuery,
  onSearchChange,
  selectedStatuses,
  onToggleStatus,
  onSelectAllStatuses,
  onSelectNoneStatuses,
  viewMode,
  onViewModeChange,
  onImportJobs,
  isImporting = false,
  onOpenGoogleSheetsModal,
}: SpreadsheetToolbarProps) => {
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [isDataDropdownOpen, setIsDataDropdownOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const statusFilterBtnRef = useRef<HTMLButtonElement>(null);
  const dataBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = parseJobsImportFile(file.name, text);
      await onImportJobs(parsed.jobs);
      setIsDataDropdownOpen(false);
    } catch (err: any) {
      setImportError(err.message || 'Failed to import file');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isDefaultActive =
    selectedStatuses.size === DEFAULT_VISIBLE_STATUSES.length &&
    DEFAULT_VISIBLE_STATUSES.every((s) => selectedStatuses.has(s));

  let statusFilterLabel = `Active (${selectedStatuses.size})`;
  if (isDefaultActive) {
    statusFilterLabel = `Active (${selectedStatuses.size})`;
  } else if (selectedStatuses.size === STATUS_ORDER.length) {
    statusFilterLabel = `All (${STATUS_ORDER.length})`;
  } else if (selectedStatuses.size === 0) {
    statusFilterLabel = 'None (0)';
  } else {
    statusFilterLabel = `Filtered (${selectedStatuses.size})`;
  }

  return (
    <div className="p-2.5 sm:p-3 border-b border-slate-200 bg-white">
      {/* Search, Filter, Mode & Data Row in a single unified line */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        {/* Left: Search input */}
        <div className="relative w-full sm:max-w-xs md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search company, title, or skills..."
            className="w-full pl-9 pr-7 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50/60 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 bg-slate-200 rounded-full w-4 h-4 inline-flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right: Controls Cluster */}
        <div className="flex items-center gap-2 justify-between sm:justify-end flex-wrap sm:flex-nowrap">
          {/* Status Multi-Filter Button with restored icons */}
          <div>
            <button
              ref={statusFilterBtnRef}
              type="button"
              onClick={() => setIsStatusFilterOpen(!isStatusFilterOpen)}
              className="px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              <span>{statusFilterLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Portal-rendered Status Filter */}
            <PortalDropdown
              isOpen={isStatusFilterOpen}
              onClose={() => setIsStatusFilterOpen(false)}
              triggerRef={statusFilterBtnRef}
              align="right"
              className="w-60 py-1.5"
            >
              <div className="px-3 pb-1.5 border-b border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Filter by Status</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onSelectAllStatuses}
                    className="text-indigo-600 hover:underline text-[11px] cursor-pointer"
                  >
                    All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={onSelectNoneStatuses}
                    className="text-slate-400 hover:underline text-[11px] cursor-pointer"
                  >
                    None
                  </button>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto py-1">
                {STATUS_ORDER.map((status) => {
                  const count = jobs.filter((j) => j.status === status).length;
                  const isChecked = selectedStatuses.has(status);
                  const meta = getStatusMeta(status);
                  const ItemIcon = meta.icon;

                  return (
                    <label
                      key={status}
                      className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs select-none"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleStatus(status)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                        />
                        <ItemIcon className={`w-3.5 h-3.5 ${meta.iconClass}`} />
                        <span className={isChecked ? 'font-semibold text-slate-900' : 'text-slate-600'}>
                          {status}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {count}
                      </span>
                    </label>
                  );
                })}
              </div>
            </PortalDropdown>
          </div>

          {/* Segmented View Mode Toggle: Compact vs Full */}
          <div className="hidden sm:inline-flex items-center p-0.5 rounded-lg border border-slate-200 bg-slate-100/70">
            <button
              type="button"
              onClick={() => onViewModeChange('compact')}
              title="Compact row view without horizontal scrolling"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'compact'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Compact</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('full')}
              title="Detailed full table grid"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'full'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableProperties className="w-3.5 h-3.5" />
              <span>Full</span>
            </button>
          </div>

          {/* Data Portability (Export & Import) Dropdown */}
          <div>
            <button
              ref={dataBtnRef}
              type="button"
              onClick={() => setIsDataDropdownOpen(!isDataDropdownOpen)}
              className="px-2.5 py-1.5 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Data</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Portal-rendered Data Menu */}
            <PortalDropdown
              isOpen={isDataDropdownOpen}
              onClose={() => setIsDataDropdownOpen(false)}
              triggerRef={dataBtnRef}
              align="right"
              className="w-52 py-1"
            >
              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">
                Data Portability
              </div>

              {onOpenGoogleSheetsModal && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenGoogleSheetsModal();
                    setIsDataDropdownOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-semibold text-slate-800">Google Sheets Sync</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  exportJobsToCsv(jobs);
                  setIsDataDropdownOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  exportJobsToJson(jobs);
                  setIsDataDropdownOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                <span>Export JSON</span>
              </button>

              <div className="border-t border-slate-100 my-1" />

              <button
                type="button"
                disabled={isImporting}
                onClick={() => {
                  setImportError(null);
                  fileInputRef.current?.click();
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isImporting ? (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>{isImporting ? 'Importing...' : 'Import CSV/JSON'}</span>
              </button>

              {importError && (
                <p className="px-3 py-1.5 text-[11px] text-rose-600 leading-snug">{importError}</p>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                className="hidden"
                onChange={(e) => handleImportFile(e.target.files?.[0] || null)}
              />
            </PortalDropdown>
          </div>
        </div>
      </div>
    </div>
  );
};
