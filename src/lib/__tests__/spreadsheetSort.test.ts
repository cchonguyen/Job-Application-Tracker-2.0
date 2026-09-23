import { describe, expect, it } from 'vitest';
import {
  getNextSortState,
  DEFAULT_SORT_FIELD,
  DEFAULT_SORT_ORDER,
} from '../../components/spreadsheet/useSpreadsheetFilter';

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
