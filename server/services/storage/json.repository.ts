import fs from 'fs';
import path from 'path';
import type { JobRecord } from '../../../src/types';
import { normalizeStatusHistory } from '../../../src/lib/statusHistory.ts';
import { formatSalaryDisplay, parseSalaryRange } from '../../../src/lib/salary.ts';
import { parseJobTitleAndTeam } from '../../../src/lib/jobsStore.ts';
import { IJobRepository } from './repository.interface.ts';

const DATA_FILE = path.join(process.cwd(), 'spreadsheet_data.json');
const EXAMPLE_DATA_FILE = path.join(process.cwd(), 'spreadsheet_data.example.json');

const INITIAL_SEED_JOBS: JobRecord[] = [
  {
    id: 'job_seed_stripe_1',
    company: 'Stripe',
    jobTitle: 'Staff Full-Stack Software Engineer',
    team: 'Billing & Subscriptions',
    location: 'Remote (US & Canada)',
    salary: '195k - 275k',
    salaryMin: 195000,
    salaryMax: 275000,
    status: 'Interviewing',
    dateApplied: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    dateAdded: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    industry: 'Financial Infrastructure',
    summary:
      'Lead engineering for customer dashboard experiences and global billing payment primitives. Own architecture across distributed React/TypeScript frontends and Ruby/Java services. Collaborate with product teams to ship low-latency merchant financial tooling.',
    url: 'https://stripe.com/jobs/listing/staff-full-stack-engineer/6091234',
    companyMetadata: {
      headcount: '7,000+ employees',
      headquarters: 'San Francisco, CA & Dublin',
      ownership: 'Private',
      foundingYear: '2010',
    },
    positionMetadata: {
      seniority: 'Staff',
      department: 'Billing & Subscriptions',
      employmentType: 'Full-time',
      requiredSkills: ['React', 'TypeScript', 'Distributed Systems', 'API Design', 'PostgreSQL'],
    },
    extractedVia: 'Cheerio JSON-LD + Gemini 3.8',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    notes: 'Recruiter screen completed. Technical system design round scheduled for next Tuesday.',
    statusHistory: [
      {
        at: new Date(Date.now() - 3 * 86400000).toISOString(),
        from: null,
        to: 'Applied',
      },
      {
        at: new Date(Date.now() - 2 * 86400000).toISOString(),
        from: 'Applied',
        to: 'Interviewing',
      },
    ],
  },
];

export function normalizeJobRecord(job: JobRecord): JobRecord {
  let salaryMin = typeof job.salaryMin === 'number' && !Number.isNaN(job.salaryMin) ? job.salaryMin : null;
  let salaryMax = typeof job.salaryMax === 'number' && !Number.isNaN(job.salaryMax) ? job.salaryMax : null;
  let salaryStr = job.salary;

  if (salaryMin === null && salaryMax === null && salaryStr) {
    const parsed = parseSalaryRange(salaryStr);
    salaryMin = parsed.salaryMin;
    salaryMax = parsed.salaryMax;
    salaryStr = parsed.formatted;
  } else if (salaryMin !== null || salaryMax !== null) {
    const formatted = formatSalaryDisplay(salaryMin, salaryMax, salaryStr);
    salaryStr = formatted.text;
  }

  const dateAdded =
    job.dateAdded ||
    (job.createdAt ? job.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]);

  const { jobTitle: cleanTitle, team: cleanTeam } = parseJobTitleAndTeam(job.jobTitle, job.team);

  return {
    ...job,
    jobTitle: cleanTitle || job.jobTitle,
    team: cleanTeam || undefined,
    salary: salaryStr || 'Not listed',
    salaryMin,
    salaryMax,
    dateAdded,
    statusHistory: normalizeStatusHistory(job.statusHistory),
  };
}

export class JsonFileJobRepository implements IJobRepository {
  private readData(): JobRecord[] {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeJobRecord);
        }
      }
      if (fs.existsSync(EXAMPLE_DATA_FILE)) {
        const rawExample = fs.readFileSync(EXAMPLE_DATA_FILE, 'utf-8');
        const parsedExample = JSON.parse(rawExample);
        if (Array.isArray(parsedExample) && parsedExample.length > 0) {
          fs.writeFileSync(DATA_FILE, JSON.stringify(parsedExample, null, 2), 'utf-8');
          return parsedExample.map(normalizeJobRecord);
        }
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_SEED_JOBS, null, 2), 'utf-8');
      return INITIAL_SEED_JOBS.map(normalizeJobRecord);
    } catch (e) {
      console.error('Error reading JSON store:', e);
      return INITIAL_SEED_JOBS.map(normalizeJobRecord);
    }
  }

  private writeData(jobs: JobRecord[]): void {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error writing to JSON store:', e);
    }
  }

  async listJobs(): Promise<JobRecord[]> {
    return this.readData();
  }

  async getJobById(id: string): Promise<JobRecord | null> {
    const jobs = this.readData();
    return jobs.find((j) => j.id === id) || null;
  }

  async createJob(job: JobRecord): Promise<JobRecord> {
    const jobs = this.readData();
    const normalized = normalizeJobRecord(job);
    jobs.unshift(normalized);
    this.writeData(jobs);
    return normalized;
  }

  async updateJob(id: string, updates: Partial<JobRecord>): Promise<JobRecord | null> {
    const jobs = this.readData();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return null;

    const merged = normalizeJobRecord({ ...jobs[idx], ...updates, id });
    jobs[idx] = merged;
    this.writeData(jobs);
    return merged;
  }

  async deleteJob(id: string): Promise<boolean> {
    const jobs = this.readData();
    const filtered = jobs.filter((j) => j.id !== id);
    if (filtered.length === jobs.length) return false;
    this.writeData(filtered);
    return true;
  }

  async upsertJobs(newJobs: JobRecord[]): Promise<{ inserted: number; updated: number; jobs: JobRecord[] }> {
    const jobs = this.readData();
    let inserted = 0;
    let updated = 0;

    for (const job of newJobs) {
      const existingIdx = jobs.findIndex(
        (j) =>
          j.id === job.id ||
          (j.company.toLowerCase() === job.company.toLowerCase() &&
            j.jobTitle.toLowerCase() === job.jobTitle.toLowerCase() &&
            (!j.team || !job.team || j.team.toLowerCase() === job.team.toLowerCase()))
      );

      if (existingIdx !== -1) {
        jobs[existingIdx] = normalizeJobRecord({ ...jobs[existingIdx], ...job, id: jobs[existingIdx].id });
        updated++;
      } else {
        jobs.unshift(normalizeJobRecord(job));
        inserted++;
      }
    }

    this.writeData(jobs);
    return { inserted, updated, jobs };
  }

  async reparseAllJobs(): Promise<{ updated: number; total: number }> {
    const jobs = this.readData();
    let modified = 0;
    const remapped = jobs.map((j) => {
      const norm = normalizeJobRecord(j);
      if (norm.jobTitle !== j.jobTitle || norm.team !== j.team || norm.salary !== j.salary) {
        modified++;
      }
      return norm;
    });

    if (modified > 0) {
      this.writeData(remapped);
    }
    return { updated: modified, total: jobs.length };
  }
}
