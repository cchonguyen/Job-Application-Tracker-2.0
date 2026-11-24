import { useState, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { Inbox, FileSpreadsheet, Clock, RefreshCw } from 'lucide-react';
import { JobRecord, JobStatus } from '../types';
import { useSpreadsheetFilter } from './spreadsheet/useSpreadsheetFilter';
import { SpreadsheetToolbar } from './spreadsheet/SpreadsheetToolbar';
import { SpreadsheetHeader } from './spreadsheet/SpreadsheetHeader';
import { SpreadsheetRow } from './spreadsheet/SpreadsheetRow';
import { MobileJobCard } from './spreadsheet/MobileJobCard';
import type { ConnectedSheet } from '../hooks/useGoogleSheetsSync';

interface JobSpreadsheetProps {
  jobs: JobRecord[];
  onStatusChange: (id: string, newStatus: JobStatus) => Promise<void>;
  onSelectJob: (job: JobRecord) => void;
  onEditJob: (job: JobRecord) => void;
  onDeleteJob: (id: string) => Promise<void>;
  onImportJobs: (jobs: JobRecord[]) => Promise<void>;
  isImporting?: boolean;
  onOpenGoogleSheetsModal?: () => void;
  googleSheetsProps?: {
    connectedSheet: ConnectedSheet | null;
    syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
    lastSyncedAt: Date | null;
    onOpenModal: () => void;
    onSyncNow?: () => Promise<boolean>;
  };
}

export const JobSpreadsheet = ({
  jobs,
  onStatusChange,
  onSelectJob,
  onEditJob,
  onDeleteJob,
  onImportJobs,
  isImporting = false,
  onOpenGoogleSheetsModal,
  googleSheetsProps,
}: JobSpreadsheetProps) => {
  const [viewMode, setViewMode] = useState<'full' | 'compact'>('compact');
  const [openActionRowId, setOpenActionRowId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const {
    searchQuery,
    setSearchQuery,
    selectedStatuses,
    handleToggleStatus,
    handleSelectAllStatuses,
    handleSelectNoneStatuses,
    sortField,
    sortOrder,
    handleSort,
    filteredAndSortedJobs,
  } = useSpreadsheetFilter(jobs);

  const closeRowActions = () => {
    setOpenActionRowId(null);
    setConfirmDeleteId(null);
  };

  // Derive last updated timestamp
  const lastUpdatedText = useMemo(() => {
    if (!jobs || jobs.length === 0) return 'Just now';
    let latestMs = 0;
    for (const job of jobs) {
      if (job.dateApplied) {
        const d = new Date(job.dateApplied).getTime();
        if (d > latestMs) latestMs = d;
      }
      if (job.statusHistory && job.statusHistory.length > 0) {
        for (const h of job.statusHistory) {
          const d = new Date(h.at).getTime();
          if (d > latestMs) latestMs = d;
        }
      }
    }
    if (latestMs === 0) return 'Just now';
    const diffMins = Math.floor((Date.now() - latestMs) / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  }, [jobs]);

  const formatLastSynced = (date: Date | null) => {
    if (!date) return 'Not yet';
    const diffMins = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col">
      {/* 1. Filter, Search & View Toolbar */}
      <SpreadsheetToolbar
        jobs={jobs}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedStatuses={selectedStatuses}
        onToggleStatus={handleToggleStatus}
        onSelectAllStatuses={handleSelectAllStatuses}
        onSelectNoneStatuses={handleSelectNoneStatuses}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onImportJobs={onImportJobs}
        isImporting={isImporting}
        onOpenGoogleSheetsModal={onOpenGoogleSheetsModal}
      />

      {/* 2. Mobile Vertical Card List View */}
      <div className="block md:hidden divide-y divide-slate-100 bg-white">
        {filteredAndSortedJobs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <Inbox className="w-8 h-8 text-indigo-400 mx-auto" />
            <p className="font-semibold text-slate-600 text-sm">No matching job records found</p>
            <p className="text-xs text-slate-400">
              Try a different search, or change the status filter.
            </p>
          </div>
        ) : (
          filteredAndSortedJobs.map((job) => (
            <MobileJobCard
              key={job.id}
              job={job}
              onSelectJob={onSelectJob}
              onEditJob={onEditJob}
              onDeleteJob={onDeleteJob}
              onStatusChange={onStatusChange}
              openActionRowId={openActionRowId}
              onOpenActions={setOpenActionRowId}
              onCloseActions={closeRowActions}
              confirmDeleteId={confirmDeleteId}
              onSetConfirmDeleteId={setConfirmDeleteId}
            />
          ))
        )}
      </div>

      {/* 3. Desktop Table Grid View: Compact mode uses table-fixed with NO horizontal scroll */}
      <div
        className={
          viewMode === 'compact'
            ? 'hidden md:block min-h-[220px]'
            : 'hidden md:block overflow-x-auto min-h-[220px]'
        }
      >
        <table
          className={
            viewMode === 'compact'
              ? 'w-full text-left text-xs border-collapse table-fixed'
              : 'w-full text-left text-xs border-collapse min-w-[840px]'
          }
        >
          <SpreadsheetHeader
            viewMode={viewMode}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredAndSortedJobs.length === 0 ? (
              <tr>
                <td
                  colSpan={viewMode === 'full' ? 8 : 6}
                  className="px-4 py-16 text-center text-slate-400"
                >
                  <div className="max-w-sm mx-auto space-y-2 flex flex-col items-center">
                    <Inbox className="w-8 h-8 text-indigo-400" />
                    <p className="font-semibold text-slate-600">No matching job records found</p>
                    <p className="text-xs text-slate-400">
                      Try a different search, change the status filter, or paste a job posting URL above.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              <AnimatePresence initial={false}>
                {filteredAndSortedJobs.map((job) => (
                  <SpreadsheetRow
                    key={job.id}
                    job={job}
                    viewMode={viewMode}
                    onSelectJob={onSelectJob}
                    onEditJob={onEditJob}
                    onDeleteJob={onDeleteJob}
                    onStatusChange={onStatusChange}
                    openActionRowId={openActionRowId}
                    onOpenActions={setOpenActionRowId}
                    onCloseActions={closeRowActions}
                    confirmDeleteId={confirmDeleteId}
                    onSetConfirmDeleteId={setConfirmDeleteId}
                  />
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {/* 4. Technical Stats Status Bar */}
      <div className="px-4 py-2.5 border-t border-slate-200/80 bg-slate-50/90 rounded-b-2xl flex flex-wrap items-center justify-between gap-y-2 gap-x-4 text-[11px] text-slate-500">
        {/* Left: Row Count & Active Filter Indicator */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700">
            Showing <strong className="text-slate-900 font-bold">{filteredAndSortedJobs.length}</strong> of{' '}
            <strong className="text-slate-900 font-bold">{jobs.length}</strong> jobs
          </span>
          {searchQuery && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 truncate max-w-[180px]">
              &ldquo;{searchQuery}&rdquo;
            </span>
          )}
        </div>

        {/* Right: Technical Metrics Cluster */}
        <div className="flex items-center gap-3.5 sm:gap-4 flex-wrap text-slate-500">
          {/* Google Sheets Sync Status */}
          {googleSheetsProps && (
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              {googleSheetsProps.connectedSheet ? (
                <button
                  type="button"
                  onClick={googleSheetsProps.onOpenModal}
                  className="hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1 font-medium text-slate-600"
                  title={`Google Sheet: ${googleSheetsProps.connectedSheet.name}`}
                >
                  <span>
                    Sheets: {googleSheetsProps.syncStatus === 'syncing' ? 'Syncing...' : 'Synced'}
                  </span>
                  <span className="text-slate-400">
                    ({formatLastSynced(googleSheetsProps.lastSyncedAt)})
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={googleSheetsProps.onOpenModal}
                  className="hover:text-indigo-600 hover:underline cursor-pointer font-medium text-slate-500"
                >
                  Connect Sheets
                </button>
              )}
              {googleSheetsProps.connectedSheet && googleSheetsProps.onSyncNow && (
                <button
                  type="button"
                  onClick={() => googleSheetsProps.onSyncNow?.()}
                  disabled={googleSheetsProps.syncStatus === 'syncing'}
                  title="Sync with Google Sheets now"
                  className="p-0.5 text-slate-400 hover:text-emerald-600 rounded transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${
                      googleSheetsProps.syncStatus === 'syncing' ? 'animate-spin text-emerald-600' : ''
                    }`}
                  />
                </button>
              )}
            </div>
          )}

          {/* Last Updated Timestamp */}
          <div className="flex items-center gap-1 text-slate-400">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Updated {lastUpdatedText}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
