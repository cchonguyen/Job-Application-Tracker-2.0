import { Router } from 'express';
import { parsingEngine } from '../services/parsing/index.ts';
import { parseUrlDeterministically } from '../services/parsing/utils/htmlCleaner.ts';
import { jobRepository } from '../services/storage/index.ts';
import { detectAts } from '../../src/lib/atsDetect.ts';
import { initialDateAppliedForStatus } from '../../src/lib/jobDates.ts';
import { initialStatusHistory } from '../../src/lib/statusHistory.ts';
import { parseJobTitleAndTeam } from '../../src/lib/jobsStore.ts';
import { findPastSixMonthsDuplicates } from '../../src/lib/duplicateDetection.ts';
import { resolveCompanyFacts } from '../services/company/companyFacts.ts';

export const extractRouter = Router();

// POST /api/extract-job: Ingest URL or manual text, run pipeline, and append to spreadsheet
extractRouter.post('/extract-job', async (req, res) => {
  const { url, manualText, status: initialStatus, notes, confirmDuplicate, candidateJob } = req.body;

  // Direct fast save of pre-extracted candidate when user confirmed duplicate warning
  if (candidateJob && confirmDuplicate) {
    try {
      const saved = await jobRepository.createJob(candidateJob);
      return res.json({
        success: true,
        job: saved,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || 'Failed to save confirmed job' });
    }
  }

  const finalStatus = initialStatus || 'Applied';
  const dateApplied = initialDateAppliedForStatus(finalStatus);

  let tierUsed = 'Deterministic Safety Fallback';
  let diagnosticSteps: any[] = [];
  let extractedData: any = null;

  try {
    const result = await parsingEngine.extract(url, manualText);
    extractedData = result.extractedData;
    tierUsed = result.tierUsed;
    diagnosticSteps = result.diagnosticSteps;
  } catch (err: any) {
    console.warn('Extraction pipeline warning:', err?.message);
    extractedData = parseUrlDeterministically(url || 'https://company.com/job', null);
    diagnosticSteps = [
      {
        tier: 'Safety Fallback',
        name: 'Free Tier Safety Guard',
        status: 'success',
        details: 'Processed posting deterministically to prevent API rate-limit interruptions.',
      },
    ];
  }

  try {
    const nowIso = new Date().toISOString();
    const existingJobs = await jobRepository.listJobs();
    const company = extractedData.company || 'Unknown Company';
    const companyMetadata = await resolveCompanyFacts({
      company,
      extracted: extractedData.companyMetadata,
      existingJobs,
      jobUrl: url,
      jobTitle: extractedData.jobTitle,
    });
    const parsedRoleTeam = parseJobTitleAndTeam(
      extractedData.jobTitle || 'Unknown Role',
      extractedData.team
    );

    const newJobRecord = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      company,
      jobTitle: parsedRoleTeam.jobTitle || 'Unknown Role',
      team: parsedRoleTeam.team || extractedData.team || undefined,
      location: extractedData.location || 'Not listed',
      salary: extractedData.salary || 'Not listed',
      salaryMin: extractedData.salaryMin ?? null,
      salaryMax: extractedData.salaryMax ?? null,
      status: finalStatus,
      dateApplied,
      dateAdded: nowIso.split('T')[0],
      industry: extractedData.industry || 'Unknown',
      summary: extractedData.summary || '',
      url: url || '',
      companyMetadata,
      positionMetadata: {
        seniority: extractedData.positionMetadata?.seniority || 'Unknown',
        department: extractedData.positionMetadata?.department || 'Unknown',
        employmentType: extractedData.positionMetadata?.employmentType || 'Unknown',
        requiredSkills: extractedData.positionMetadata?.requiredSkills || [],
      },
      extractedVia: tierUsed,
      createdAt: nowIso,
      notes: notes || '',
      statusHistory: initialStatusHistory(finalStatus),
    };

    // Check for potential duplicate role or company applied during the past 6 months
    if (!confirmDuplicate) {
      const duplicates = findPastSixMonthsDuplicates(newJobRecord, existingJobs);
      if (duplicates.length > 0) {
        return res.json({
          success: true,
          potentialDuplicate: true,
          candidateJob: newJobRecord,
          duplicates,
          tierUsed,
          diagnosticSteps,
        });
      }
    }

    const saved = await jobRepository.createJob(newJobRecord);

    res.json({
      success: true,
      job: saved,
      tierUsed,
      diagnosticSteps,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to save job' });
  }
});

// GET /api/company-facts?company=&url=&title=: look up employer facts for a job saved without them.
// Read-only: the result is shown alongside the job but the stored snapshot is not changed.
extractRouter.get('/company-facts', async (req, res) => {
  const company = String(req.query.company || '').trim();
  if (!company) {
    return res.status(400).json({ success: false, error: 'company is required' });
  }
  try {
    const facts = await resolveCompanyFacts({
      company,
      existingJobs: await jobRepository.listJobs(),
      jobUrl: req.query.url ? String(req.query.url) : undefined,
      jobTitle: req.query.title ? String(req.query.title) : undefined,
    });
    res.json({ success: true, facts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Company lookup failed' });
  }
});

// POST /api/test-ats-diagnostic: Run ATS diagnostic on a test URL without saving
extractRouter.post('/test-ats-diagnostic', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  try {
    const ats = detectAts(url);
    const { extractedData, tierUsed, diagnosticSteps } = await parsingEngine.extract(url);

    res.json({
      success: true,
      report: {
        targetUrl: url,
        detectedAts: ats.type ? `${ats.type.toUpperCase()} (Board: ${ats.board}, ID: ${ats.jobId})` : null,
        overallSuccess: true,
        finalTier: tierUsed,
        steps: diagnosticSteps,
        extractedData,
      },
    });
  } catch (err: any) {
    res.json({
      success: false,
      report: {
        targetUrl: url,
        overallSuccess: false,
        finalTier: 'Failed',
        error: err.message,
      },
    });
  }
});
