import type { JobRecord } from '../../../src/types';

export interface IJobRepository {
  listJobs(): Promise<JobRecord[]>;
  getJobById(id: string): Promise<JobRecord | null>;
  createJob(job: JobRecord): Promise<JobRecord>;
  updateJob(id: string, updates: Partial<JobRecord>): Promise<JobRecord | null>;
  deleteJob(id: string): Promise<boolean>;
  upsertJobs(jobs: JobRecord[]): Promise<{ inserted: number; updated: number; jobs: JobRecord[] }>;
  reparseAllJobs(): Promise<{ updated: number; total: number }>;
}
