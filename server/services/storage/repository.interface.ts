import type { JobRecord } from '../../../src/types';
import type { JobScope } from '../../../src/lib/jobsStore.ts';

/** Every call is scoped to one user; nothing here can read or write another user's jobs. */
export interface IJobRepository {
  listJobs(scope: JobScope): Promise<JobRecord[]>;
  getJobById(scope: JobScope, id: string): Promise<JobRecord | null>;
  createJob(scope: JobScope, job: JobRecord): Promise<JobRecord>;
  updateJob(scope: JobScope, id: string, updates: Partial<JobRecord>): Promise<JobRecord | null>;
  deleteJob(scope: JobScope, id: string): Promise<boolean>;
  upsertJobs(scope: JobScope, jobs: JobRecord[]): Promise<{ inserted: number; updated: number; jobs: JobRecord[] }>;
  reparseAllJobs(scope: JobScope): Promise<{ updated: number; total: number }>;
}
