import { useRef, useState } from 'react';
import {
  Check,
  FileSpreadsheet,
  FileCode,
  LayoutGrid,
  TableProperties,
  ChevronDown,
  Upload,
  Loader2,
  Download,
} from 'lucide-react';
import { JobRecord, JobStatus } from '../../types';
import { exportJobsToCsv, exportJobsToJson } from '../../utils/export';
import { parseJobsImportFile } from '../../utils/import';
import { STATUS_ORDER, getStatusMeta } from '../../lib/statusMeta';
import { WorkArrangementType } from '../../lib/formatHelpers';
import { PortalDropdown } from '../PortalDropdown';
import {
  ActiveFilterChip,
  FilterBar,
  FilterSelectConfig,
  FilterToggleConfig,
  TriStateFilter,
} from '../FilterBar';
import { isDefaultStatusSelection, SpreadsheetFilterOptions } from './useSpreadsheetFilter';

interface SpreadsheetToolbarProps {
  jobs: JobRecord[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedStatuses: Set<JobStatus>;
  onToggleStatus: (status: JobStatus) => void;
  onSelectAllStatuses: () => void;
  onSelectNoneStatuses: () => void;
  onResetStatusesToDefault: () => void;
  workArrangement: WorkArrangementType | '';
  onWorkArrangementChange: (value: WorkArrangementType | '') => void;
  industry: string;
  onIndustryChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  seniority: string;
  onSeniorityChange: (value: string) => void;
  salary: TriStateFilter;
  onSalaryChange: (value: TriStateFilter) => void;
  notes: TriStateFilter;
  onNotesChange: (value: TriStateFilter) => void;
  needsReview: TriStateFilter;
  onNeedsReviewChange: (value: TriStateFilter) => void;
  filterOptions: SpreadsheetFilterOptions;
  activeFilterCount: number;
  onResetAllFilters: () => void;
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
  onResetStatusesToDefault,
  workArrangement,
  onWorkArrangementChange,
  industry,
  onIndustryChange,
  location,
  onLocationChange,
  seniority,
  onSeniorityChange,
  salary,
  onSalaryChange,
  notes,
  onNotesChange,
  needsReview,
  onNeedsReviewChange,
  filterOptions,
  activeFilterCount,
  onResetAllFilters,
  viewMode,
  onViewModeChange,
  onImportJobs,
  isImporting = false,
  onOpenGoogleSheetsModal,
}: SpreadsheetToolbarProps) => {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isDataDropdownOpen, setIsDataDropdownOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

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

  const selects: FilterSelectConfig[] = [
    {
      id: 'work-mode',
      label: 'Work mode',
      value: workArrangement,
      options: [
        { value: 'Remote', label: 'Remote' },
        { value: 'Hybrid', label: 'Hybrid' },
        { value: 'Onsite', label: 'Onsite' },
      ],
      onChange: (value) => onWorkArrangementChange(value as WorkArrangementType | ''),
    },
  ];

  if (filterOptions.industries.length > 0) {
    selects.push({
      id: 'industry',
      label: 'Industry',
      value: industry,
      options: filterOptions.industries.map((item) => ({ value: item, label: item })),
      onChange: onIndustryChange,
    });
  }

  if (filterOptions.locations.length > 0) {
    selects.push({
      id: 'location',
      label: 'Location',
      value: location,
      options: filterOptions.locations.map((item) => ({ value: item, label: item })),
      onChange: onLocationChange,
    });
  }

  if (filterOptions.seniorities.length > 0) {
    selects.push({
      id: 'seniority',
      label: 'Seniority',
      value: seniority,
      options: filterOptions.seniorities.map((item) => ({ value: item, label: item })),
      onChange: onSeniorityChange,
    });
  }

  const toggles: FilterToggleConfig[] = [
    {
      id: 'salary',
      label: 'Salary',
      yesLabel: 'Has salary',
      noLabel: 'No salary',
      state: salary,
      onChange: onSalaryChange,
    },
    {
      id: 'notes',
      label: 'Notes',
      yesLabel: 'Has notes',
      noLabel: 'No notes',
      state: notes,
      onChange: onNotesChange,
    },
    {
      id: 'needs-review',
      label: 'Needs review',
      yesLabel: 'Needs review',
      noLabel: 'Reviewed',
      state: needsReview,
      onChange: onNeedsReviewChange,
    },
  ];

  const activeChips: ActiveFilterChip[] = [];

  if (!isDefaultStatusSelection(selectedStatuses)) {
    const statusLabel =
      selectedStatuses.size === STATUS_ORDER.length
        ? 'All statuses'
        : selectedStatuses.size === 0
        ? 'No statuses'
        : `Statuses (${selectedStatuses.size})`;
    activeChips.push({
      id: 'statuses',
      label: statusLabel,
      onRemove: onResetStatusesToDefault,
    });
  }

  if (workArrangement) {
    activeChips.push({
      id: 'work-mode',
      label: workArrangement,
      onRemove: () => onWorkArrangementChange(''),
    });
  }

  if (industry) {
    activeChips.push({
      id: 'industry',
      label: industry,
      onRemove: () => onIndustryChange(''),
    });
  }

  if (location) {
    activeChips.push({
      id: 'location',
      label: location,
      onRemove: () => onLocationChange(''),
    });
  }

  if (seniority) {
    activeChips.push({
      id: 'seniority',
      label: seniority,
      onRemove: () => onSeniorityChange(''),
    });
  }

  if (salary !== 'any') {
    activeChips.push({
      id: 'salary',
      label: salary === 'yes' ? 'Has salary' : 'No salary',
      onRemove: () => onSalaryChange('any'),
    });
  }

  if (notes !== 'any') {
    activeChips.push({
      id: 'notes',
      label: notes === 'yes' ? 'Has notes' : 'No notes',
      onRemove: () => onNotesChange('any'),
    });
  }

  if (needsReview !== 'any') {
    activeChips.push({
      id: 'needs-review',
      label: needsReview === 'yes' ? 'Needs review' : 'Reviewed',
      onRemove: () => onNeedsReviewChange('any'),
    });
  }

  const trailingActions = (
    <>
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
    </>
  );

  return (
    <div className="p-2.5 sm:p-3 border-b border-slate-200 bg-white">
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search all applications..."
        searchAriaLabel="Search jobs"
        isOpen={isFiltersOpen}
        onToggleOpen={() => setIsFiltersOpen((prev) => !prev)}
        activeCount={activeFilterCount}
        selects={selects}
        toggles={toggles}
        activeChips={activeChips}
        onClearAll={onResetAllFilters}
        trailingActions={trailingActions}
      >
        <div className="ui-filter-group" role="group" aria-label="Status filters">
          {STATUS_ORDER.map((status) => {
            const count = jobs.filter((j) => j.status === status).length;
            const isSelected = selectedStatuses.has(status);
            const meta = getStatusMeta(status);
            const StatusIcon = meta.icon;

            return (
              <button
                key={status}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggleStatus(status)}
                className={`ui-pill ${isSelected ? 'ui-pill--active' : ''}`}
              >
                {isSelected ? (
                  <Check className="w-3 h-3 text-indigo-600" />
                ) : (
                  <StatusIcon className={`w-3.5 h-3.5 ${meta.iconClass}`} />
                )}
                <span>{status}</span>
                <span className="font-mono text-[11px] text-slate-400">({count})</span>
              </button>
            );
          })}

          <div className="inline-flex items-center gap-1.5 ml-auto text-[11px] font-semibold">
            <button
              type="button"
              onClick={onResetStatusesToDefault}
              className="text-slate-500 hover:text-indigo-600 hover:underline cursor-pointer"
            >
              Active
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={onSelectAllStatuses}
              className="text-slate-500 hover:text-indigo-600 hover:underline cursor-pointer"
            >
              All
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={onSelectNoneStatuses}
              className="text-slate-500 hover:text-indigo-600 hover:underline cursor-pointer"
            >
              None
            </button>
          </div>
        </div>
      </FilterBar>
    </div>
  );
};
