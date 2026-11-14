import { Hono } from 'hono';
import type { AppEnv } from '../app.types.ts';
import { parsingEngine } from '../services/parsing/index.ts';
import { parseUrlDeterministically } from '../services/parsing/utils/htmlCleaner.ts';
import { jobRepository, newJobId } from '../services/storage/index.ts';
import { scopeOf } from '../middleware/requireUser.ts';
import { companyLookupLimit, extractionLimit, takeDailyUsage } from '../middleware/extractionLimit.ts';
import { detectAts, canonicalizeJobUrl } from '../../src/lib/atsDetect.ts';
import { initialDateAppliedForStatus } from '../../src/lib/jobDates.ts';
import { initialStatusHistory } from '../../src/lib/statusHistory.ts';
import { parseJobTitleAndTeam } from '../../src/lib/jobsStore.ts';
import { findPastSixMonthsDuplicates, normalizeJobUrl } from '../../src/lib/duplicateDetection.ts';
import { resolveCompanyFacts } from '../services/company/companyFacts.ts';
import { readJsonBody } from './readJsonBody.ts';
import { needsManualReview } from '../../src/lib/formatHelpers.ts';

export const extractRouter = new Hono<AppEnv>();

// POST /api/extract-job: Ingest URL or manual text, run pipeline, and append to spreadsheet
extractRouter.post('/extract-job', async (c) => {
  const { url, manualText, status: initialStatus, notes, confirmDuplicate, candidateJob } = await readJsonBody(c);
  const scope = scopeOf(c);

  // Direct fast save of pre-extracted candidate when user confirmed duplicate warning
  if (candidateJob && confirmDuplicate) {
    try {
      // The candidate round-trips through the browser, so the server picks its id.
      const saved = await jobRepository.createJob(scope, { ...candidateJob, id: newJobId() });
      return c.json({
        success: true,
        job: saved,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err.message || 'Failed to save confirmed job' }, 500);
    }
  }

  const rawUrl = typeof url === 'string' ? url.trim() : '';
  const canonicalUrl = rawUrl ? canonicalizeJobUrl(rawUrl).canonicalUrl || rawUrl : '';

  const finalStatus = initialStatus || 'Applied';
  const dateApplied = initialDateAppliedForStatus(finalStatus);

  let tierUsed = 'Deterministic Safety Fallback';
  let diagnosticSteps: any[] = [];
  let extractedData: any = null;
  let shortCircuited = false;

  try {
    const result = await parsingEngine.extract(canonicalUrl || rawUrl, manualText, {
      checkAiQuota: () => takeDailyUsage(scope, 'extraction'),
    });
    extractedData = result.extractedData;
    tierUsed = result.tierUsed;
    diagnosticSteps = result.diagnosticSteps;
    shortCircuited = Boolean(result.shortCircuited);
  } catch (err: any) {
    console.warn('Extraction pipeline warning:', err?.message);
    extractedData = parseUrlDeterministically(canonicalUrl || rawUrl || 'https://company.com/job', null);
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
    // Only the caller's own jobs: they feed both the duplicate check and company-fact reuse.
    const existingJobs = await jobRepository.listJobs(scope);
    const company = extractedData.company || 'Unknown Company';
    const aiQuotaSkipped = diagnosticSteps.some((step) => step?.name === 'Daily AI Extraction Quota Limit');
    const companyMetadata = await resolveCompanyFacts({
      company,
      extracted: extractedData.companyMetadata,
      existingJobs,
      jobUrl: canonicalUrl || undefined,
      jobTitle: extractedData.jobTitle,
      checkAiQuota: aiQuotaSkipped ? () => false : () => takeDailyUsage(scope, 'company-facts'),
    });
    const parsedRoleTeam = parseJobTitleAndTeam(
      extractedData.jobTitle || 'Unknown Role',
      extractedData.team
    );

    // Decision 3: In-place auto-upgrade of incomplete "Needs review" stubs
    const isComplete = !needsManualReview(tierUsed);
    const normCanonical = normalizeJobUrl(canonicalUrl);

    if (isComplete && normCanonical) {
      const existingStub = existingJobs.find(
        (existing) =>
          normalizeJobUrl(existing.url) === normCanonical &&
          needsManualReview(existing.extractedVia)
      );

      if (existingStub) {
        const updatedJob = await jobRepository.updateJob(scope, existingStub.id, {
          company,
          jobTitle: parsedRoleTeam.jobTitle || 'Unknown Role',
          team: parsedRoleTeam.team || extractedData.team || undefined,
          location: extractedData.location || 'Not listed',
          salary: extractedData.salary || 'Not listed',
          salaryMin: extractedData.salaryMin ?? null,
          salaryMax: extractedData.salaryMax ?? null,
          industry: extractedData.industry || 'Unknown',
          summary: extractedData.summary || '',
          companyMetadata,
          positionMetadata: {
            seniority: extractedData.positionMetadata?.seniority || 'Unknown',
            department: extractedData.positionMetadata?.department || 'Unknown',
            employmentType: extractedData.positionMetadata?.employmentType || 'Unknown',
            requiredSkills: extractedData.positionMetadata?.requiredSkills || [],
          },
          extractedVia: tierUsed,
          url: canonicalUrl,
        });

        return c.json({
          success: true,
          job: updatedJob || existingStub,
          upgradedExistingStub: true,
          diagnosticSteps,
          tierUsed,
        });
      }
    }

    const newJobRecord = {
      id: newJobId(),
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
      url: canonicalUrl || '',
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
        return c.json({
          success: true,
          potentialDuplicate: true,
          candidateJob: newJobRecord,
          duplicates,
          tierUsed,
          diagnosticSteps,
          shortCircuited,
        });
      }
    }

    const saved = await jobRepository.createJob(scope, newJobRecord);

    return c.json({
      success: true,
      job: saved,
      tierUsed,
      diagnosticSteps,
      shortCircuited,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Failed to save job' }, 500);
  }
});

// GET /api/company-facts?company=&url=&title=: look up employer facts for a job saved without them.
// Read-only: the result is shown alongside the job but the stored snapshot is not changed.
extractRouter.get('/company-facts', companyLookupLimit, async (c) => {
  const company = String(c.req.query('company') || '').trim();
  if (!company) {
    return c.json({ success: false, error: 'company is required' }, 400);
  }
  const jobUrl = c.req.query('url');
  const jobTitle = c.req.query('title');
  try {
    const facts = await resolveCompanyFacts({
      company,
      existingJobs: await jobRepository.listJobs(scopeOf(c)),
      jobUrl: jobUrl || undefined,
      jobTitle: jobTitle || undefined,
    });
    return c.json({ success: true, facts });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Company lookup failed' }, 500);
  }
});

// POST /api/test-ats-diagnostic: Run ATS diagnostic on a test URL without saving
extractRouter.post('/test-ats-diagnostic', async (c) => {
  const { url } = await readJsonBody(c);
  if (!url) {
    return c.json({ success: false, error: 'URL is required' }, 400);
  }

  const rawUrl = String(url).trim();
  const canonicalUrl = rawUrl ? canonicalizeJobUrl(rawUrl).canonicalUrl || rawUrl : '';

  try {
    const scope = scopeOf(c);
    const ats = detectAts(canonicalUrl);
    const { extractedData, tierUsed, diagnosticSteps } = await parsingEngine.extract(canonicalUrl, undefined, {
      checkAiQuota: () => takeDailyUsage(scope, 'extraction'),
    });

    return c.json({
      success: true,
      report: {
        targetUrl: canonicalUrl,
        detectedAts: ats.type ? `${ats.type.toUpperCase()} (Board: ${ats.board}, ID: ${ats.jobId})` : null,
        overallSuccess: true,
        finalTier: tierUsed,
        steps: diagnosticSteps,
        extractedData,
      },
    });
  } catch (err: any) {
    return c.json({
      success: false,
      report: {
        targetUrl: canonicalUrl || rawUrl,
        overallSuccess: false,
        finalTier: 'Failed',
        error: err.message,
      },
    });
  }
});
