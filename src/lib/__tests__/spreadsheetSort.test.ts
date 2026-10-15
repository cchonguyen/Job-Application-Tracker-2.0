import { describe, expect, it } from 'vitest';
import {
  getNextSortState,
  DEFAULT_SORT_FIELD,
  DEFAULT_SORT_ORDER,
  STATUS_PRIORITY_ORDER,
  compareJobsForSpreadsheet,
  isStatusGroupingActive,
} from '../../components/spreadsheet/useSpreadsheetFilter';
import { JobRecord } from '../../types';

describe('Spreadsheet 3-click sort cycle and reset', () => {
  it('starts at default setting: dateApplied desc', () => {
    expect(DEFAULT_SORT_FIELD).toBe('dateApplied');
    expect(DEFAULT_SORT_ORDER).toBe('desc');
  });

  it('cycles company column: asc -> desc -> reset back to default setting (dateApplied desc)', () => {
    // 1st click on company: from default (dateApplied, desc)
    const click1 = getNextSortState('dateApplied', 'desc', 'company');
    expect(click1).toEqual({ field: 'company', order: 'asc' });

    // 2nd click on company: asc -> desc
    const click2 = getNextSortState(click1.field, click1.order, 'company');
    expect(click2).toEqual({ field: 'company', order: 'desc' });

    // 3rd click on company: desc -> reset back to default setting!
    const click3 = getNextSortState(click2.field, click2.order, 'company');
    expect(click3).toEqual({ field: 'dateApplied', order: 'desc' });

    // 4th click on company: should start clean cycle again (asc)
    const click4 = getNextSortState(click3.field, click3.order, 'company');
    expect(click4).toEqual({ field: 'company', order: 'asc' });
  });

  it('cycles jobTitle column: asc -> desc -> reset back to default setting', () => {
    const click1 = getNextSortState('dateApplied', 'desc', 'jobTitle');
    expect(click1).toEqual({ field: 'jobTitle', order: 'asc' });

    const click2 = getNextSortState(click1.field, click1.order, 'jobTitle');
    expect(click2).toEqual({ field: 'jobTitle', order: 'desc' });

    const click3 = getNextSortState(click2.field, click2.order, 'jobTitle');
    expect(click3).toEqual({ field: 'dateApplied', order: 'desc' });
  });

  it('cycles salary column: asc -> desc -> reset back to default setting', () => {
    const click1 = getNextSortState('dateApplied', 'desc', 'salary');
    expect(click1).toEqual({ field: 'salary', order: 'asc' });

    const click2 = getNextSortState(click1.field, click1.order, 'salary');
    expect(click2).toEqual({ field: 'salary', order: 'desc' });

    const click3 = getNextSortState(click2.field, click2.order, 'salary');
    expect(click3).toEqual({ field: 'dateApplied', order: 'desc' });
  });

  it('handles switching between different columns before 3rd click', () => {
    // Click 1 on company
    const clickCompany1 = getNextSortState('dateApplied', 'desc', 'company');
    expect(clickCompany1).toEqual({ field: 'company', order: 'asc' });

    // Switch to salary: should start at asc for salary
    const clickSalary1 = getNextSortState(clickCompany1.field, clickCompany1.order, 'salary');
    expect(clickSalary1).toEqual({ field: 'salary', order: 'asc' });

    // Click 2 on salary
    const clickSalary2 = getNextSortState(clickSalary1.field, clickSalary1.order, 'salary');
    expect(clickSalary2).toEqual({ field: 'salary', order: 'desc' });

    // Click 3 on salary: resets to default setting
    const clickSalary3 = getNextSortState(clickSalary2.field, clickSalary2.order, 'salary');
    expect(clickSalary3).toEqual({ field: 'dateApplied', order: 'desc' });
  });

  it('handles timeline (dateApplied) toggling between desc and asc', () => {
    // Initial is desc. Clicking dateApplied toggles to asc
    const toggle1 = getNextSortState('dateApplied', 'desc', 'dateApplied');
    expect(toggle1).toEqual({ field: 'dateApplied', order: 'asc' });

    // Clicking again toggles back to desc
    const toggle2 = getNextSortState(toggle1.field, toggle1.order, 'dateApplied');
    expect(toggle2).toEqual({ field: 'dateApplied', order: 'desc' });

    // When coming from another sorted column (e.g. company), 1st click on dateApplied sets it to desc
    const fromCompany = getNextSortState('company', 'asc', 'dateApplied');
    expect(fromCompany).toEqual({ field: 'dateApplied', order: 'desc' });
  });
});

describe('Status priority grouping and age sorting in table view', () => {
  const makeJob = (partial: Partial<JobRecord>): JobRecord => ({
    id: 'job_' + Math.random().toString(36).slice(2),
    company: 'Acme',
    jobTitle: 'Software Engineer',
    location: 'Remote',
    salary: '120k',
    salaryMin: 120000,
    salaryMax: 150000,
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

  it('enforces exact status order: Accepted, Offer, Interviewing, Applied, Saved', () => {
    expect(STATUS_PRIORITY_ORDER['Accepted']).toBeLessThan(STATUS_PRIORITY_ORDER['Offer']);
    expect(STATUS_PRIORITY_ORDER['Offer']).toBeLessThan(STATUS_PRIORITY_ORDER['Interviewing']);
    expect(STATUS_PRIORITY_ORDER['Interviewing']).toBeLessThan(STATUS_PRIORITY_ORDER['Applied']);
    expect(STATUS_PRIORITY_ORDER['Applied']).toBeLessThan(STATUS_PRIORITY_ORDER['Saved']);
    expect(STATUS_PRIORITY_ORDER['Saved']).toBeLessThan(STATUS_PRIORITY_ORDER['Rejected']);
    expect(STATUS_PRIORITY_ORDER['Rejected']).toBeLessThan(STATUS_PRIORITY_ORDER['Declined']);
  });

  it('shows Interviewing above Applied even if Applied is newer', () => {
    const appliedJob = makeJob({
      company: 'New Applied Corp',
      status: 'Applied',
      dateApplied: '2026-09-22', // Applied yesterday
    });

    const interviewingJob = makeJob({
      company: 'Older Interviewing Inc',
      status: 'Interviewing',
      dateApplied: '2026-09-01', // Applied 3 weeks ago
    });

    const jobs = [appliedJob, interviewingJob];
    const sorted = [...jobs].sort((a, b) => compareJobsForSpreadsheet(a, b, 'dateApplied', 'desc'));

    expect(sorted[0].company).toBe('Older Interviewing Inc');
    expect(sorted[1].company).toBe('New Applied Corp');
  });

  it('sorts a complete pipeline in order: Accepted -> Offer -> Interviewing -> Applied -> Saved', () => {
    const saved = makeJob({ company: 'Saved Co', status: 'Saved', dateAdded: '2026-09-20' });
    const applied = makeJob({ company: 'Applied Co', status: 'Applied', dateApplied: '2026-09-18' });
    const interviewing = makeJob({ company: 'Interviewing Co', status: 'Interviewing', dateApplied: '2026-09-10' });
    const offer = makeJob({ company: 'Offer Co', status: 'Offer', dateApplied: '2026-09-05' });
    const accepted = makeJob({ company: 'Accepted Co', status: 'Accepted', dateApplied: '2026-09-01' });

    const mixed = [saved, applied, interviewing, offer, accepted];
    const sorted = [...mixed].sort((a, b) => compareJobsForSpreadsheet(a, b, 'dateApplied', 'desc'));

    expect(sorted.map((j) => j.status)).toEqual([
      'Accepted',
      'Offer',
      'Interviewing',
      'Applied',
      'Saved',
    ]);
  });

  it('orders by age in each grouping (newest/youngest first by default)', () => {
    const appliedOld = makeJob({
      company: 'Old Applied',
      status: 'Applied',
      dateApplied: '2026-09-01',
    });
    const appliedNew = makeJob({
      company: 'New Applied',
      status: 'Applied',
      dateApplied: '2026-09-20',
    });

    const interviewingOld = makeJob({
      company: 'Old Interviewing',
      status: 'Interviewing',
      dateApplied: '2026-08-15',
    });
    const interviewingNew = makeJob({
      company: 'New Interviewing',
      status: 'Interviewing',
      dateApplied: '2026-09-10',
    });

    const mixed = [appliedOld, interviewingOld, appliedNew, interviewingNew];
    const sorted = [...mixed].sort((a, b) => compareJobsForSpreadsheet(a, b, 'dateApplied', 'desc'));

    // Status: Interviewing first (both), then Applied (both).
    // Within Interviewing: New Interviewing before Old Interviewing.
    // Within Applied: New Applied before Old Applied.
    expect(sorted.map((j) => j.company)).toEqual([
      'New Interviewing',
      'Old Interviewing',
      'New Applied',
      'Old Applied',
    ]);
  });

  it('drops status grouping when the timeline is flipped to oldest first', () => {
    const appliedOld = makeJob({
      company: 'Old Applied',
      status: 'Applied',
      dateApplied: '2026-09-01',
    });
    const appliedNew = makeJob({
      company: 'New Applied',
      status: 'Applied',
      dateApplied: '2026-09-20',
    });

    const interviewingOld = makeJob({
      company: 'Old Interviewing',
      status: 'Interviewing',
      dateApplied: '2026-08-15',
    });
    const interviewingNew = makeJob({
      company: 'New Interviewing',
      status: 'Interviewing',
      dateApplied: '2026-09-10',
    });

    const mixed = [appliedOld, interviewingOld, appliedNew, interviewingNew];
    const sorted = [...mixed].sort((a, b) => compareJobsForSpreadsheet(a, b, 'dateApplied', 'asc'));

    // Non-default sort: one flat list, oldest first across all statuses.
    expect(sorted.map((j) => j.company)).toEqual([
      'Old Interviewing',
      'Old Applied',
      'New Interviewing',
      'New Applied',
    ]);
  });
});

describe('Column sorts temporarily disable status grouping', () => {
  const makeJob = (partial: Partial<JobRecord>): JobRecord => ({
    id: 'job_' + Math.random().toString(36).slice(2),
    company: 'Acme',
    jobTitle: 'Software Engineer',
    location: 'Remote',
    salary: '120k',
    salaryMin: 120000,
    salaryMax: 150000,
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

  const jobs = [
    makeJob({ company: 'Delta', jobTitle: 'PM', status: 'Applied', salaryMin: 90000, dateApplied: '2026-09-20' }),
    makeJob({ company: 'Alpha', jobTitle: 'SRE', status: 'Rejected', salaryMin: 150000, dateApplied: '2026-09-01' }),
    makeJob({ company: 'Charlie', jobTitle: 'Engineer', status: 'Offer', salaryMin: 120000, dateApplied: '2026-09-10' }),
    makeJob({ company: 'Bravo', jobTitle: 'Designer', status: 'Interviewing', salaryMin: 100000, dateApplied: '2026-09-05' }),
  ];
  const sortBy = (field: Parameters<typeof compareJobsForSpreadsheet>[2], order: 'asc' | 'desc') =>
    [...jobs].sort((a, b) => compareJobsForSpreadsheet(a, b, field, order));

  it('groups only in the default sort', () => {
    expect(isStatusGroupingActive(DEFAULT_SORT_FIELD, DEFAULT_SORT_ORDER)).toBe(true);
    expect(isStatusGroupingActive('dateApplied', 'asc')).toBe(false);
    expect(isStatusGroupingActive('company', 'asc')).toBe(false);
    expect(isStatusGroupingActive('jobTitle', 'desc')).toBe(false);
    expect(isStatusGroupingActive('salary', 'asc')).toBe(false);
  });

  it('alphabetizes company across all statuses', () => {
    expect(sortBy('company', 'asc').map((j) => j.company)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    expect(sortBy('company', 'desc').map((j) => j.company)).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha']);
  });

  it('alphabetizes job title across all statuses', () => {
    expect(sortBy('jobTitle', 'asc').map((j) => j.jobTitle)).toEqual(['Designer', 'Engineer', 'PM', 'SRE']);
  });

  it('orders salary across all statuses', () => {
    expect(sortBy('salary', 'desc').map((j) => j.salaryMin)).toEqual([150000, 120000, 100000, 90000]);
  });

  it('restores grouping once the sort cycles back to default', () => {
    const third = getNextSortState('company', 'desc', 'company');
    expect(isStatusGroupingActive(third.field, third.order)).toBe(true);
    expect(sortBy(third.field, third.order).map((j) => j.status)).toEqual([
      'Offer',
      'Interviewing',
      'Applied',
      'Rejected',
    ]);
  });
});
