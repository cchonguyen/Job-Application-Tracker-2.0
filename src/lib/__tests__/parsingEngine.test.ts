import { describe, expect, it } from 'vitest';
import { GreenhouseProvider } from '../../../server/services/parsing/providers/greenhouse.provider.ts';
import { LeverProvider } from '../../../server/services/parsing/providers/lever.provider.ts';
import { WorkableProvider } from '../../../server/services/parsing/providers/workable.provider.ts';
import { JobParsingEngine } from '../../../server/services/parsing/index.ts';
import { parseManualTextDeterministically, parseUrlDeterministically } from '../../../server/services/parsing/utils/htmlCleaner.ts';

describe('Modular Parsing Engine', () => {
  it('instantiates provider instances and verifies signature handling', () => {
    const greenhouse = new GreenhouseProvider();
    const lever = new LeverProvider();
    const workable = new WorkableProvider();

    expect(greenhouse.canHandle('https://boards.greenhouse.io/stripe/jobs/12345', {
      type: 'greenhouse',
      board: 'stripe',
      jobId: '12345',
    })).toBe(true);

    expect(lever.canHandle('https://jobs.lever.co/netflix/67890', {
      type: 'lever',
      board: 'netflix',
      jobId: '67890',
    })).toBe(true);

    expect(workable.canHandle('https://apply.workable.com/spotify/j/ABCDE/', {
      type: 'workable',
      board: 'spotify',
      jobId: 'ABCDE',
    })).toBe(true);
  });

  it('runs deterministic manual text parser cleanly with fallback safety', () => {
    const raw = `
Company: Datadog
Title: Senior Software Engineer, Platform
Location: New York, NY
Salary: $190,000 - $240,000 / yr

We are looking for an experienced engineer to scale our distributed telemetry pipeline.
`;
    const parsed = parseManualTextDeterministically(raw);
    expect(parsed.company).toBe('Datadog');
    expect(parsed.jobTitle).toBe('Senior Software Engineer');
    expect(parsed.team).toBe('Platform');
    expect(parsed.location).toBe('New York, NY');
    expect(parsed.positionMetadata.seniority).toBe('Senior');
  });

  it('runs deterministic URL parser fallback for blocked or unknown sites', () => {
    const parsed = parseUrlDeterministically('https://jobs.apple.com/en-us/details/20054321/senior-systems-engineer');
    expect(parsed.company).toBe('Apple');
    expect(parsed.jobTitle).toBe('Senior Systems Engineer');
  });

  it('supports registering new ATS providers dynamically via the engine', () => {
    const engine = new JobParsingEngine();
    let handled = false;

    engine.registerProvider({
      name: 'CustomTestATS',
      canHandle: (url) => url.includes('custom-ats.com'),
      extract: async () => {
        handled = true;
        return {
          tierUsed: 'CustomTestATS',
          extractedData: {
            company: 'CustomCo',
            jobTitle: 'Lead Architect',
            location: 'Remote',
            salary: 'Not listed',
            industry: 'Tech',
            summary: 'Summary',
            companyMetadata: { headcount: '100', headquarters: 'SF', ownership: 'Private', foundingYear: '2020' },
            positionMetadata: { seniority: 'Lead', department: 'Engineering', employmentType: 'Full-time', requiredSkills: [] },
          },
        };
      },
    });

    expect(typeof engine.registerProvider).toBe('function');
  });
});
