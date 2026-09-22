import { describe, it, expect } from 'vitest';
import {
  calculatePipelineFunnel,
  calculateCallbackMetrics,
  calculateAgingBuckets,
  calculateWeeklyMomentum,
  calculateSkillsIntelligence,
  calculateWorkModeDistribution,
  calculateSalaryAnalytics,
  hasInterviewed,
} from '../analyticsHelpers';
import { JobRecord } from '../../types';

const mockBaseJob: JobRecord = {
  id: 'job-1',
  company: 'Acme Corp',
  jobTitle: 'Product Manager',
  location: 'Remote (US)',
  salary: '$140k - $180k',
  salaryMin: 140000,
  salaryMax: 180000,
  status: 'Applied',
  dateApplied: '2026-09-10',
  industry: 'Enterprise Software',
  summary: 'Job summary',
  url: 'https://example.com/job/1',
  companyMetadata: {},
  positionMetadata: {
    requiredSkills: ['Product Strategy', 'SQL', 'Agile'],
  },
  createdAt: '2026-09-10T12:00:00Z',
};

describe('analyticsHelpers', () => {
  describe('calculatePipelineFunnel', () => {
    it('handles empty jobs list', () => {
      const result = calculatePipelineFunnel([]);
      expect(result.total).toBe(0);
      expect(result.totalSubmitted).toBe(0);
      expect(result.savedToAppliedRate).toBe(0);
      expect(result.appliedToInterviewRate).toBe(0);
    });

    it('calculates counts and conversion rates properly', () => {
      const jobs: JobRecord[] = [
        { ...mockBaseJob, id: '1', status: 'Saved' },
        { ...mockBaseJob, id: '2', status: 'Applied' },
        { ...mockBaseJob, id: '3', status: 'Interviewing' },
        { ...mockBaseJob, id: '4', status: 'Offer' },
        { ...mockBaseJob, id: '5', status: 'Rejected' },
      ];
      const result = calculatePipelineFunnel(jobs);
      expect(result.total).toBe(5);
      expect(result.saved).toBe(1);
      expect(result.applied).toBe(1);
      expect(result.interviewing).toBe(1);
      expect(result.offer).toBe(1);
      expect(result.rejected).toBe(1);
      expect(result.totalSubmitted).toBe(4);
      // SavedToApplied = 4 submitted / 5 total = 80%
      expect(result.savedToAppliedRate).toBe(80);
      // AppliedToInterview = 2 positive / 4 submitted = 50%
      expect(result.appliedToInterviewRate).toBe(50);
    });
  });

  describe('calculateCallbackMetrics', () => {
    it('detects interview history even if now rejected', () => {
      const jobWithHistory: JobRecord = {
        ...mockBaseJob,
        status: 'Rejected',
        statusHistory: [
          { at: '2026-09-01T00:00:00Z', from: 'Applied', to: 'Interviewing' },
          { at: '2026-09-10T00:00:00Z', from: 'Interviewing', to: 'Rejected' },
        ],
      };
      expect(hasInterviewed(jobWithHistory)).toBe(true);

      const metrics = calculateCallbackMetrics([jobWithHistory]);
      expect(metrics.totalSubmitted).toBe(1);
      expect(metrics.callbackRate).toBe(100);
      expect(metrics.responseRate).toBe(100);
    });

    it('computes callback rates and benchmark ratings', () => {
      const jobs: JobRecord[] = [
        { ...mockBaseJob, id: '1', status: 'Applied' },
        { ...mockBaseJob, id: '2', status: 'Applied' },
        { ...mockBaseJob, id: '3', status: 'Applied' },
        { ...mockBaseJob, id: '4', status: 'Applied' },
        { ...mockBaseJob, id: '5', status: 'Interviewing' },
      ];
      const metrics = calculateCallbackMetrics(jobs);
      expect(metrics.totalSubmitted).toBe(5);
      expect(metrics.positiveResponses).toBe(1);
      // 1 / 5 = 20%
      expect(metrics.callbackRate).toBe(20);
      expect(metrics.benchmarkEvaluation).toBe('high');
    });
  });

  describe('calculateAgingBuckets', () => {
    it('categorizes aging correctly into fresh, review, and stale', () => {
      const refDate = new Date(2026, 8, 22); // 2026-09-22
      const jobs: JobRecord[] = [
        // 3 days ago -> fresh
        { ...mockBaseJob, id: '1', status: 'Applied', dateApplied: '2026-09-19' },
        // 10 days ago -> review
        { ...mockBaseJob, id: '2', status: 'Applied', dateApplied: '2026-09-12' },
        // 20 days ago -> stale
        { ...mockBaseJob, id: '3', status: 'Applied', dateApplied: '2026-09-02' },
        // Not applied status -> ignored in aging
        { ...mockBaseJob, id: '4', status: 'Interviewing', dateApplied: '2026-08-01' },
      ];

      const buckets = calculateAgingBuckets(jobs, refDate);
      expect(buckets.totalAwaiting).toBe(3);
      expect(buckets.freshCount).toBe(1);
      expect(buckets.reviewCount).toBe(1);
      expect(buckets.staleCount).toBe(1);
      expect(buckets.staleJobs.length).toBe(1);
      expect(buckets.staleJobs[0].id).toBe('3');
      expect(buckets.staleJobs[0].daysWaiting).toBe(20);
    });
  });

  describe('calculateWeeklyMomentum', () => {
    it('groups applications by week properly', () => {
      const refDate = new Date(2026, 8, 22); // Tuesday, Sep 22, 2026
      const jobs: JobRecord[] = [
        { ...mockBaseJob, id: '1', dateApplied: '2026-09-22' },
        { ...mockBaseJob, id: '2', dateApplied: '2026-09-21' },
        { ...mockBaseJob, id: '3', dateApplied: '2026-09-15' },
      ];
      const momentum = calculateWeeklyMomentum(jobs, 4, refDate);
      expect(momentum.weeks.length).toBe(4);
      expect(momentum.thisWeekCount).toBe(2);
      expect(momentum.weeks[3].isCurrentWeek).toBe(true);
    });
  });

  describe('calculateSkillsIntelligence', () => {
    it('ranks top skills across jobs', () => {
      const jobs: JobRecord[] = [
        {
          ...mockBaseJob,
          id: '1',
          positionMetadata: { requiredSkills: ['React', 'TypeScript', 'SQL'] },
        },
        {
          ...mockBaseJob,
          id: '2',
          positionMetadata: { requiredSkills: ['React', 'GraphQL'] },
        },
        {
          ...mockBaseJob,
          id: '3',
          positionMetadata: { requiredSkills: ['React', 'TypeScript'] },
        },
      ];
      const skills = calculateSkillsIntelligence(jobs, 3);
      expect(skills[0].skill).toBe('React');
      expect(skills[0].count).toBe(3);
      expect(skills[0].percentage).toBe(100);
      expect(skills[1].skill).toBe('TypeScript');
      expect(skills[1].count).toBe(2);
    });
  });

  describe('calculateWorkModeDistribution', () => {
    it('categorizes locations into remote, hybrid, onsite', () => {
      const jobs: JobRecord[] = [
        { ...mockBaseJob, id: '1', location: 'Remote - US' },
        { ...mockBaseJob, id: '2', location: 'Hybrid, San Francisco' },
        { ...mockBaseJob, id: '3', location: 'New York, NY' },
      ];
      const dist = calculateWorkModeDistribution(jobs);
      expect(dist.find((d) => d.mode === 'Remote')?.count).toBe(1);
      expect(dist.find((d) => d.mode === 'Hybrid')?.count).toBe(1);
      expect(dist.find((d) => d.mode === 'On-site')?.count).toBe(1);
    });
  });

  describe('calculateSalaryAnalytics', () => {
    it('calculates median salary range and disclosure rate', () => {
      const jobs: JobRecord[] = [
        { ...mockBaseJob, id: '1', salaryMin: 120000, salaryMax: 150000 },
        { ...mockBaseJob, id: '2', salaryMin: 140000, salaryMax: 180000 },
        { ...mockBaseJob, id: '3', salary: 'Not listed', salaryMin: null, salaryMax: null },
      ];
      const sal = calculateSalaryAnalytics(jobs);
      expect(sal.disclosedCount).toBe(2);
      expect(sal.disclosureRate).toBe(67);
      expect(sal.displayRange).toBe('130k – 165k');
    });
  });
});
