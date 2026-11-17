import { useState, useMemo } from 'react';
import { JobRecord, JobStatus } from '../../types';
import { DEFAULT_VISIBLE_STATUSES, STATUS_ORDER } from '../../lib/statusMeta';
import { jobMatchesSearch } from '../../lib/jobSearch';

export type SortField = 'dateApplied' | 'company' | 'jobTitle' | 'salary';
export type SortOrder = 'asc' | 'desc';

export const DEFAULT_SORT_FIELD: SortField = 'dateApplied';
export const DEFAULT_SORT_ORDER: SortOrder = 'desc';

/**
 * Priority order for table view grouping:
 * Accepted > Offer > Interviewing > Applied > Saved > Rejected > Declined
 */
export const STATUS_PRIORITY_ORDER: Record<JobStatus, number> = {
  Accepted: 0,
  Offer: 1,
  Interviewing: 2,
  Applied: 3,
  Saved: 4,
  Rejected: 5,
  Declined: 6,
};

export function getJobAgeTimestamp(job: JobRecord): number {
  const raw = job.dateApplied || job.dateAdded || job.createdAt;
  if (!raw) return 0;
  try {
    const d = new Date(raw);
    const time = d.getTime();
    return Number.isNaN(time) ? 0 : time;
  } catch {
    return 0;
  }
}

/**
 * Status groupings only apply in the default sort. Any user-toggled sort
 * (including flipping the timeline to oldest-first) orders the whole list
 * flat, so e.g. sorting by company alphabetizes across every status.
 */
export function isStatusGroupingActive(sortField: SortField, sortOrder: SortOrder): boolean {
  return sortField === DEFAULT_SORT_FIELD && sortOrder === DEFAULT_SORT_ORDER;
}

export function compareJobsForSpreadsheet(
  a: JobRecord,
  b: JobRecord,
  sortField: SortField,
  sortOrder: SortOrder
): number {
  // 1. Primary grouping by status pipeline order (default sort only):
  // Accepted -> Offer -> Interviewing -> Applied -> Saved -> Rejected -> Declined
  if (isStatusGroupingActive(sortField, sortOrder)) {
    const rankA = STATUS_PRIORITY_ORDER[a.status] ?? 99;
    const rankB = STATUS_PRIORITY_ORDER[b.status] ?? 99;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
  }

  // 2. Ordering by the selected column (within each grouping when grouped):
  if (sortField === 'dateApplied') {
    // Ordered by age in each grouping
    const timeA = getJobAgeTimestamp(a);
    const timeB = getJobAgeTimestamp(b);
    const timeComp = timeA - timeB;
    if (timeComp !== 0) {
      return sortOrder === 'asc' ? timeComp : -timeComp;
    }
    return a.company.localeCompare(b.company);
  }

  if (sortField === 'salary') {
    const minA = typeof a.salaryMin === 'number' ? a.salaryMin : 0;
    const minB = typeof b.salaryMin === 'number' ? b.salaryMin : 0;
    const comp = minA - minB;
    if (comp !== 0) {
      return sortOrder === 'asc' ? comp : -comp;
    }
    return a.company.localeCompare(b.company);
  }

  const comp = a[sortField].localeCompare(b[sortField]);
  if (comp !== 0) {
    return sortOrder === 'asc' ? comp : -comp;
  }

  // Secondary tie-breaker by age
  const timeA = getJobAgeTimestamp(a);
  const timeB = getJobAgeTimestamp(b);
  return timeB - timeA;
}

export function getNextSortState(
  currentField: SortField,
  currentOrder: SortOrder,
  clickedField: SortField
): { field: SortField; order: SortOrder } {
  if (clickedField !== currentField) {
    // 1st click on a new column
    return {
      field: clickedField,
      order: clickedField === 'dateApplied' ? 'desc' : 'asc',
    };
  }

  if (clickedField === 'dateApplied') {
    // Timeline toggles between desc (default) and asc
    return {
      field: 'dateApplied',
      order: currentOrder === 'desc' ? 'asc' : 'desc',
    };
  }

  // For non-default columns (company, jobTitle, salary):
  // 1st click: asc
  // 2nd click: desc
  // 3rd click: reset back to default setting
  if (currentOrder === 'asc') {
    return {
      field: clickedField,
      order: 'desc',
    };
  }

  return {
    field: DEFAULT_SORT_FIELD,
    order: DEFAULT_SORT_ORDER,
  };
}

export function useSpreadsheetFilter(jobs: JobRecord[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<JobStatus>>(
    () => new Set(DEFAULT_VISIBLE_STATUSES)
  );
  const [sortField, setSortField] = useState<SortField>(DEFAULT_SORT_FIELD);
  const [sortOrder, setSortOrder] = useState<SortOrder>(DEFAULT_SORT_ORDER);

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

  const handleSort = (field: SortField) => {
    const next = getNextSortState(sortField, sortOrder, field);
    setSortField(next.field);
    setSortOrder(next.order);
  };

  const filteredAndSortedJobs = useMemo(() => {
    return jobs
      .filter((job) => {
        // A typed search covers every status; the status filter applies only when not searching.
        if (!searchQuery.trim()) {
          return selectedStatuses.has(job.status);
        }
        return jobMatchesSearch(job, searchQuery);
      })
      .sort((a, b) => compareJobsForSpreadsheet(a, b, sortField, sortOrder));
  }, [jobs, selectedStatuses, searchQuery, sortField, sortOrder]);

  return {
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
  };
}
