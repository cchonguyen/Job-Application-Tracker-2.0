import { describe, expect, it } from 'vitest';
import { companyDomainFromJobUrl, companyLogoUrl } from '../companyLogo';

describe('companyDomainFromJobUrl', () => {
  it('extracts Greenhouse board names', () => {
    expect(companyDomainFromJobUrl('https://boards.greenhouse.io/figma/jobs/5912401')).toBe(
      'figma.com'
    );
  });

  it('extracts Lever company slugs', () => {
    expect(
      companyDomainFromJobUrl(
        'https://jobs.lever.co/datadog/883b1092-c419-4cb5-bf9e-e38029d20c54'
      )
    ).toBe('datadog.com');
  });

  it('uses apex host for career subdomains', () => {
    expect(companyDomainFromJobUrl('https://careers.stripe.com/jobs/listing/x')).toBe('stripe.com');
  });

  it('uses company site host for embedded Greenhouse params', () => {
    expect(
      companyDomainFromJobUrl(
        'https://www.vandelay.com/about/careers/open-roles/job?job_id=5301310008'
      )
    ).toBe('vandelay.com');
  });

  it('falls back to company name slug', () => {
    expect(companyDomainFromJobUrl('', 'Acme Robotics')).toBe('acmerobotics.com');
  });
});

describe('companyLogoUrl', () => {
  it('builds a Google favicon URL', () => {
    expect(companyLogoUrl('stripe.com')).toContain('stripe.com');
    expect(companyLogoUrl('stripe.com')).toContain('favicons');
  });
});
