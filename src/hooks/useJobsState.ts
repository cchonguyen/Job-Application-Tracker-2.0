import { useState, useEffect, useCallback } from 'react';
import { JobRecord, JobStatus, PendingDuplicateCandidate } from '../types';
import { apiFetch } from '../lib/apiClient';
import { needsManualReview } from '../lib/formatHelpers';

interface SafeFetchOptions extends RequestInit {}

async function safeFetchJson<T = any>(url: string, options?: SafeFetchOptions): Promise<T> {
  const res = await apiFetch(url, options);
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
}

export function useJobsState(showToast: (msg: string, type: 'success' | 'error' | 'warning') => void) {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicateCandidate | null>(null);

  const fetchJobs = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleIngest = async ({
    url,
    manualText,
    status,
    notes,
    confirmDuplicate,
  }: {
    url?: string;
    manualText?: string;
    status?: JobStatus;
    notes?: string;
    confirmDuplicate?: boolean;
  }) => {
    setIsIngesting(true);
    try {
      const data = await safeFetchJson<{
        success: boolean;
        job?: JobRecord;
        upgradedExistingStub?: boolean;
        tierUsed?: string;
        potentialDuplicate?: boolean;
        candidateJob?: JobRecord;
        duplicates?: any[];
        shortCircuited?: boolean;
        error?: string;
      }>('/api/extract-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, manualText, status, notes, confirmDuplicate }),
      });

      if (data.success && data.potentialDuplicate && data.candidateJob && Array.isArray(data.duplicates)) {
        setPendingDuplicate({
          candidateJob: data.candidateJob,
          duplicates: data.duplicates,
        });
        if (data.shortCircuited || needsManualReview(data.candidateJob.extractedVia)) {
          showToast(
            `Could not read the full posting, and it may be a duplicate of an application from the past 6 months. Review the comparison to continue.`,
            'warning'
          );
        } else {
          showToast(
            `Potential duplicate flagged: applied in the past 6 months. Review comparison to proceed.`,
            'error'
          );
        }
        return;
      }

      if (data.success && data.job) {
        if (data.upgradedExistingStub) {
          setJobs((prev) => prev.map((j) => (j.id === data.job!.id ? data.job! : j)));
          setPendingDuplicate(null);
          showToast(
            `Upgraded ${data.job.company} (${data.job.jobTitle}) in-place via ${data.tierUsed}`,
            'success'
          );
        } else if (data.shortCircuited || needsManualReview(data.job.extractedVia)) {
          setJobs((prev) => [data.job!, ...prev]);
          setPendingDuplicate(null);
          const companyLabel =
            data.job.company && data.job.company !== 'Unknown Company' ? data.job.company : 'Career portal';
          showToast(
            `Could not read the full posting from ${companyLabel}. Saved as "Needs review". Open the job page and click the one-click capture bookmark to complete it.`,
            'warning'
          );
        } else {
          setJobs((prev) => [data.job!, ...prev]);
          setPendingDuplicate(null);
          showToast(
            `Extracted ${data.job.company} (${data.job.jobTitle}) via ${data.tierUsed}. Added to spreadsheet.`,
            'success'
          );
        }
      } else {
        throw new Error(data.error || 'Failed to extract job');
      }
    } catch (err: any) {
      showToast(err.message || 'Could not add this job.', 'error');
      throw err;
    } finally {
      setIsIngesting(false);
    }
  };

  const handleConfirmDuplicate = async (candidateJob: JobRecord) => {
    setIsIngesting(true);
    try {
      const data = await safeFetchJson<{
        success: boolean;
        job?: JobRecord;
        error?: string;
      }>('/api/extract-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateJob, confirmDuplicate: true }),
      });

      if (data.success && data.job) {
        setJobs((prev) => [data.job!, ...prev]);
        setPendingDuplicate(null);
        showToast(
          `Added ${data.job.company} (${data.job.jobTitle}) to spreadsheet`,
          'success'
        );
      } else {
        throw new Error(data.error || 'Failed to save confirmed job');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to confirm job addition', 'error');
      throw err;
    } finally {
      setIsIngesting(false);
    }
  };

  const handleCancelDuplicate = () => {
    setPendingDuplicate(null);
    showToast('Application addition cancelled.', 'success');
  };

  const handleStatusChange = async (id: string, newStatus: JobStatus) => {
    // Optimistic UI update
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: newStatus } : j)));

    try {
      const data = await safeFetchJson<{ success: boolean; job?: JobRecord; error?: string }>(
        `/api/jobs/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (data.success && data.job) {
        setJobs((prev) => prev.map((j) => (j.id === id ? data.job! : j)));
        showToast(`Status updated to ${newStatus} for ${data.job.company}`, 'success');
      }
    } catch (err: any) {
      fetchJobs();
      showToast(`Failed to update status: ${err.message}`, 'error');
    }
  };

  const handleUpdateJob = async (updatedJob: JobRecord) => {
    // Optimistic UI update
    setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)));

    try {
      const data = await safeFetchJson<{ success: boolean; job?: JobRecord; error?: string }>(
        `/api/jobs/${updatedJob.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedJob),
        }
      );
      if (data.success && data.job) {
        setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? data.job! : j)));
        showToast(`Updated details for ${data.job.company}`, 'success');
      }
    } catch (err: any) {
      fetchJobs();
      showToast(`Failed to save edits: ${err.message}`, 'error');
    }
  };

  const handleDeleteJob = async (id: string) => {
    const jobToDelete = jobs.find((j) => j.id === id);
    setJobs((prev) => prev.filter((j) => j.id !== id));

    try {
      const data = await safeFetchJson<{ success: boolean; error?: string }>(`/api/jobs/${id}`, {
        method: 'DELETE',
      });
      if (data.success) {
        showToast(`Deleted ${jobToDelete?.company || 'job'} record`, 'success');
      }
    } catch (err: any) {
      fetchJobs();
      showToast(`Failed to delete job: ${err.message}`, 'error');
    }
  };

  const handleImportJobs = async (importedJobs: JobRecord[]) => {
    setIsImporting(true);
    try {
      const data = await safeFetchJson<{
        success: boolean;
        inserted: number;
        updated: number;
        total: number;
        jobs?: JobRecord[];
      }>('/api/jobs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: importedJobs }),
      });

      if (data.success && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
        showToast(
          `Imported ${data.inserted} new jobs, updated ${data.updated} existing records.`,
          'success'
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Import failed', 'error');
      throw err;
    } finally {
      setIsImporting(false);
    }
  };

  return {
    jobs,
    setJobs,
    isLoading,
    isIngesting,
    isImporting,
    fetchJobs,
    handleIngest,
    handleStatusChange,
    handleUpdateJob,
    handleDeleteJob,
    handleImportJobs,
    pendingDuplicate,
    setPendingDuplicate,
    handleConfirmDuplicate,
    handleCancelDuplicate,
  };
}
