import { describe, expect, it } from 'vitest';
import type { JobRecord, JobStatus } from '../../types';
import { buildSuggestions, classifyEmail, matchEmailToJobs } from '../emailSignals';
import type { EmailItem } from '../emailSignals.types';

function makeJob(
  overrides: Partial<JobRecord> & Pick<JobRecord, 'id' | 'company' | 'jobTitle' | 'status'>
): JobRecord {
  return {
    location: 'Remote',
    salary: '',
    dateApplied: null,
    industry: '',
    summary: '',
    url: '',
    companyMetadata: {},
    positionMetadata: { requiredSkills: [] },
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeEmail(overrides: Partial<EmailItem> & Pick<EmailItem, 'id'>): EmailItem {
  return {
    threadId: `thread-${overrides.id}`,
    date: '2026-02-01T12:00:00Z',
    from: 'Recruiting <recruiting@talent-mail.example>',
    subject: 'Update on your application',
    snippet: '',
    links: [],
    ...overrides,
  };
}

describe('classifyEmail', () => {
  it('classifies a rejection', () => {
    const result = classifyEmail(makeEmail({ id: '1', subject: 'Your application', snippet: 'Unfortunately we will not be moving forward.' }));
    expect(result.status).toBe('Rejected');
    expect(result.confidence).toBe('high');
    expect(result.reason).toContain('unfortunately');
  });

  it('classifies an offer', () => {
    const result = classifyEmail(makeEmail({ id: '1', subject: 'Offer', snippet: 'We are pleased to offer you the role.' }));
    expect(result.status).toBe('Offer');
    expect(result.confidence).toBe('high');
  });

  it('classifies an interview invitation as high confidence', () => {
    const result = classifyEmail(makeEmail({ id: '1', subject: 'Next step', snippet: 'Please schedule an interview with us.' }));
    expect(result.status).toBe('Interviewing');
    expect(result.confidence).toBe('high');
  });

  it('classifies a scheduling link as an interview', () => {
    const result = classifyEmail(
      makeEmail({ id: '1', subject: 'Pick a time', snippet: 'Book here', links: ['https://calendly.com/acme/intro'] })
    );
    expect(result.status).toBe('Interviewing');
    expect(result.confidence).toBe('high');
  });

  it('treats the bare word interview as a low-confidence interview signal', () => {
    const result = classifyEmail(makeEmail({ id: '1', subject: 'Interview', snippet: 'Hello there.' }));
    expect(result.status).toBe('Interviewing');
    expect(result.confidence).toBe('low');
  });

  it('classifies an application acknowledgement as applied', () => {
    const result = classifyEmail(makeEmail({ id: '1', subject: 'Thank you for applying to Acme', snippet: '' }));
    expect(result.status).toBe('Applied');
    expect(result.confidence).toBe('high');
  });

  it('lets rejection beat an applied acknowledgement', () => {
    const result = classifyEmail(
      makeEmail({ id: '1', subject: 'Thank you for applying', snippet: 'Unfortunately, the position has been filled.' })
    );
    expect(result.status).toBe('Rejected');
  });

  it('ignores job alerts', () => {
    const result = classifyEmail(makeEmail({ id: '1', subject: 'New jobs for you: Platform Engineer', snippet: 'Unsubscribe any time.' }));
    expect(result.status).toBeNull();
    expect(result.confidence).toBe('high');
  });

  it('returns no signal for unrelated mail', () => {
    expect(classifyEmail(makeEmail({ id: '1', subject: 'Lunch?', snippet: 'Are you free Tuesday?' }))).toEqual({
      status: null,
      confidence: 'low',
      reason: 'no signal',
    });
  });
});

describe('matchEmailToJobs', () => {
  it('matches a Greenhouse board slug found in the email links', () => {
    const jobs = [
      makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status: 'Applied', url: 'https://boards.greenhouse.io/acme/jobs/123' }),
      makeJob({ id: 'b', company: 'Globex', jobTitle: 'Engineer', status: 'Applied', url: 'https://example.com/x' }),
    ];
    const email = makeEmail({
      id: '1',
      from: 'Hiring <no-reply@us.greenhouse-mail.io>',
      subject: 'Acme: Thanks for applying',
      links: ['https://boards.greenhouse.io/acme/jobs/123'],
    });
    const match = matchEmailToJobs(email, jobs);
    expect(match?.jobId).toBe('a');
    expect(match?.confidence).toBe('high');
  });

  it('matches a company name found in the sender domain', () => {
    const jobs = [makeJob({ id: 'a', company: 'Acme Corp', jobTitle: 'Engineer', status: 'Applied' })];
    const email = makeEmail({ id: '1', from: 'Jane <jane@careers.acme.com>', subject: 'Next steps' });
    const match = matchEmailToJobs(email, jobs);
    expect(match?.jobId).toBe('a');
    expect(match?.confidence).toBe('high');
  });

  it('returns low confidence when two companies tie on the subject', () => {
    const jobs = [
      makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status: 'Applied' }),
      makeJob({ id: 'b', company: 'Globex', jobTitle: 'Engineer', status: 'Applied' }),
    ];
    const email = makeEmail({ id: '1', from: 'talent@staffing.example', subject: 'Acme or Globex: update' });
    const match = matchEmailToJobs(email, jobs);
    expect(match).not.toBeNull();
    expect(match?.confidence).toBe('low');
  });

  it('uses the known thread mapping', () => {
    const jobs = [
      makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status: 'Applied' }),
      makeJob({ id: 'b', company: 'Initech', jobTitle: 'Engineer', status: 'Applied' }),
    ];
    const email = makeEmail({ id: '1', threadId: 't9', from: 'x@acme.com', subject: 'Acme update' });
    const match = matchEmailToJobs(email, jobs, { t9: 'b' });
    expect(match?.jobId).toBe('b');
    expect(match?.confidence).toBe('high');
  });

  it('never matches terminal statuses', () => {
    const terminal: JobStatus[] = ['Rejected', 'Accepted', 'Declined'];
    for (const status of terminal) {
      const jobs = [makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status })];
      const email = makeEmail({ id: '1', threadId: 't1', from: 'Acme <x@acme.com>', subject: 'Acme update' });
      expect(matchEmailToJobs(email, jobs, { t1: 'a' })).toBeNull();
    }
  });
});

describe('buildSuggestions', () => {
  it('suggests an advance from Applied to Interviewing with sender label', () => {
    const jobs = [makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status: 'Applied' })];
    const items = [
      makeEmail({
        id: 'm1',
        from: '"Acme Recruiting" <recruiting@acme.com>',
        subject: 'Acme: schedule an interview',
        snippet: 'Please schedule an interview.',
      }),
    ];
    const [suggestion] = buildSuggestions(items, jobs);
    expect(suggestion.jobId).toBe('a');
    expect(suggestion.fromStatus).toBe('Applied');
    expect(suggestion.toStatus).toBe('Interviewing');
    expect(suggestion.confidence).toBe('high');
    expect(suggestion.sender).toBe('Acme Recruiting');
  });

  it('skips a status that is not forward from the current one', () => {
    const jobs = [makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status: 'Interviewing' })];
    const items = [makeEmail({ id: 'm1', from: 'recruiting@acme.com', subject: 'Acme: Thank you for applying' })];
    expect(buildSuggestions(items, jobs)).toEqual([]);
  });

  it('allows Rejected from Interviewing', () => {
    const jobs = [makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status: 'Interviewing' })];
    const items = [
      makeEmail({ id: 'm1', from: 'recruiting@acme.com', subject: 'Acme update', snippet: 'Unfortunately we are not moving forward.' }),
    ];
    const [suggestion] = buildSuggestions(items, jobs);
    expect(suggestion.toStatus).toBe('Rejected');
    expect(suggestion.fromStatus).toBe('Interviewing');
  });

  it('skips dismissed message ids', () => {
    const jobs = [makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status: 'Applied' })];
    const items = [makeEmail({ id: 'm1', from: 'recruiting@acme.com', subject: 'Acme: schedule an interview' })];
    expect(buildSuggestions(items, jobs, { dismissedIds: ['m1'] })).toEqual([]);
  });

  it('keeps only the most advanced suggestion per job, newest first', () => {
    const jobs = [makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status: 'Saved' })];
    const items = [
      makeEmail({ id: 'm1', date: '2026-02-01T12:00:00Z', from: 'recruiting@acme.com', subject: 'Acme: Thank you for applying' }),
      makeEmail({ id: 'm2', date: '2026-02-05T12:00:00Z', from: 'recruiting@acme.com', subject: 'Acme: schedule an interview' }),
    ];
    const suggestions = buildSuggestions(items, jobs);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].messageId).toBe('m2');
    expect(suggestions[0].toStatus).toBe('Interviewing');
  });

  it('lets a newest rejection win over an earlier interview', () => {
    const jobs = [makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status: 'Applied' })];
    const items = [
      makeEmail({ id: 'm1', date: '2026-02-01T12:00:00Z', from: 'recruiting@acme.com', subject: 'Acme: schedule an interview' }),
      makeEmail({ id: 'm2', date: '2026-02-09T12:00:00Z', from: 'recruiting@acme.com', subject: 'Acme update', snippet: 'Unfortunately, not selected.' }),
    ];
    const suggestions = buildSuggestions(items, jobs);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].toStatus).toBe('Rejected');
  });

  it('returns suggestions newest first', () => {
    const jobs = [
      makeJob({ id: 'a', company: 'Acme', jobTitle: 'Engineer', status: 'Applied' }),
      makeJob({ id: 'b', company: 'Globex', jobTitle: 'Engineer', status: 'Applied' }),
    ];
    const items = [
      makeEmail({ id: 'm1', date: '2026-02-01T12:00:00Z', from: 'recruiting@acme.com', subject: 'Acme: schedule an interview' }),
      makeEmail({ id: 'm2', date: '2026-02-08T12:00:00Z', from: 'recruiting@globex.com', subject: 'Globex: schedule an interview' }),
    ];
    expect(buildSuggestions(items, jobs).map((s) => s.jobId)).toEqual(['b', 'a']);
  });
});
