import { useState, useMemo } from 'react';
import { JobRecord, JobStatus } from '../../types';
import { DEFAULT_VISIBLE_STATUSES, STATUS_ORDER } from '../../lib/statusMeta';
import { jobMatchesSearch } from '../../lib/jobSearch';
import {
  formatMicroSalary,
  getCleanCityLocation,
  getWorkArrangementMeta,
  needsManualReview,
  WorkArrangementType,
} from '../../lib/formatHelpers';
import type { TriStateFilter } from '../FilterBar';

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

export interface SpreadsheetFilterState {
  searchQuery: string;
  selectedStatuses: Set<JobStatus>;
  workArrangement: WorkArrangementType | '';
  industry: string;
  location: string;
  seniority: string;
  salary: TriStateFilter;
  notes: TriStateFilter;
  needsReview: TriStateFilter;
}

export interface SpreadsheetFilterOptions {
  industries: string[];
  locations: string[];
  seniorities: string[];
}

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

export function isDefaultStatusSelection(selectedStatuses: Set<JobStatus>): boolean {
  return (
    selectedStatuses.size === DEFAULT_VISIBLE_STATUSES.length &&
    DEFAULT_VISIBLE_STATUSES.every((status) => selectedStatuses.has(status))
  );
}

export function countActiveSpreadsheetFilters(
  state: Omit<SpreadsheetFilterState, 'searchQuery'>
): number {
  let count = 0;
  if (!isDefaultStatusSelection(state.selectedStatuses)) count += 1;
  if (state.workArrangement) count += 1;
  if (state.industry) count += 1;
  if (state.location) count += 1;
  if (state.seniority) count += 1;
  if (state.salary !== 'any') count += 1;
  if (state.notes !== 'any') count += 1;
  if (state.needsReview !== 'any') count += 1;
  return count;
}

export function extractSpreadsheetFilterOptions(jobs: JobRecord[]): SpreadsheetFilterOptions {
  const industries = new Set<string>();
  const locations = new Set<string>();
  const seniorities = new Set<string>();

  for (const job of jobs) {
    const ind = (job.industry || '').trim();
    if (ind) industries.add(ind);

    const city = getCleanCityLocation(job.location);
    if (city) locations.add(city);

    const sen = (job.positionMetadata?.seniority || '').trim();
    if (sen) seniorities.add(sen);
  }

  return {
    industries: Array.from(industries).sort((a, b) => a.localeCompare(b)),
    locations: Array.from(locations).sort((a, b) => a.localeCompare(b)),
    seniorities: Array.from(seniorities).sort((a, b) => a.localeCompare(b)),
  };
}

function matchesTriState(value: boolean, filter: TriStateFilter): boolean {
  if (filter === 'yes') return value;
  if (filter === 'no') return !value;
  return true;
}

export function matchesSpreadsheetFilters(
  job: JobRecord,
  state: SpreadsheetFilterState
): boolean {
  // A typed search covers every status; the status filter applies only when not searching.
  if (state.searchQuery.trim()) {
    if (!jobMatchesSearch(job, state.searchQuery)) {
      return false;
    }
  } else if (!state.selectedStatuses.has(job.status)) {
    return false;
  }

  if (state.workArrangement) {
    const arrangement = getWorkArrangementMeta(job.location, job.positionMetadata).type;
    if (arrangement !== state.workArrangement) {
      return false;
    }
  }

  if (state.industry && (job.industry || '').trim() !== state.industry) {
    return false;
  }

  if (state.location && getCleanCityLocation(job.location) !== state.location) {
    return false;
  }

  if (state.seniority && (job.positionMetadata?.seniority || '').trim() !== state.seniority) {
    return false;
  }

  if (state.salary !== 'any') {
    const hasSalary = formatMicroSalary(job.salary, job.salaryMin, job.salaryMax).isReal;
    if (!matchesTriState(hasSalary, state.salary)) return false;
  }

  if (state.notes !== 'any') {
    const hasNotes = Boolean(job.notes && job.notes.trim().length > 0);
    if (!matchesTriState(hasNotes, state.notes)) return false;
  }

  if (state.needsReview !== 'any') {
    const isReview = needsManualReview(job.extractedVia);
    if (!matchesTriState(isReview, state.needsReview)) return false;
  }

  return true;
}

export function useSpreadsheetFilter(jobs: JobRecord[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<JobStatus>>(
    () => new Set(DEFAULT_VISIBLE_STATUSES)
  );
  const [workArrangement, setWorkArrangement] = useState<WorkArrangementType | ''>('');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');
  const [seniority, setSeniority] = useState('');
  const [salary, setSalary] = useState<TriStateFilter>('any');
  const [notes, setNotes] = useState<TriStateFilter>('any');
  const [needsReview, setNeedsReview] = useState<TriStateFilter>('any');
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

  const resetStatusesToDefault = () => {
    setSelectedStatuses(new Set(DEFAULT_VISIBLE_STATUSES));
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedStatuses(new Set(DEFAULT_VISIBLE_STATUSES));
    setWorkArrangement('');
    setIndustry('');
    setLocation('');
    setSeniority('');
    setSalary('any');
    setNotes('any');
    setNeedsReview('any');
  };

  const handleSort = (field: SortField) => {
    const next = getNextSortState(sortField, sortOrder, field);
    setSortField(next.field);
    setSortOrder(next.order);
  };

  const filterOptions = useMemo(() => extractSpreadsheetFilterOptions(jobs), [jobs]);

  const activeFilterCount = useMemo(
    () =>
      countActiveSpreadsheetFilters({
        selectedStatuses,
        workArrangement,
        industry,
        location,
        seniority,
        salary,
        notes,
        needsReview,
      }),
    [selectedStatuses, workArrangement, industry, location, seniority, salary, notes, needsReview]
  );

  const filteredAndSortedJobs = useMemo(() => {
    const state: SpreadsheetFilterState = {
      searchQuery,
      selectedStatuses,
      workArrangement,
      industry,
      location,
      seniority,
      salary,
      notes,
      needsReview,
    };
    return jobs
      .filter((job) => matchesSpreadsheetFilters(job, state))
      .sort((a, b) => compareJobsForSpreadsheet(a, b, sortField, sortOrder));
  }, [
    jobs,
    searchQuery,
    selectedStatuses,
    workArrangement,
    industry,
    location,
    seniority,
    salary,
    notes,
    needsReview,
    sortField,
    sortOrder,
  ]);

  return {
    searchQuery,
    setSearchQuery,
    selectedStatuses,
    handleToggleStatus,
    handleSelectAllStatuses,
    handleSelectNoneStatuses,
    resetStatusesToDefault,
    workArrangement,
    setWorkArrangement,
    industry,
    setIndustry,
    location,
    setLocation,
    seniority,
    setSeniority,
    salary,
    setSalary,
    notes,
    setNotes,
    needsReview,
    setNeedsReview,
    filterOptions,
    activeFilterCount,
    resetAllFilters,
    sortField,
    sortOrder,
    handleSort,
    filteredAndSortedJobs,
  };
}
