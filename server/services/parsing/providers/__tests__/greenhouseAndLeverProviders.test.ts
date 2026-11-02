import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GreenhouseProvider } from '../greenhouse.provider.ts';
import { LeverProvider } from '../lever.provider.ts';
import { DiagnosticStep } from '../../types.ts';

vi.mock('../../ai/geminiExtractor.ts', () => ({
  extractWithGemini: vi.fn(),
  extractWithUrlContext: vi.fn(),
}));

import { extractWithGemini } from '../../ai/geminiExtractor.ts';

describe('GreenhouseProvider and LeverProvider fetchPublicUrl routing', () => {
  beforeEach(() => {
    vi.mocked(extractWithGemini).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GreenhouseProvider fetches via public API and passes structured data to Gemini', async () => {
    const ghPayload = {
      title: 'Principal Backend Engineer',
      location: { name: 'New York, NY' },
      content: '<p>Distributed systems at Stripe scale.</p>',
    };

    const fetchMock = vi.fn(async () => new Response(JSON.stringify(ghPayload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    vi.mocked(extractWithGemini).mockResolvedValue({
      company: 'Stripe',
      jobTitle: 'Principal Backend Engineer',
      location: 'New York, NY',
    } as any);

    const steps: DiagnosticStep[] = [];
    const provider = new GreenhouseProvider();
    const result = await provider.extract(
      'https://boards.greenhouse.io/stripe/jobs/12345',
      { type: 'greenhouse', board: 'stripe', jobId: '12345' },
      steps
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(result.tierUsed).toBe('ATS API (Greenhouse)');
    expect(steps[0].status).toBe('success');
  });

  it('LeverProvider fetches via public API and passes structured data to Gemini', async () => {
    const leverPayload = {
      text: 'Senior Product Manager',
      categories: { location: 'San Francisco, CA', team: 'Core' },
      description: '<p>Lead core product strategy.</p>',
    };

    const fetchMock = vi.fn(async () => new Response(JSON.stringify(leverPayload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    vi.mocked(extractWithGemini).mockResolvedValue({
      company: 'Netflix',
      jobTitle: 'Senior Product Manager',
      location: 'San Francisco, CA',
    } as any);

    const steps: DiagnosticStep[] = [];
    const provider = new LeverProvider();
    const result = await provider.extract(
      'https://jobs.lever.co/netflix/67890',
      { type: 'lever', board: 'netflix', jobId: '67890' },
      steps
    );

    expect(fetchMock).toHaveBeenCalled();
    expect(result.tierUsed).toBe('ATS API (Lever)');
    expect(steps[0].status).toBe('success');
  });
});
