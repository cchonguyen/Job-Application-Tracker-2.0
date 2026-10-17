import { Router } from 'express';
import { jobRepository } from '../services/storage/index.ts';
import { scopeOf } from '../middleware/requireUser.ts';
import { parseJobsFromCsv, parseJobsFromJson } from '../../src/utils/import.ts';
import { resolveDateApplied } from '../../src/lib/jobDates.ts';
import { appendStatusHistory, normalizeStatusHistory } from '../../src/lib/statusHistory.ts';

export const jobsRouter = Router();

// GET /api/jobs: Fetch all tracked jobs (read-only; saved jobs are point-in-time snapshots)
jobsRouter.get('/', async (req, res) => {
  try {
    const jobs = await jobRepository.listJobs(scopeOf(req));
    res.json({ success: true, jobs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/jobs/reparse: Force re-parsing of all database entries
jobsRouter.post('/reparse', async (req, res) => {
  try {
    const scope = scopeOf(req);
    const result = await jobRepository.reparseAllJobs(scope);
    const jobs = await jobRepository.listJobs(scope);
    res.json({ success: true, ...result, jobs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/jobs/:id: Update status or edited fields
jobsRouter.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body || {};

  try {
    const scope = scopeOf(req);
    const existing = await jobRepository.getJobById(scope, id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Job not found' });
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
      return res.status(404).json({ success: false, error: 'Job record not found for update' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true, job });
  } catch (err: any) {
    console.error('Error updating job:', err);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ success: false, error: err?.message || 'Failed to update job record' });
  }
});

// DELETE /api/jobs/:id: Remove record from spreadsheet
jobsRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await jobRepository.deleteJob(scopeOf(req), id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/jobs/import: Bulk import jobs from exported JSON or CSV payload
jobsRouter.post('/import', async (req, res) => {
  try {
    const { format, content, jobs: rawJobs } = req.body || {};

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
      return res.status(400).json({
        success: false,
        error: 'Provide { content: string, format?: "json"|"csv" } or { jobs: [...] }',
      });
    }

    const result = await jobRepository.upsertJobs(scopeOf(req), jobs);
    res.json({
      success: true,
      inserted: result.inserted,
      updated: result.updated,
      total: result.jobs.length,
      jobs: result.jobs,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Import failed' });
  }
});
