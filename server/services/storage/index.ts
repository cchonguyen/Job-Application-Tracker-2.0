import { IJobRepository } from './repository.interface.ts';
import { JsonFileJobRepository } from './json.repository.ts';
import {
  deleteJob,
  getJobById,
  insertJob,
  isUsingSupabase,
  listJobs,
  normalizeSupabaseUrl,
  reparseAllJobsInStore,
  updateJob,
  upsertJobs,
} from '../../../src/lib/jobsStore.ts';
import type { JobRecord } from '../../../src/types';

export class DualPersistenceJobRepository implements IJobRepository {
  private localRepo = new JsonFileJobRepository();

  async listJobs(): Promise<JobRecord[]> {
    return listJobs();
  }

  async getJobById(id: string): Promise<JobRecord | null> {
    return getJobById(id);
  }

  async createJob(job: JobRecord): Promise<JobRecord> {
    return insertJob(job);
  }

  async updateJob(id: string, updates: Partial<JobRecord>): Promise<JobRecord | null> {
    return updateJob(id, updates);
  }

  async deleteJob(id: string): Promise<boolean> {
    return deleteJob(id);
  }

  async upsertJobs(jobs: JobRecord[]): Promise<{ inserted: number; updated: number; jobs: JobRecord[] }> {
    return upsertJobs(jobs);
  }

  async reparseAllJobs(): Promise<{ updated: number; total: number }> {
    return reparseAllJobsInStore();
  }
}

export const jobRepository = new DualPersistenceJobRepository();
export { isUsingSupabase, normalizeSupabaseUrl };
