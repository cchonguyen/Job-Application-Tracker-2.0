import { useState, useEffect } from 'react';
import { HeaderActionPanel } from './components/HeaderActionPanel';
import { AnalyticsBar } from './components/AnalyticsBar';
import { JobSpreadsheet } from './components/JobSpreadsheet';
import { JobDetailModal } from './components/JobDetailModal';
import { EditJobModal } from './components/EditJobModal';
import { AtsDiagnosticModal } from './components/AtsDiagnosticModal';
import { GoogleSheetsSyncModal } from './components/GoogleSheetsSyncModal';
import { DuplicateWarningModal } from './components/DuplicateWarningModal';
import { GmailSuggestionsModal } from './components/GmailSuggestionsModal';
import { useGoogleSheetsSync } from './hooks/useGoogleSheetsSync';
import { useJobsState } from './hooks/useJobsState';
import { JobRecord } from './types';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const { theme, setMode, setAccent } = useTheme();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 5500);
  };

  // Modularized centralized jobs & persistence state hook
  const {
    jobs,
    setJobs,
    isLoading,
    isIngesting,
    isImporting,
    handleIngest,
    handleStatusChange,
    handleUpdateJob,
    handleDeleteJob,
    handleImportJobs,
    pendingDuplicate,
    handleConfirmDuplicate,
    handleCancelDuplicate,
  } = useJobsState(showToast);

  // Modals state
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [editingJob, setEditingJob] = useState<JobRecord | null>(null);
  const [isAtsDebuggerOpen, setIsAtsDebuggerOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isGmailOpen, setIsGmailOpen] = useState(false);

  // Cross-tab synchronization via BroadcastChannel & localStorage
  useEffect(() => {
    const handleSync = (payload: { type?: string; job?: JobRecord }) => {
      if (!payload?.job?.id) return;
      const job = payload.job;
      setJobs((prev) => {
        const index = prev.findIndex((j) => j.id === job.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = job;
          return next;
        }
        return [job, ...prev];
      });
      setSelectedJob((prev) => (prev && prev.id === job.id ? job : prev));
      if (payload.type === 'job-upgraded') {
        showToast(`Job ${job.company} upgraded via 1-Click Capture!`, 'success');
      } else if (payload.type === 'job-saved') {
        showToast(`Job ${job.company} captured and added to tracker!`, 'success');
      }
    };

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('jat-jobs-sync');
        channel.onmessage = (event) => {
          handleSync(event.data);
        };
      }
    } catch (err) {
      console.warn('BroadcastChannel error:', err);
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'jat-sync-event' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          handleSync(data);
        } catch (err) {
          console.warn('Failed parsing jat-sync-event:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      if (channel) {
        channel.close();
      }
      window.removeEventListener('storage', handleStorage);
    };
  }, [setJobs]);

  // Google Sheets Synchronization Hook
  const sheetsSync = useGoogleSheetsSync(jobs);

  // Delegated Handlers with sync back to selectedJob modal
  const onStatusChangeWithModalSync = async (id: string, newStatus: any) => {
    await handleStatusChange(id, newStatus);
    if (selectedJob && selectedJob.id === id) {
      setSelectedJob((prev) => (prev ? { ...prev, status: newStatus } : null));
    }
  };

  const onUpdateNotes = async (id: string, notes: string) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    const updated = { ...job, notes };
    await handleUpdateJob(updated);
    if (selectedJob && selectedJob.id === id) {
      setSelectedJob(updated);
    }
  };

  const onUpdateDateApplied = async (id: string, dateApplied: string | null) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    const updated = { ...job, dateApplied };
    await handleUpdateJob(updated);
    if (selectedJob && selectedJob.id === id) {
      setSelectedJob(updated);
    }
  };

  const onSaveEdit = async (id: string, updates: Partial<JobRecord>) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    const updated = { ...job, ...updates };
    await handleUpdateJob(updated);
    if (selectedJob && selectedJob.id === id) {
      setSelectedJob(updated);
    }
  };

  const onDeleteWithModalSync = async (id: string) => {
    await handleDeleteJob(id);
    if (selectedJob && selectedJob.id === id) {
      setSelectedJob(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white overflow-x-clip max-w-full">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-medium animate-in slide-in-from-bottom-5 duration-200 ${
            toast.type === 'success'
              ? 'bg-zinc-900 text-white border-zinc-700'
              : toast.type === 'warning'
              ? 'bg-amber-950 text-amber-100 border-amber-800'
              : 'bg-rose-900 text-rose-100 border-rose-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle
              className={`w-4 h-4 shrink-0 ${
                toast.type === 'warning' ? 'text-amber-400' : 'text-rose-400'
              }`}
            />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Combined Header & URL Ingestion Section */}
      <HeaderActionPanel
        totalJobs={jobs.length}
        onOpenAtsDebugger={() => setIsAtsDebuggerOpen(true)}
        onOpenGmailSuggestions={() => setIsGmailOpen(true)}
        onIngest={handleIngest}
        isIngesting={isIngesting}
        themeMode={theme.mode}
        themeAccent={theme.accent}
        onThemeModeChange={setMode}
        onThemeAccentChange={setAccent}
        googleSheetsProps={{
          user: sheetsSync.user,
          hasToken: sheetsSync.hasToken,
          connectedSheet: sheetsSync.connectedSheet,
          autoSync: sheetsSync.autoSync,
          onAutoSyncChange: sheetsSync.setAutoSync,
          syncStatus: sheetsSync.syncStatus,
          lastSyncedAt: sheetsSync.lastSyncedAt,
          onSyncNow: async () => {
            const ok = await sheetsSync.syncNow(jobs);
            if (ok) {
              showToast('Google Sheet successfully synchronized!', 'success');
            } else if (sheetsSync.lastError) {
              showToast(sheetsSync.lastError, 'error');
            }
            return ok;
          },
          onOpenModal: () => setIsSheetsModalOpen(true),
        }}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Spreadsheet Grid */}
        <JobSpreadsheet
          jobs={jobs}
          onStatusChange={onStatusChangeWithModalSync}
          onSelectJob={(job) => setSelectedJob(job)}
          onEditJob={(job) => setEditingJob(job)}
          onDeleteJob={onDeleteWithModalSync}
          onImportJobs={handleImportJobs}
          isImporting={isImporting}
          onOpenGoogleSheetsModal={() => setIsSheetsModalOpen(true)}
          googleSheetsProps={{
            connectedSheet: sheetsSync.connectedSheet,
            syncStatus: sheetsSync.syncStatus,
            lastSyncedAt: sheetsSync.lastSyncedAt,
            onOpenModal: () => setIsSheetsModalOpen(true),
            onSyncNow: async () => {
              const ok = await sheetsSync.syncNow(jobs);
              if (ok) {
                showToast('Google Sheet successfully synchronized!', 'success');
              }
              return ok;
            },
          }}
        />

        {/* Analytics Section */}
        <AnalyticsBar jobs={jobs} onSelectJob={(job) => setSelectedJob(job)} />
      </main>

      {/* Detail Inspection Drawer / Modal */}
      <JobDetailModal
        job={selectedJob}
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        onStatusChange={onStatusChangeWithModalSync}
        onEditClick={(job) => setEditingJob(job)}
        onDeleteClick={onDeleteWithModalSync}
        onUpdateNotes={onUpdateNotes}
        onUpdateDateApplied={onUpdateDateApplied}
      />

      {/* Edit Job Modal */}
      <EditJobModal
        job={editingJob}
        isOpen={!!editingJob}
        onClose={() => setEditingJob(null)}
        onSave={onSaveEdit}
      />

      {/* ATS Diagnostic & Test Suite Modal */}
      <AtsDiagnosticModal isOpen={isAtsDebuggerOpen} onClose={() => setIsAtsDebuggerOpen(false)} />

      <GmailSuggestionsModal
        isOpen={isGmailOpen}
        onClose={() => setIsGmailOpen(false)}
        onApply={(id, status) => onStatusChangeWithModalSync(id, status)}
      />

      {/* Google Sheets Sync Modal */}
      <GoogleSheetsSyncModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        user={sheetsSync.user}
        hasToken={sheetsSync.hasToken}
        isLoggingIn={sheetsSync.isLoggingIn}
        connectedSheet={sheetsSync.connectedSheet}
        autoSync={sheetsSync.autoSync}
        onAutoSyncChange={sheetsSync.setAutoSync}
        syncStatus={sheetsSync.syncStatus}
        lastSyncedAt={sheetsSync.lastSyncedAt}
        lastError={sheetsSync.lastError}
        availableSheets={sheetsSync.availableSheets}
        isLoadingSheets={sheetsSync.isLoadingSheets}
        onLogin={sheetsSync.handleLogin}
        onLogout={sheetsSync.handleLogout}
        onFetchSheets={sheetsSync.fetchSheetsList}
        onCreateAndConnect={sheetsSync.createAndConnect}
        onConnectExisting={sheetsSync.connectExisting}
        onSyncNow={async () => {
          const ok = await sheetsSync.syncNow(jobs);
          if (ok) {
            showToast('Google Sheet successfully synchronized!', 'success');
          }
          return ok;
        }}
        onDisconnectSheet={sheetsSync.disconnectSheet}
        jobsCount={jobs.length}
      />

      {/* Duplicate Application Warning & Comparison Notification */}
      <DuplicateWarningModal
        isOpen={!!pendingDuplicate}
        candidateJob={pendingDuplicate?.candidateJob || null}
        duplicates={pendingDuplicate?.duplicates || []}
        isSubmitting={isIngesting}
        onContinue={handleConfirmDuplicate}
        onCancel={handleCancelDuplicate}
        onViewExisting={(existing) => {
          handleCancelDuplicate();
          setSelectedJob(existing);
        }}
      />
    </div>
  );
}
