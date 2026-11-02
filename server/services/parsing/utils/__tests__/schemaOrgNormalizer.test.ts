import { describe, expect, it } from 'vitest';
import {
  cleanHtmlDescription,
  decodeHtmlEntities,
  extractSchemaOrgJobPosting,
} from '../schemaOrgNormalizer.ts';

describe('decodeHtmlEntities', () => {
  it('decodes standard and numerical entities cleanly', () => {
    expect(decodeHtmlEntities('AT&amp;T &lt;Services&gt;')).toBe('AT&T <Services>');
    expect(decodeHtmlEntities('Engineer&#39;s Hub &quot;Core&quot;')).toBe("Engineer's Hub \"Core\"");
    expect(decodeHtmlEntities('San Francisco&#44; CA')).toBe('San Francisco, CA');
  });

  it('handles strings without entities without changes', () => {
    expect(decodeHtmlEntities('Plain Text 123')).toBe('Plain Text 123');
    expect(decodeHtmlEntities('')).toBe('');
  });
});

describe('cleanHtmlDescription', () => {
  it('strips script, style, and converts block tags to newlines', () => {
    const html = `
      <div>
        <script>alert('bad');</script>
        <p>Paragraph 1</p>
        <p>Paragraph 2</p>
        <ul>
          <li>Bullet A</li>
          <li>Bullet B</li>
        </ul>
      </div>
    `;
    const cleaned = cleanHtmlDescription(html);
    expect(cleaned).toContain('Paragraph 1');
    expect(cleaned).toContain('Paragraph 2');
    expect(cleaned).toContain('Bullet A');
    expect(cleaned).not.toContain('bad');
    expect(cleaned).not.toContain('<p>');
  });
});

describe('extractSchemaOrgJobPosting', () => {
  it('extracts JobPosting nested inside @graph structure', () => {
    const payload = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Careers Site' },
        { '@type': 'Organization', name: 'Parent Co' },
        {
          '@type': 'JobPosting',
          title: 'Staff Platform Engineer',
          hiringOrganization: {
            '@type': 'Organization',
            name: 'Acme &amp; Sons',
          },
          jobLocation: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              addressLocality: 'San Francisco',
              addressRegion: 'CA',
              addressCountry: 'US',
            },
          },
          description: '<p>Lead platform reliability and scale distributed infrastructure.</p>',
        },
      ],
    };

    const result = extractSchemaOrgJobPosting(payload);
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Staff Platform Engineer');
    expect(result?.company).toBe('Acme & Sons');
    expect(result?.location).toBe('San Francisco, CA');
    expect(result?.description).toContain('Lead platform reliability');
  });

  it('handles hourly vs yearly salaries correctly', () => {
    // Hourly with unitText: 'HOUR'
    const hourlyPayload = {
      '@type': 'JobPosting',
      title: 'Contract Frontend Developer',
      hiringOrganization: { name: 'DevHouse' },
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: 'USD',
        value: {
          '@type': 'QuantitativeValue',
          minValue: 75,
          maxValue: 95,
          unitText: 'HOUR',
        },
      },
    };

    const hourlyResult = extractSchemaOrgJobPosting(hourlyPayload);
    expect(hourlyResult?.salary).toBe('$75 - $95 / hr');
    expect(hourlyResult?.salaryMin).toBeNull();
    expect(hourlyResult?.salaryMax).toBeNull();

    // Hourly single rate
    const hourlySingle = {
      '@type': 'JobPosting',
      title: 'QA Specialist',
      baseSalary: {
        currency: 'USD',
        value: {
          value: 80,
          unitText: 'HR',
        },
      },
    };
    const hourlySingleResult = extractSchemaOrgJobPosting(hourlySingle);
    expect(hourlySingleResult?.salary).toBe('$80 / hr');
    expect(hourlySingleResult?.salaryMin).toBeNull();
    expect(hourlySingleResult?.salaryMax).toBeNull();

    // Yearly with unitText: 'YEAR'
    const yearlyPayload = {
      '@type': 'JobPosting',
      title: 'Senior Software Engineer',
      hiringOrganization: { name: 'Acme Corp' },
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: 'USD',
        value: {
          '@type': 'QuantitativeValue',
          minValue: 150000,
          maxValue: 180000,
          unitText: 'YEAR',
        },
      },
    };

    const yearlyResult = extractSchemaOrgJobPosting(yearlyPayload);
    expect(yearlyResult?.salary).toBe('$150k - $180k');
    expect(yearlyResult?.salaryMin).toBe(150000);
    expect(yearlyResult?.salaryMax).toBe(180000);

    // Single yearly value
    const yearlySingle = {
      '@type': 'JobPosting',
      baseSalary: {
        currency: 'USD',
        value: {
          value: 165000,
          unitText: 'YEAR',
        },
      },
    };
    const yearlySingleResult = extractSchemaOrgJobPosting(yearlySingle);
    expect(yearlySingleResult?.salary).toBe('$165k');
    expect(yearlySingleResult?.salaryMin).toBe(165000);
    expect(yearlySingleResult?.salaryMax).toBe(165000);
  });

  it('handles multi-location arrays and TELECOMMUTE remote postings', () => {
    // Multi-location array
    const multiLocPayload = {
      '@type': 'JobPosting',
      title: 'Distributed Architect',
      jobLocation: [
        {
          '@type': 'Place',
          address: {
            addressLocality: 'San Francisco',
            addressRegion: 'CA',
          },
        },
        {
          '@type': 'Place',
          address: {
            addressLocality: 'New York',
            addressRegion: 'NY',
          },
        },
      ],
    };

    const multiLocResult = extractSchemaOrgJobPosting(multiLocPayload);
    expect(multiLocResult?.location).toBe('San Francisco, CA; New York, NY');

    // Telecommute with applicantLocationRequirements
    const remotePayload = {
      '@type': 'JobPosting',
      title: 'Remote Product Manager',
      jobLocationType: 'TELECOMMUTE',
      applicantLocationRequirements: {
        '@type': 'Country',
        name: 'United States',
      },
    };

    const remoteResult = extractSchemaOrgJobPosting(remotePayload);
    expect(remoteResult?.location).toBe('Remote (US)');

    // Telecommute with physical hub
    const remoteHubPayload = {
      '@type': 'JobPosting',
      title: 'Remote Engineer',
      jobLocationType: 'TELECOMMUTE',
      jobLocation: {
        address: {
          addressLocality: 'Seattle',
          addressRegion: 'WA',
        },
      },
    };
    const remoteHubResult = extractSchemaOrgJobPosting(remoteHubPayload);
    expect(remoteHubResult?.location).toBe('Remote (Seattle, WA)');
  });

  it('decodes HTML entities across all text fields', () => {
    const encodedPayload = {
      '@type': 'JobPosting',
      title: 'Principal Engineer &amp; Director',
      hiringOrganization: {
        name: 'Ben &amp; Jerry&#39;s',
      },
      jobLocation: {
        address: {
          addressLocality: 'Winston&#45;Salem',
          addressRegion: 'NC',
        },
      },
      description: '<p>Working on Ben &amp; Jerry&#39;s software systems.</p>',
    };

    const result = extractSchemaOrgJobPosting(encodedPayload);
    expect(result?.title).toBe('Principal Engineer & Director');
    expect(result?.company).toBe("Ben & Jerry's");
    expect(result?.location).toBe('Winston-Salem, NC');
    expect(result?.description).toContain("Ben & Jerry's software systems");
  });

  it('returns null when no JobPosting is present in candidates', () => {
    expect(extractSchemaOrgJobPosting(null)).toBeNull();
    expect(extractSchemaOrgJobPosting([])).toBeNull();
    expect(extractSchemaOrgJobPosting({ '@type': 'WebPage', name: 'About Us' })).toBeNull();
  });
});
