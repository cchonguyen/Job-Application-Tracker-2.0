import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkableProvider } from '../workable.provider.ts';
import { DiagnosticStep } from '../../types.ts';

vi.mock('../../ai/geminiExtractor.ts', () => ({
  extractWithGemini: vi.fn(),
  extractWithUrlContext: vi.fn(),
}));

import { extractWithGemini } from '../../ai/geminiExtractor.ts';

describe('WorkableProvider', () => {
  beforeEach(() => {
    vi.mocked(extractWithGemini).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('canHandle matches workable URLs with board and jobId', () => {
    const provider = new WorkableProvider();
    expect(provider.canHandle('https://apply.workable.com/spotify/j/12345/', { type: 'workable', board: 'spotify', jobId: '12345' })).toBe(true);
    expect(provider.canHandle('https://apply.workable.com/spotify/', { type: 'workable', board: 'spotify' })).toBe(false);
  });

  it('supports Workable API v3 structured JSON endpoint', async () => {
    const v3Payload = {
      id: 'ABCDE',
      title: 'Senior Systems Engineer',
      company: { name: 'Acme Cloud' },
      location: {
        city: 'Athens',
        country: 'Greece',
        telecommuting: true,
      },
      department: ['Platform Infrastructure'],
      workplace: 'remote',
      description: '<p>Build reliable distributed cloud infrastructure.</p>',
      requirements: '<p>Proficiency in Go and Kubernetes.</p>',
      salary: {
        currency: 'EUR',
        min: 90000,
        max: 110000,
        interval: 'yearly',
      },
    };

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v3/accounts/acme/jobs/ABCDE')) {
        return new Response(JSON.stringify(v3Payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not found', { status: 404 });
    }));

    vi.mocked(extractWithGemini).mockResolvedValue({
      company: 'Acme Cloud',
      jobTitle: 'Senior Systems Engineer',
      location: 'Remote (Athens, Greece)',
      salary: '€90k - €110k',
    } as any);

    const steps: DiagnosticStep[] = [];
    const provider = new WorkableProvider();
    const result = await provider.extract(
      'https://apply.workable.com/acme/j/ABCDE/',
      { type: 'workable', board: 'acme', jobId: 'ABCDE' },
      steps
    );

    expect(result.tierUsed).toBe('ATS API (Workable • Fast-Path)');
    expect(steps[0].status).toBe('success');
    expect(steps[0].details).toContain('Workable API v3');
  });

  it('falls back to .md endpoint when API v3 returns 404', async () => {
    const markdownContent = `
# Staff DevOps Architect
> DevOpsCo · Boston, MA · Posted 2 days ago

**Workplace:** Hybrid
**Department:** Cloud Engineering

Short description.
    `;

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v3/')) {
        return new Response('Not found', { status: 404 });
      }
      if (urlStr.endsWith('.md')) {
        return new Response(markdownContent, { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    }));

    vi.mocked(extractWithGemini).mockResolvedValue({
      company: 'DevOpsCo',
      jobTitle: 'Staff DevOps Architect',
      location: 'Boston, MA',
    } as any);

    const steps: DiagnosticStep[] = [];
    const provider = new WorkableProvider();
    const result = await provider.extract(
      'https://apply.workable.com/devopsco/j/XYZ99/',
      { type: 'workable', board: 'devopsco', jobId: 'XYZ99' },
      steps
    );

    expect(result.tierUsed).toBe('Workable Markdown + Gemini 3.8');
    expect(steps[0].details).toContain('server-rendered markdown');
  });
});
