export interface AtsDetection {
  type: 'greenhouse' | 'lever' | 'darwinbox' | 'gem' | 'workable' | 'ashby' | null;
  board?: string;
  jobId?: string;
}

/**
 * Detect known ATS providers from a job posting URL.
 */
export function detectAts(urlStr: string): AtsDetection {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname;

    // Gem check:
    // e.g. jobs.gem.com/helix/am9icG9zdDojrAbFcoTPe6GPCNVbneKn
    if (host.includes('gem.com')) {
      const parts = pathname.split('/').filter(Boolean);
      return {
        type: 'gem',
        board: parts[0] || undefined,
        jobId: parts[1] || undefined,
      };
    }

    // Darwinbox check:
    // e.g. transcarent.darwinbox.com/ms/candidatev2/main/careers/jobDetails/a6a7106352a0d2
    if (host.includes('darwinbox.com')) {
      const companyDomain = host.replace(/^www\./, '').split('.')[0];
      const parts = pathname.split('/').filter(Boolean);
      const jobDetailsIdx = parts.indexOf('jobDetails');
      const jobId = jobDetailsIdx !== -1 && parts[jobDetailsIdx + 1] ? parts[jobDetailsIdx + 1] : undefined;
      return {
        type: 'darwinbox',
        board: companyDomain,
        jobId,
      };
    }

    // Workable check:
    // e.g. apply.workable.com/{account}/j/{SHORTCODE}
    //      apply.workable.com/{account}/jobs/view/{SHORTCODE}(.md)
    //      {account}.workable.com/j/{SHORTCODE}
    if (host.includes('workable.com')) {
      const parts = pathname.split('/').filter(Boolean);
      // Hosted apply pages carry the account slug as the first path segment.
      if (host.startsWith('apply.') || host === 'workable.com' || host === 'www.workable.com') {
        const account = parts[0];
        const jIdx = parts.indexOf('j');
        const viewIdx = parts.indexOf('view');
        const shortcode =
          (jIdx !== -1 && parts[jIdx + 1]) ||
          (viewIdx !== -1 && parts[viewIdx + 1]) ||
          undefined;
        if (account && shortcode) {
          return {
            type: 'workable',
            board: account,
            jobId: shortcode.replace(/\.md$/i, ''),
          };
        }
      } else {
        // Custom account subdomain: {account}.workable.com/j/{SHORTCODE}
        const account = host.replace(/^www\./, '').split('.')[0];
        const jIdx = parts.indexOf('j');
        const shortcode = (jIdx !== -1 && parts[jIdx + 1]) || parts[parts.length - 1];
        if (account && shortcode) {
          return {
            type: 'workable',
            board: account,
            jobId: shortcode.replace(/\.md$/i, ''),
          };
        }
      }
    }

    // Ashby check:
    // e.g. jobs.ashbyhq.com/{org}/{uuid}
    if (host.includes('ashbyhq.com')) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts[0]) {
        return {
          type: 'ashby',
          board: parts[0],
          jobId: parts[1] || undefined,
        };
      }
    }

    // Greenhouse check:
    // e.g., boards.greenhouse.io/{board}/jobs/{id}
    // or job-boards.greenhouse.io/{board}/jobs/{id}
    // or boards.greenhouse.io/embed/job_app?for={board}&token={id}
    if (host.includes('greenhouse.io')) {
      const matchEmbed = url.searchParams.get('for') && url.searchParams.get('token');
      if (matchEmbed) {
        return {
          type: 'greenhouse',
          board: url.searchParams.get('for')!,
          jobId: url.searchParams.get('token')!,
        };
      }
      const parts = pathname.split('/').filter(Boolean);
      // /boardName/jobs/jobId
      const jobsIdx = parts.indexOf('jobs');
      if (jobsIdx > 0 && parts[jobsIdx + 1]) {
        return {
          type: 'greenhouse',
          board: parts[jobsIdx - 1],
          jobId: parts[jobsIdx + 1],
        };
      }
    }

    // Lever check:
    // e.g., jobs.lever.co/{company}/{id}
    if (host.includes('lever.co')) {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return {
          type: 'lever',
          board: parts[0],
          jobId: parts[1],
        };
      }
    }

    // Embedded Greenhouse check on custom domains (e.g. datavant.com/open-roles/job?job_id=5301310008 or ?gh_jid=...)
    const ghJobId = url.searchParams.get('job_id') || url.searchParams.get('gh_jid');
    if (ghJobId) {
      const companyDomain = host.replace(/^www\./, '').split('.')[0];
      return {
        type: 'greenhouse',
        board: url.searchParams.get('for') || url.searchParams.get('board') || companyDomain,
        jobId: ghJobId,
      };
    }

    return { type: null };
  } catch {
    return { type: null };
  }
}
