import { JobRecord } from '../types';
import { parseSalaryRange, formatIntegerToK } from './salary';

export interface PipelineFunnel {
  saved: number;
  applied: number;
  interviewing: number;
  offer: number;
  accepted: number;
  rejected: number;
  declined: number;
  total: number;
  totalSubmitted: number;
  savedToAppliedRate: number;
  appliedToInterviewRate: number;
}

export interface CallbackMetrics {
  totalSubmitted: number;
  inScreeningOrInterview: number;
  awaitingResponse: number;
  rejectedCount: number;
  positiveResponses: number;
  callbackRate: number; // Positive response %: (interviewing + offers + accepted) / totalSubmitted
  responseRate: number; // Any response: (interviewing + offers + accepted + rejected + declined) / totalSubmitted
  benchmarkEvaluation: 'high' | 'solid' | 'building' | 'early';
  benchmarkLabel: string;
}

export interface StaleJobItem {
  id: string;
  company: string;
  jobTitle: string;
  dateApplied: string | null;
  daysWaiting: number;
  location: string;
}

export interface AgingBuckets {
  freshCount: number; // < 7 days
  reviewCount: number; // 7 - 14 days
  staleCount: number; // > 14 days
  totalAwaiting: number;
  averageDaysWaiting: number;
  staleJobs: StaleJobItem[]; // Sorted longest waiting first
}

export interface WeeklyMomentumItem {
  label: string; // e.g. "Sep 15 - Sep 21"
  weekStart: string; // YYYY-MM-DD
  count: number;
  isCurrentWeek: boolean;
}

export interface WeeklyMomentum {
  weeks: WeeklyMomentumItem[];
  thisWeekCount: number;
  weeklyAverage: number;
  maxWeeklyCount: number;
}

export interface SkillCount {
  skill: string;
  count: number;
  percentage: number;
}

export interface WorkModeCount {
  mode: 'Remote' | 'Hybrid' | 'On-site' | 'Unspecified';
  count: number;
  percentage: number;
}

export interface SalaryAnalytics {
  disclosedCount: number;
  disclosureRate: number;
  medianMin: number | null;
  medianMax: number | null;
  displayRange: string;
}

/**
 * Checks whether a job reached an interview at any point in its history
 */
export function hasInterviewed(job: JobRecord): boolean {
  if (job.status === 'Interviewing' || job.status === 'Offer' || job.status === 'Accepted') {
    return true;
  }
  const history = job.statusHistory || job.positionMetadata?.statusHistory || [];
  return history.some((h) => h.to === 'Interviewing' || h.to === 'Offer' || h.to === 'Accepted');
}

/**
 * Get effective date for application (dateApplied or createdAt fallback)
 */
export function getEffectiveAppliedDate(job: JobRecord): string | null {
  if (job.dateApplied && /^\d{4}-\d{2}-\d{2}$/.test(job.dateApplied.trim())) {
    return job.dateApplied.trim();
  }
  if (job.dateAdded && /^\d{4}-\d{2}-\d{2}$/.test(job.dateAdded.trim())) {
    return job.dateAdded.trim();
  }
  if (job.createdAt) {
    const match = job.createdAt.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Computes pipeline stage distribution and conversion rates
 */
export function calculatePipelineFunnel(jobs: JobRecord[]): PipelineFunnel {
  const saved = jobs.filter((j) => j.status === 'Saved').length;
  const applied = jobs.filter((j) => j.status === 'Applied').length;
  const interviewing = jobs.filter((j) => j.status === 'Interviewing').length;
  const offer = jobs.filter((j) => j.status === 'Offer').length;
  const accepted = jobs.filter((j) => j.status === 'Accepted').length;
  const rejected = jobs.filter((j) => j.status === 'Rejected').length;
  const declined = jobs.filter((j) => j.status === 'Declined').length;

  const total = jobs.length;
  const totalSubmitted = applied + interviewing + offer + accepted + rejected + declined;

  const savedToAppliedRate =
    saved + totalSubmitted > 0 ? Math.round((totalSubmitted / (saved + totalSubmitted)) * 100) : 0;

  const positiveReached = jobs.filter((j) => j.status !== 'Saved' && hasInterviewed(j)).length;
  const appliedToInterviewRate =
    totalSubmitted > 0 ? Math.round((positiveReached / totalSubmitted) * 100) : 0;

  return {
    saved,
    applied,
    interviewing,
    offer,
    accepted,
    rejected,
    declined,
    total,
    totalSubmitted,
    savedToAppliedRate,
    appliedToInterviewRate,
  };
}

/**
 * Computes callback velocity and response rate
 */
export function calculateCallbackMetrics(jobs: JobRecord[]): CallbackMetrics {
  const submittedJobs = jobs.filter((j) => j.status !== 'Saved');
  const totalSubmitted = submittedJobs.length;

  const awaitingResponse = submittedJobs.filter((j) => j.status === 'Applied').length;
  const inScreeningOrInterview = submittedJobs.filter((j) => j.status === 'Interviewing').length;
  const rejectedCount = submittedJobs.filter((j) => j.status === 'Rejected').length;

  // Positive responses: reached Interviewing, Offer, or Accepted
  const positiveResponses = submittedJobs.filter((j) => hasInterviewed(j)).length;

  const callbackRate =
    totalSubmitted > 0 ? Math.round((positiveResponses / totalSubmitted) * 100) : 0;

  // Responded means company either interviewed or sent a decision/rejection
  const respondedJobs = submittedJobs.filter((j) => j.status !== 'Applied');
  const responseRate =
    totalSubmitted > 0 ? Math.round((respondedJobs.length / totalSubmitted) * 100) : 0;

  let benchmarkEvaluation: CallbackMetrics['benchmarkEvaluation'] = 'building';
  let benchmarkLabel = 'Gathering application data';

  if (totalSubmitted < 5) {
    benchmarkEvaluation = 'early';
    benchmarkLabel = 'Early sample (< 5 applications)';
  } else if (callbackRate >= 15) {
    benchmarkEvaluation = 'high';
    benchmarkLabel = 'Strong callback pace (> 15%)';
  } else if (callbackRate >= 8) {
    benchmarkEvaluation = 'solid';
    benchmarkLabel = 'Healthy industry rate (8-15%)';
  } else {
    benchmarkEvaluation = 'building';
    benchmarkLabel = 'Building momentum (< 8%)';
  }

  return {
    totalSubmitted,
    inScreeningOrInterview,
    awaitingResponse,
    rejectedCount,
    positiveResponses,
    callbackRate,
    responseRate,
    benchmarkEvaluation,
    benchmarkLabel,
  };
}

/**
 * Computes days waiting for jobs currently in "Applied" status
 */
export function calculateAgingBuckets(jobs: JobRecord[], now = new Date()): AgingBuckets {
  const appliedJobs = jobs.filter((j) => j.status === 'Applied');
  const nowMs = now.getTime();

  let freshCount = 0; // <= 6 days
  let reviewCount = 0; // 7 - 14 days
  let staleCount = 0; // > 14 days
  let totalDays = 0;
  const staleJobs: StaleJobItem[] = [];

  appliedJobs.forEach((job) => {
    const dateStr = getEffectiveAppliedDate(job);
    let daysWaiting = 0;

    if (dateStr) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const appDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const diffMs = nowMs - appDate.getTime();
        daysWaiting = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }
    }

    totalDays += daysWaiting;

    if (daysWaiting <= 6) {
      freshCount++;
    } else if (daysWaiting <= 14) {
      reviewCount++;
    } else {
      staleCount++;
      staleJobs.push({
        id: job.id,
        company: job.company,
        jobTitle: job.jobTitle,
        dateApplied: dateStr,
        daysWaiting,
        location: job.location,
      });
    }
  });

  staleJobs.sort((a, b) => b.daysWaiting - a.daysWaiting);

  const totalAwaiting = appliedJobs.length;
  const averageDaysWaiting =
    totalAwaiting > 0 ? Math.round((totalDays / totalAwaiting) * 10) / 10 : 0;

  return {
    freshCount,
    reviewCount,
    staleCount,
    totalAwaiting,
    averageDaysWaiting,
    staleJobs,
  };
}

/**
 * Computes weekly momentum for the last N weeks
 */
export function calculateWeeklyMomentum(
  jobs: JobRecord[],
  weeksCount = 6,
  now = new Date()
): WeeklyMomentum {
  // Normalized to start of current week (Monday)
  const currentDay = now.getDay();
  // Monday is 1; if Sunday (0), offset is -6
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  currentMonday.setHours(0, 0, 0, 0);

  const weeks: WeeklyMomentumItem[] = [];

  for (let i = weeksCount - 1; i >= 0; i--) {
    const weekStart = new Date(currentMonday);
    weekStart.setDate(currentMonday.getDate() - i * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const startMonth = weekStart.toLocaleString('default', { month: 'short' });
    const endMonth = weekEnd.toLocaleString('default', { month: 'short' });
    const label =
      startMonth === endMonth
        ? `${startMonth} ${weekStart.getDate()}–${weekEnd.getDate()}`
        : `${startMonth} ${weekStart.getDate()}–${endMonth} ${weekEnd.getDate()}`;

    const weekStartIso = weekStart.toISOString().split('T')[0];

    weeks.push({
      label,
      weekStart: weekStartIso,
      count: 0,
      isCurrentWeek: i === 0,
    });
  }

  // Count submitted applications in each week bucket
  const submittedJobs = jobs.filter((j) => j.status !== 'Saved');

  submittedJobs.forEach((job) => {
    const dateStr = getEffectiveAppliedDate(job);
    if (!dateStr) return;

    const parts = dateStr.split('-');
    if (parts.length !== 3) return;
    const appDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();

    for (let i = 0; i < weeks.length; i++) {
      const partsStart = weeks[i].weekStart.split('-');
      const wStart = new Date(
        Number(partsStart[0]),
        Number(partsStart[1]) - 1,
        Number(partsStart[2])
      ).getTime();
      const wEnd = wStart + 7 * 86400000;

      if (appDate >= wStart && appDate < wEnd) {
        weeks[i].count++;
        break;
      }
    }
  });

  const thisWeekCount = weeks[weeks.length - 1]?.count || 0;
  const totalInPeriod = weeks.reduce((sum, w) => sum + w.count, 0);
  const weeklyAverage = Math.round((totalInPeriod / weeksCount) * 10) / 10;
  const maxWeeklyCount = Math.max(1, ...weeks.map((w) => w.count));

  return {
    weeks,
    thisWeekCount,
    weeklyAverage,
    maxWeeklyCount,
  };
}

/**
 * Extracts and ranks in-demand skills from tracked jobs
 */
export function calculateSkillsIntelligence(jobs: JobRecord[], topN = 8): SkillCount[] {
  const counts: Record<string, number> = {};

  jobs.forEach((job) => {
    const skills = job.positionMetadata?.requiredSkills;
    if (Array.isArray(skills)) {
      skills.forEach((raw) => {
        if (!raw || typeof raw !== 'string') return;
        const trimmed = raw.trim();
        if (trimmed.length > 1) {
          // Normalize capitalization key
          const key = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
          counts[key] = (counts[key] || 0) + 1;
        }
      });
    }
  });

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  const total = jobs.length || 1;

  return sorted.map(([skill, count]) => ({
    skill,
    count,
    percentage: Math.round((count / total) * 100),
  }));
}

/**
 * Computes breakdown of remote vs hybrid vs on-site work
 */
export function calculateWorkModeDistribution(jobs: JobRecord[]): WorkModeCount[] {
  let remote = 0;
  let hybrid = 0;
  let onsite = 0;
  let unspecified = 0;

  jobs.forEach((j) => {
    const loc = (j.location || '').toLowerCase().trim();
    if (!loc || loc.includes('not listed') || loc.includes('unspecified') || loc === '—') {
      unspecified++;
    } else if (loc.includes('remote')) {
      remote++;
    } else if (loc.includes('hybrid')) {
      hybrid++;
    } else {
      onsite++;
    }
  });

  const total = jobs.length || 1;

  const modes: WorkModeCount[] = [
    { mode: 'Remote', count: remote, percentage: Math.round((remote / total) * 100) },
    { mode: 'Hybrid', count: hybrid, percentage: Math.round((hybrid / total) * 100) },
    { mode: 'On-site', count: onsite, percentage: Math.round((onsite / total) * 100) },
    { mode: 'Unspecified', count: unspecified, percentage: Math.round((unspecified / total) * 100) },
  ];

  return modes.filter((item) => item.count > 0);
}

/**
 * Computes salary transparency rate and median range
 */
export function calculateSalaryAnalytics(jobs: JobRecord[]): SalaryAnalytics {
  const mins: number[] = [];
  const maxs: number[] = [];
  let disclosedCount = 0;

  jobs.forEach((j) => {
    let min = j.salaryMin ?? null;
    let max = j.salaryMax ?? null;

    if (min === null && max === null && j.salary) {
      const parsed = parseSalaryRange(j.salary);
      if (parsed.isReal) {
        min = parsed.salaryMin;
        max = parsed.salaryMax;
      }
    }

    if (min !== null || max !== null) {
      disclosedCount++;
      if (min !== null) mins.push(min);
      if (max !== null) maxs.push(max);
    }
  });

  const total = jobs.length;
  const disclosureRate = total > 0 ? Math.round((disclosedCount / total) * 100) : 0;

  const median = (arr: number[]): number | null => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  };

  const medianMin = median(mins);
  const medianMax = median(maxs);

  let displayRange = 'No salary data';
  if (medianMin !== null && medianMax !== null) {
    displayRange = `${formatIntegerToK(medianMin)} – ${formatIntegerToK(medianMax)}`;
  } else if (medianMin !== null) {
    displayRange = `${formatIntegerToK(medianMin)}+`;
  } else if (medianMax !== null) {
    displayRange = `Up to ${formatIntegerToK(medianMax)}`;
  }

  return {
    disclosedCount,
    disclosureRate,
    medianMin,
    medianMax,
    displayRange,
  };
}
