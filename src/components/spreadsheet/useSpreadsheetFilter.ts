import { useState, useMemo } from 'react';
import { JobRecord, JobStatus } from '../../types';
import { DEFAULT_VISIBLE_STATUSES, STATUS_ORDER } from '../../lib/statusMeta';

export type SortField = 'dateApplied' | 'company' | 'jobTitle' | 'salary';
export type SortOrder = 'asc' | 'desc';

export const DEFAULT_SORT_FIELD: SortField = 'dateApplied';
export const DEFAULT_SORT_ORDER: SortOrder = 'desc';

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
        if (!selectedStatuses.has(job.status)) {
          return false;
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          job.company.toLowerCase().includes(q) ||
          job.jobTitle.toLowerCase().includes(q) ||
          (job.team && job.team.toLowerCase().includes(q)) ||
          job.location.toLowerCase().includes(q) ||
          job.industry.toLowerCase().includes(q) ||
          (job.notes && job.notes.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortField === 'dateApplied') {
          const dateA = a.dateApplied ? new Date(a.dateApplied).getTime() : 0;
          const dateB = b.dateApplied ? new Date(b.dateApplied).getTime() : 0;
          comp = dateA - dateB;
        } else if (sortField === 'salary') {
          const minA = typeof a.salaryMin === 'number' ? a.salaryMin : 0;
          const minB = typeof b.salaryMin === 'number' ? b.salaryMin : 0;
          comp = minA - minB;
        } else {
          comp = a[sortField].localeCompare(b[sortField]);
        }
        return sortOrder === 'asc' ? comp : -comp;
      });
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
