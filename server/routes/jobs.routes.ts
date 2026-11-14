import { Hono } from 'hono';
import type { AppEnv } from '../app.types.ts';
import { jobRepository } from '../services/storage/index.ts';
import { scopeOf } from '../middleware/requireUser.ts';
import { readJsonBody } from './readJsonBody.ts';
import { parseJobsFromCsv, parseJobsFromJson } from '../../src/utils/import.ts';
import { resolveDateApplied } from '../../src/lib/jobDates.ts';
import { appendStatusHistory, normalizeStatusHistory } from '../../src/lib/statusHistory.ts';

export const jobsRouter = new Hono<AppEnv>();

// GET /api/jobs: Fetch all tracked jobs (read-only; saved jobs are point-in-time snapshots)
jobsRouter.get('/', async (c) => {
  try {
    const jobs = await jobRepository.listJobs(scopeOf(c));
    return c.json({ success: true, jobs });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// POST /api/jobs/reparse: Force re-parsing of all database entries
jobsRouter.post('/reparse', async (c) => {
  try {
    const scope = scopeOf(c);
    const result = await jobRepository.reparseAllJobs(scope);
    const jobs = await jobRepository.listJobs(scope);
    return c.json({ success: true, ...result, jobs });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// PATCH /api/jobs/:id: Update status or edited fields
jobsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const updates = await readJsonBody(c);

  try {
    const scope = scopeOf(c);
    const existing = await jobRepository.getJobById(scope, id);

    if (!existing) {
      return c.json({ success: false, error: 'Job not found' }, 404);
    }

    const finalStatus = updates.status !== undefined ? updates.status : existing.status;
    const finalDateApplied = resolveDateApplied({
      previousDate: existing.dateApplied,
      previousStatus: existing.status,
      nextStatus: finalStatus,
      ...(Object.prototype.hasOwnProperty.call(updates, 'dateApplied')
        ? { explicitDate: updates.dateApplied }
        : {}),
    });

    let statusHistory = normalizeStatusHistory(existing.statusHistory);
    if (updates.status !== undefined && updates.status !== existing.status) {
      statusHistory = appendStatusHistory(statusHistory, existing.status, updates.status);
    } else if (Object.prototype.hasOwnProperty.call(updates, 'statusHistory')) {
      statusHistory = normalizeStatusHistory(updates.statusHistory);
    }

    const job = await jobRepository.updateJob(scope, id, {
      ...updates,
      dateApplied: finalDateApplied,
      statusHistory,
    });

    if (!job) {
      return c.json({ success: false, error: 'Job record not found for update' }, 404);
    }

    return c.json({ success: true, job });
  } catch (err: any) {
    console.error('Error updating job:', err);
    return c.json({ success: false, error: err?.message || 'Failed to update job record' }, 500);
  }
});

// DELETE /api/jobs/:id: Remove record from spreadsheet
jobsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const deleted = await jobRepository.deleteJob(scopeOf(c), id);

    if (!deleted) {
      return c.json({ success: false, error: 'Job not found' }, 404);
    }

    return c.json({ success: true, message: 'Job deleted successfully' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// POST /api/jobs/import: Bulk import jobs from exported JSON or CSV payload
jobsRouter.post('/import', async (c) => {
  try {
    const { format, content, jobs: rawJobs } = await readJsonBody(c);

    let jobs;
    if (Array.isArray(rawJobs)) {
      jobs = parseJobsFromJson(JSON.stringify(rawJobs)).jobs;
    } else if (typeof content === 'string') {
      if (format === 'csv' || (!format && !content.trim().startsWith('[') && !content.trim().startsWith('{'))) {
        jobs = parseJobsFromCsv(content).jobs;
      } else {
        jobs = parseJobsFromJson(content).jobs;
      }
    } else {
      return c.json(
        {
          success: false,
          error: 'Provide { content: string, format?: "json"|"csv" } or { jobs: [...] }',
        },
        400
      );
    }

    if (jobs.length > 1000) {
      return c.json({ success: false, error: 'Import is limited to 1,000 jobs at a time.' }, 400);
    }

    const result = await jobRepository.upsertJobs(scopeOf(c), jobs);
    return c.json({
      success: true,
      inserted: result.inserted,
      updated: result.updated,
      total: result.jobs.length,
      jobs: result.jobs,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Import failed' }, 400);
  }
});
