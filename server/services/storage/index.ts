import { IJobRepository } from './repository.interface.ts';
import {
  createUserSupabaseClient,
  deleteJob,
  getJobById,
  insertJob,
  isUsingSupabase,
  listJobs,
  newJobId,
  normalizeSupabaseUrl,
  reparseAllJobsInStore,
  updateJob,
  upsertJobs,
  type JobScope,
} from '../../../src/lib/jobsStore.ts';
import type { JobRecord } from '../../../src/types';

export class DualPersistenceJobRepository implements IJobRepository {
  async listJobs(scope: JobScope): Promise<JobRecord[]> {
    return listJobs(scope);
  }

  async getJobById(scope: JobScope, id: string): Promise<JobRecord | null> {
    return getJobById(scope, id);
  }

  async createJob(scope: JobScope, job: JobRecord): Promise<JobRecord> {
    return insertJob(scope, job);
  }

  async updateJob(scope: JobScope, id: string, updates: Partial<JobRecord>): Promise<JobRecord | null> {
    return updateJob(scope, id, updates);
  }

  async deleteJob(scope: JobScope, id: string): Promise<boolean> {
    return deleteJob(scope, id);
  }

  async upsertJobs(scope: JobScope, jobs: JobRecord[]): Promise<{ inserted: number; updated: number; jobs: JobRecord[] }> {
    return upsertJobs(scope, jobs);
  }

  async reparseAllJobs(scope: JobScope): Promise<{ updated: number; total: number }> {
    return reparseAllJobsInStore(scope);
  }
}

export const jobRepository = new DualPersistenceJobRepository();
export { createUserSupabaseClient, isUsingSupabase, newJobId, normalizeSupabaseUrl, type JobScope };
