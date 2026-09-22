/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { HeaderActionPanel } from './components/HeaderActionPanel';
import { AnalyticsBar } from './components/AnalyticsBar';
import { JobSpreadsheet } from './components/JobSpreadsheet';
import { JobDetailModal } from './components/JobDetailModal';
import { EditJobModal } from './components/EditJobModal';
import { AtsDiagnosticModal } from './components/AtsDiagnosticModal';
import { JobRecord, JobStatus } from './types';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const { theme, setMode, setAccent } = useTheme();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [editingJob, setEditingJob] = useState<JobRecord | null>(null);
  const [isAtsDebuggerOpen, setIsAtsDebuggerOpen] = useState(false);

  const [isImporting, setIsImporting] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Safe API helper that parses JSON and provides informative error diagnostics
  const safeFetchJson = async <T = any>(url: string, options?: RequestInit): Promise<T> => {
    const res = await fetch(url, options);
    const text = await res.text();
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      if (!res.ok) {
        throw new Error(`Server error (${res.status}): ${text.slice(0, 150) || res.statusText || 'Unknown response'}`);
      }
      throw new Error(`Unexpected server response format (HTTP ${res.status}): ${text.slice(0, 120)}`);
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.message || `Request failed with HTTP ${res.status}`);
    }

    return data as T;
  };

  // Fetch jobs on mount
  const fetchJobs = async () => {
    try {
      const data = await safeFetchJson<{ success: boolean; jobs?: JobRecord[] }>('/api/jobs');
      if (data.success && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error('Failed to load tracked jobs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Autonomous Ingest Handler
  const handleIngest = async ({
    url,
    manualText,
    status,
    notes,
  }: {
    url?: string;
    manualText?: string;
    status?: JobStatus;
    notes?: string;
  }) => {
    setIsIngesting(true);
    try {
      const data = await safeFetchJson<{
        success: boolean;
        job?: JobRecord;
        tierUsed?: string;
        error?: string;
      }>('/api/extract-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, manualText, status, notes }),
      });

      if (data.success && data.job) {
        setJobs((prev) => [data.job!, ...prev]);
        showToast(
          `Extracted ${data.job.company} (${data.job.jobTitle}) via ${data.tierUsed}! Added to spreadsheet.`,
          'success'
        );
      } else {
        throw new Error(data.error || 'Failed to extract job');
      }
    } catch (err: any) {
      showToast(err.message || 'Error occurred during autonomous ingestion', 'error');
      throw err;
    } finally {
      setIsIngesting(false);
    }
  };

  // Update Status
  const handleStatusChange = async (id: string, newStatus: JobStatus) => {
    // Optimistic UI update
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: newStatus } : j)));
    if (selectedJob && selectedJob.id === id) {
      setSelectedJob((prev) => (prev ? { ...prev, status: newStatus } : null));
    }

    try {
      const data = await safeFetchJson<{ success: boolean; job?: JobRecord; error?: string }>(
        `/api/jobs/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (!data.success || !data.job) {
        throw new Error(data.error || 'Failed to persist status change');
      }
      setJobs((prev) => prev.map((j) => (j.id === id ? data.job! : j)));
      if (selectedJob && selectedJob.id === id) {
        setSelectedJob(data.job);
      }
      showToast(`Status updated to "${newStatus}"`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
      // Revert on error
      fetchJobs();
    }
  };

  // Update Notes
  const handleUpdateNotes = async (id: string, notes: string) => {
    try {
      const data = await safeFetchJson<{ success: boolean; job?: JobRecord; error?: string }>(
        `/api/jobs/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        }
      );
      if (data.success) {
        setJobs((prev) =>
          prev.map((j) => (j.id === id ? (data.job ? data.job : { ...j, notes }) : j))
        );
        if (selectedJob && selectedJob.id === id) {
          setSelectedJob((prev) => (prev ? (data.job ? data.job : { ...prev, notes }) : null));
        }
        showToast('Notes saved successfully', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to save notes', 'error');
    }
  };

  // Update Date Applied from detail drawer
  const handleUpdateDateApplied = async (id: string, dateApplied: string | null) => {
    try {
      const data = await safeFetchJson<{ success: boolean; job?: JobRecord; error?: string }>(
        `/api/jobs/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateApplied }),
        }
      );
      if (!data.success || !data.job) {
        throw new Error(data.error || 'Failed to update date applied');
      }
      setJobs((prev) => prev.map((j) => (j.id === id ? data.job! : j)));
      if (selectedJob && selectedJob.id === id) {
        setSelectedJob(data.job);
      }
      showToast('Date applied updated', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update date applied', 'error');
    }
  };

  // Save Full Edit Updates
  const handleSaveEdit = async (id: string, updates: Partial<JobRecord>) => {
    try {
      const data = await safeFetchJson<{ success: boolean; job?: JobRecord; error?: string }>(
        `/api/jobs/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      );
      if (data.success && data.job) {
        setJobs((prev) => prev.map((j) => (j.id === id ? data.job! : j)));
        if (selectedJob && selectedJob.id === id) {
          setSelectedJob(data.job);
        }
        showToast('Application attributes updated successfully', 'success');
      } else {
        throw new Error(data.error || 'Failed to update record');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Delete Job
  const handleDeleteJob = async (id: string) => {
    try {
      const data = await safeFetchJson<{ success: boolean; error?: string }>(`/api/jobs/${id}`, {
        method: 'DELETE',
      });
      if (data.success) {
        setJobs((prev) => prev.filter((j) => j.id !== id));
        if (selectedJob && selectedJob.id === id) {
          setSelectedJob(null);
        }
        showToast('Job record deleted', 'success');
      } else {
        throw new Error(data.error || 'Failed to delete record');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Import jobs from exported JSON / CSV
  const handleImportJobs = async (jobsToImport: JobRecord[]) => {
    setIsImporting(true);
    try {
      const data = await safeFetchJson<{
        success: boolean;
        inserted?: number;
        updated?: number;
        jobs?: JobRecord[];
        error?: string;
      }>('/api/jobs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: jobsToImport }),
      });
      if (!data.success) {
        throw new Error(data.error || 'Import failed');
      }
      if (Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      } else {
        await fetchJobs();
      }
      showToast(
        `Imported ${data.inserted || 0} new, updated ${data.updated || 0} existing (${jobsToImport.length} total in file)`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to import jobs', 'error');
      throw err;
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white overflow-x-hidden max-w-full">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2.5 text-xs font-medium animate-in slide-in-from-bottom-5 duration-200 ${
            toast.type === 'success'
              ? 'bg-zinc-900 text-white border-zinc-700'
              : 'bg-rose-900 text-rose-100 border-rose-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Combined Header & URL Ingestion Section */}
      <HeaderActionPanel
        totalJobs={jobs.length}
        onOpenAtsDebugger={() => setIsAtsDebuggerOpen(true)}
        onIngest={handleIngest}
        isIngesting={isIngesting}
        themeMode={theme.mode}
        themeAccent={theme.accent}
        onThemeModeChange={setMode}
        onThemeAccentChange={setAccent}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 10-Column Spreadsheet Grid */}
        <JobSpreadsheet
          jobs={jobs}
          onStatusChange={handleStatusChange}
          onSelectJob={(job) => setSelectedJob(job)}
          onEditJob={(job) => setEditingJob(job)}
          onDeleteJob={handleDeleteJob}
          onImportJobs={handleImportJobs}
          isImporting={isImporting}
        />

        {/* Analytics Section */}
        <AnalyticsBar jobs={jobs} />
      </main>

      {/* Detail Inspection Drawer / Modal */}
      <JobDetailModal
        job={selectedJob}
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        onStatusChange={handleStatusChange}
        onEditClick={(job) => setEditingJob(job)}
        onDeleteClick={handleDeleteJob}
        onUpdateNotes={handleUpdateNotes}
        onUpdateDateApplied={handleUpdateDateApplied}
      />

      {/* Edit Job Modal */}
      <EditJobModal
        job={editingJob}
        isOpen={!!editingJob}
        onClose={() => setEditingJob(null)}
        onSave={handleSaveEdit}
      />

      {/* ATS Diagnostic & Test Suite Modal */}
      <AtsDiagnosticModal isOpen={isAtsDebuggerOpen} onClose={() => setIsAtsDebuggerOpen(false)} />
    </div>
  );
}

