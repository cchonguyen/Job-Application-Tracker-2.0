import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/services/parsing/ai/geminiExtractor.ts', () => ({
  extractWithGemini: vi.fn(),
  extractWithUrlInference: vi.fn(),
}));

import { extractWithGemini } from '../../../server/services/parsing/ai/geminiExtractor.ts';
import { JobParsingEngine } from '../../../server/services/parsing/index.ts';
import { AshbyProvider } from '../../../server/services/parsing/providers/ashby.provider.ts';
import { DiagnosticStep } from '../../../server/services/parsing/types.ts';
import { detectAts } from '../atsDetect.ts';

const JOB_ID = '3f9e2c1a-1b2c-4d5e-8f90-123456789abc';
const JOB_URL = `https://jobs.ashbyhq.com/linear/${JOB_ID}`;

const boardResponse = {
  apiVersion: '1',
  jobs: [
    { id: 'other-job', title: 'Account Executive', descriptionPlain: 'Sell things.' },
    {
      id: JOB_ID,
      title: 'Senior Product Engineer',
      location: 'San Francisco',
      secondaryLocations: [{ location: 'New York' }],
      department: 'Engineering',
      team: 'Platform',
      isRemote: false,
      workplaceType: 'Hybrid',
      employmentType: 'FullTime',
      descriptionHtml: '<p>Build the product.</p>',
      descriptionPlain: 'Build the product used by thousands of software teams.',
      compensation: {
        scrapeableCompensationSalarySummary: '$180K - $240K',
        summaryComponents: [
          { compensationType: 'EquityPercentage', minValue: 0.01, maxValue: 0.05 },
          { compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'USD', minValue: 180000, maxValue: 240000 },
        ],
      },
    },
  ],
};

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AshbyProvider', () => {
  beforeEach(() => {
    vi.mocked(extractWithGemini).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handles Ashby URLs only when both org and job id are detected', () => {
    const provider = new AshbyProvider();
    expect(provider.canHandle(JOB_URL, detectAts(JOB_URL))).toBe(true);
    expect(provider.canHandle(`${JOB_URL}/application`, detectAts(`${JOB_URL}/application`))).toBe(true);
    expect(provider.canHandle('https://jobs.ashbyhq.com/linear', detectAts('https://jobs.ashbyhq.com/linear'))).toBe(false);
    expect(provider.canHandle('https://jobs.lever.co/netflix/67890', detectAts('https://jobs.lever.co/netflix/67890'))).toBe(false);
  });

  it('fetches the public job board, selects the posting by id and passes it to Gemini', async () => {
    const fetchMock = mockFetch(boardResponse);
    vi.mocked(extractWithGemini).mockResolvedValue({ company: 'Linear', jobTitle: 'Senior Product Engineer' } as any);

    const steps: DiagnosticStep[] = [];
    const result = await new AshbyProvider().extract(JOB_URL, detectAts(JOB_URL), steps);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.ashbyhq.com/posting-api/job-board/linear?includeCompensation=true',
      expect.anything()
    );
    expect(result.tierUsed).toBe('ATS API (Ashby)');
    const geminiArgs = vi.mocked(extractWithGemini).mock.calls[0][0];
    expect(geminiArgs.sourceType).toBe('ASHBY REST API');
    expect(geminiArgs.companyHint).toBe('Linear');
    expect(geminiArgs.jobTitleHint).toBe('Senior Product Engineer');
    expect(geminiArgs.rawContent).toContain('Build the product used by thousands');
    expect(geminiArgs.rawContent).not.toContain('descriptionHtml');
    expect(steps.map((s) => s.status)).toEqual(['success', 'success']);
  });

  it('falls back to deterministic Ashby fields when Gemini fails', async () => {
    mockFetch(boardResponse);
    vi.mocked(extractWithGemini).mockRejectedValue(new Error('quota exceeded'));

    const steps: DiagnosticStep[] = [];
    const result = await new AshbyProvider().extract(JOB_URL, detectAts(JOB_URL), steps);
    const data = result.extractedData;

    expect(result.tierUsed).toBe('Direct ATS API (Ashby)');
    expect(data.company).toBe('Linear');
    expect(data.jobTitle).toBe('Senior Product Engineer');
    expect(data.team).toBe('Platform');
    expect(data.location).toBe('San Francisco / New York (Hybrid)');
    expect(data.salary).toBe('180k - 240k');
    expect(data.salaryMin).toBe(180000);
    expect(data.salaryMax).toBe(240000);
    expect(data.positionMetadata.seniority).toBe('Senior');
    expect(data.positionMetadata.department).toBe('Engineering');
    expect(data.positionMetadata.employmentType).toBe('Full-time');
    expect(steps[1].status).toBe('failed');
  });

  it('labels remote postings', async () => {
    mockFetch({ jobs: [{ id: JOB_ID, title: 'Engineer', location: 'United States', workplaceType: 'Remote' }] });
    vi.mocked(extractWithGemini).mockRejectedValue(new Error('no key'));

    const result = await new AshbyProvider().extract(JOB_URL, detectAts(JOB_URL), []);
    expect(result.extractedData.location).toBe('Remote (United States)');
  });

  it('throws when the posting is not on the public board', async () => {
    mockFetch({ jobs: [{ id: 'other-job', title: 'Account Executive' }] });
    await expect(new AshbyProvider().extract(JOB_URL, detectAts(JOB_URL), [])).rejects.toThrow(/not listed/);
  });

  it('is wired into the engine and falls through to Tier 2 when the API fails', async () => {
    mockFetch({}, 404);
    const engine = new JobParsingEngine();
    const result = await engine.extract(JOB_URL);

    expect(result.diagnosticSteps[0].name).toBe('Tier 1: Ashby Public Posting API');
    expect(result.diagnosticSteps[0].status).toBe('failed');
    expect(result.diagnosticSteps[0].details).toContain('Ashby API call failed: Ashby API responded with HTTP 404');
    expect(result.diagnosticSteps.some((s) => s.tier.startsWith('Tier 2'))).toBe(true);
  });
});
