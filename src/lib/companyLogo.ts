const ATS_HOST_HINTS = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'myworkdayjobs.com',
  'workdayjobs.com',
  'darwinbox.com',
  'icims.com',
  'jobvite.com',
  'smartrecruiters.com',
  'bamboohr.com',
  'recruitee.com',
  'applytojob.com',
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
];

const GENERIC_LABELS = new Set([
  'www',
  'careers',
  'jobs',
  'job',
  'career',
  'apply',
  'boards',
  'board',
  'app',
  'cdn',
  'static',
  'api',
  'm',
  'mobile',
]);

/**
 * Guess a brandable company hostname from a job posting URL.
 * Avoids ATS hosts (Greenhouse, Lever, etc.) when a cleaner signal exists.
 */
export function companyDomainFromJobUrl(urlStr?: string | null, companyName?: string): string | null {
  if (urlStr) {
    try {
      const url = new URL(urlStr);
      const host = url.hostname.replace(/^www\./i, '').toLowerCase();

      // Greenhouse: boards.greenhouse.io/{board}/jobs/...
      if (host.includes('greenhouse.io')) {
        const parts = url.pathname.split('/').filter(Boolean);
        const jobsIdx = parts.indexOf('jobs');
        if (jobsIdx > 0 && parts[jobsIdx - 1]) {
          return `${parts[jobsIdx - 1].toLowerCase()}.com`;
        }
        const board = url.searchParams.get('for') || url.searchParams.get('board');
        if (board) return `${board.toLowerCase()}.com`;
      }

      // Lever: jobs.lever.co/{company}/...
      if (host.includes('lever.co')) {
        const company = url.pathname.split('/').filter(Boolean)[0];
        if (company) return `${company.toLowerCase()}.com`;
      }

      // Ashby: jobs.ashbyhq.com/{Company}/...
      if (host.includes('ashbyhq.com')) {
        const company = url.pathname.split('/').filter(Boolean)[0];
        if (company) return `${decodeURIComponent(company).toLowerCase()}.com`;
      }

      // Workday: company.wd5.myworkdayjobs.com/...
      if (host.includes('myworkdayjobs.com') || host.includes('workdayjobs.com')) {
        const sub = host.split('.')[0];
        if (sub && !GENERIC_LABELS.has(sub)) {
          return `${sub.replace(/careers$/i, '').replace(/jobs$/i, '').toLowerCase()}.com`;
        }
      }

      // Embedded Greenhouse on company site (?gh_jid= / ?job_id=)
      if (url.searchParams.get('gh_jid') || url.searchParams.get('job_id')) {
        if (!ATS_HOST_HINTS.some((h) => host.endsWith(h))) {
          return host;
        }
      }

      // Direct career sites: careers.stripe.com, jobs.datadoghq.com, stripe.com
      if (!ATS_HOST_HINTS.some((h) => host.endsWith(h))) {
        const labels = host.split('.');
        if (labels.length >= 2) {
          // Prefer apex: careers.stripe.com -> stripe.com
          if (GENERIC_LABELS.has(labels[0]) && labels.length >= 3) {
            return labels.slice(1).join('.');
          }
          return host;
        }
      }
    } catch {
      // fall through to name heuristic
    }
  }

  if (companyName) {
    const slug = companyName
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '')
      .trim();
    if (slug.length >= 2) return `${slug}.com`;
  }

  return null;
}

/** Public logo URL (Google favicon S2 — no API key). */
export function companyLogoUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function resolveCompanyLogo(
  url?: string | null,
  companyName?: string,
  size = 128
): { domain: string; src: string } | null {
  const domain = companyDomainFromJobUrl(url, companyName);
  if (!domain) return null;
  return { domain, src: companyLogoUrl(domain, size) };
}
