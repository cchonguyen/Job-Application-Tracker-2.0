import { describe, expect, it } from 'vitest';
import { cycleTriState } from '../../components/FilterBar';
import {
  countActiveSpreadsheetFilters,
  extractSpreadsheetFilterOptions,
  isDefaultStatusSelection,
  matchesSpreadsheetFilters,
  SpreadsheetFilterState,
} from '../../components/spreadsheet/useSpreadsheetFilter';
import { DEFAULT_VISIBLE_STATUSES } from '../statusMeta';
import type { JobRecord } from '../../types';

const makeJob = (partial: Partial<JobRecord>): JobRecord => ({
  id: 'job_' + Math.random().toString(36).slice(2),
  company: 'Acme',
  jobTitle: 'Software Engineer',
  location: 'Remote',
  salary: '',
  salaryMin: null,
  salaryMax: null,
  status: 'Applied',
  dateApplied: '2026-09-15',
  dateAdded: '2026-09-15',
  createdAt: '2026-09-15T00:00:00.000Z',
  industry: 'Tech',
  summary: 'A job',
  url: 'https://example.com/job',
  notes: '',
  companyMetadata: {},
  positionMetadata: { requiredSkills: [] },
  ...partial,
});

const makeFilterState = (partial: Partial<SpreadsheetFilterState> = {}): SpreadsheetFilterState => ({
  searchQuery: '',
  selectedStatuses: new Set(DEFAULT_VISIBLE_STATUSES),
  workArrangement: '',
  industry: '',
  location: '',
  seniority: '',
  salary: 'any',
  notes: 'any',
  needsReview: 'any',
  ...partial,
});

describe('cycleTriState', () => {
  it('cycles any -> yes -> no -> any', () => {
    const first = cycleTriState('any');
    expect(first).toBe('yes');
    const second = cycleTriState(first);
    expect(second).toBe('no');
    const third = cycleTriState(second);
    expect(third).toBe('any');
  });
});

describe('extractSpreadsheetFilterOptions', () => {
  it('deduplicates, cleans city names, sorts, and omits empty values', () => {
    const jobs: JobRecord[] = [
      makeJob({
        industry: 'Fintech',
        location: 'Hybrid - San Francisco, CA',
        positionMetadata: { requiredSkills: [], seniority: 'Senior' },
      }),
      makeJob({
        industry: '  Fintech ',
        location: 'Remote (US)',
        positionMetadata: { requiredSkills: [], seniority: 'Staff' },
      }),
      makeJob({
        industry: 'AI',
        location: 'Onsite - New York, NY',
        positionMetadata: { requiredSkills: [], seniority: 'Senior' },
      }),
      makeJob({
        industry: '',
        location: 'Remote',
        positionMetadata: { requiredSkills: [] },
      }),
    ];

    const options = extractSpreadsheetFilterOptions(jobs);
    expect(options.industries).toEqual(['AI', 'Fintech']);
    expect(options.locations).toEqual(['New York, NY', 'San Francisco, CA']);
    expect(options.seniorities).toEqual(['Senior', 'Staff']);
  });
});

describe('isDefaultStatusSelection and countActiveSpreadsheetFilters', () => {
  it('detects default status selection and counts active filters accurately', () => {
    const base = makeFilterState();
    expect(isDefaultStatusSelection(base.selectedStatuses)).toBe(true);
    expect(countActiveSpreadsheetFilters(base)).toBe(0);

    const withAll = makeFilterState({
      selectedStatuses: new Set(['Saved', 'Applied', 'Interviewing', 'Offer', 'Accepted', 'Rejected', 'Declined']),
      workArrangement: 'Remote',
      industry: 'AI',
      salary: 'yes',
      notes: 'no',
    });
    expect(isDefaultStatusSelection(withAll.selectedStatuses)).toBe(false);
    expect(countActiveSpreadsheetFilters(withAll)).toBe(5);
  });
});

describe('matchesSpreadsheetFilters', () => {
  const remoteSeniorWithSalary = makeJob({
    company: 'Linear',
    jobTitle: 'Product Engineer',
    location: 'Remote - San Francisco, CA',
    industry: 'Developer Tools',
    salary: '$180k - $220k',
    salaryMin: 180000,
    salaryMax: 220000,
    status: 'Interviewing',
    notes: 'Referred by Alex',
    extractedVia: 'gemini-url-context',
    positionMetadata: { requiredSkills: ['TypeScript'], seniority: 'Senior' },
  });

  const hybridFallbackWithoutNotes = makeJob({
    company: 'Stripe',
    jobTitle: 'Backend Engineer',
    location: 'Hybrid - Seattle, WA',
    industry: 'Fintech',
    salary: '',
    salaryMin: null,
    salaryMax: null,
    status: 'Saved',
    notes: '',
    extractedVia: 'deterministic-fallback',
    positionMetadata: { requiredSkills: ['Go'], seniority: 'Mid' },
  });

  it('filters by work arrangement', () => {
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ workArrangement: 'Remote' }))).toBe(true);
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ workArrangement: 'Hybrid' }))).toBe(false);
    expect(matchesSpreadsheetFilters(hybridFallbackWithoutNotes, makeFilterState({ workArrangement: 'Hybrid' }))).toBe(true);
  });

  it('filters by industry, location, and seniority', () => {
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ industry: 'Developer Tools' }))).toBe(true);
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ industry: 'Fintech' }))).toBe(false);
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ location: 'San Francisco, CA' }))).toBe(true);
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ location: 'Seattle, WA' }))).toBe(false);
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ seniority: 'Senior' }))).toBe(true);
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ seniority: 'Mid' }))).toBe(false);
  });

  it('filters by tri-state salary, notes, and needsReview toggles', () => {
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ salary: 'yes' }))).toBe(true);
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ salary: 'no' }))).toBe(false);
    expect(matchesSpreadsheetFilters(hybridFallbackWithoutNotes, makeFilterState({ salary: 'no' }))).toBe(true);

    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ notes: 'yes' }))).toBe(true);
    expect(matchesSpreadsheetFilters(hybridFallbackWithoutNotes, makeFilterState({ notes: 'no' }))).toBe(true);
    expect(matchesSpreadsheetFilters(hybridFallbackWithoutNotes, makeFilterState({ notes: 'yes' }))).toBe(false);

    expect(matchesSpreadsheetFilters(hybridFallbackWithoutNotes, makeFilterState({ needsReview: 'yes' }))).toBe(true);
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ needsReview: 'no' }))).toBe(true);
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, makeFilterState({ needsReview: 'yes' }))).toBe(false);
  });

  it('combines search query, status, facets, and tri-state toggles', () => {
    const combined = makeFilterState({
      searchQuery: 'product',
      workArrangement: 'Remote',
      industry: 'Developer Tools',
      location: 'San Francisco, CA',
      seniority: 'Senior',
      salary: 'yes',
      notes: 'yes',
      needsReview: 'no',
    });
    expect(matchesSpreadsheetFilters(remoteSeniorWithSalary, combined)).toBe(true);
    expect(matchesSpreadsheetFilters(hybridFallbackWithoutNotes, combined)).toBe(false);
  });

  it('searches across all statuses when searchQuery is non-empty while still respecting facet and tri-state filters', () => {
    const rejectedRemote = makeJob({
      company: 'Vercel',
      jobTitle: 'Frontend Engineer',
      location: 'Remote',
      status: 'Rejected',
      salary: '$160k',
      salaryMin: 160000,
    });
    expect(
      matchesSpreadsheetFilters(
        rejectedRemote,
        makeFilterState({ searchQuery: 'Vercel' })
      )
    ).toBe(true);
    expect(
      matchesSpreadsheetFilters(
        rejectedRemote,
        makeFilterState({ searchQuery: 'Vercel', workArrangement: 'Hybrid' })
      )
    ).toBe(false);
    expect(
      matchesSpreadsheetFilters(
        rejectedRemote,
        makeFilterState({ searchQuery: 'Vercel', salary: 'no' })
      )
    ).toBe(false);
  });
});
