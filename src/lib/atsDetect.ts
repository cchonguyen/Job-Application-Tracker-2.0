export type AtsProviderType =
  // Existing Tier 1 / Detected
  | 'greenhouse'
  | 'lever'
  | 'workable'
  | 'ashby'
  | 'darwinbox'
  | 'gem'
  // Enterprise ATS
  | 'workday'
  | 'icims'
  | 'oracle'
  | 'taleo'
  | 'successfactors'
  // Modern Tech ATS (Public JSON APIs)
  | 'smartrecruiters'
  | 'bamboohr'
  | 'recruitee'
  | 'pinpoint'
  | 'rippling'
  | 'dover'
  // Mid-Market HRIS & Portals
  | 'breezy'
  | 'personio'
  | 'teamtailor'
  | 'jobvite'
  | 'jazzhr'
  | 'paylocity'
  // Aggregators
  | 'linkedin'
  | 'indeed'
  | 'glassdoor'
  | 'wellfound'
  | 'builtin'
  | 'yc'
  | 'ziprecruiter';

export interface AtsDetection {
  type: AtsProviderType | null;
  board?: string;
  jobId?: string;
  canonicalUrl?: string;
  unwrappedFrom?: string;
  datacenter?: string; // e.g., wd1, wd3, wd5, wd12 for Workday
  site?: string; // e.g., career site slug for Workday / Oracle
  isAggregator?: boolean;
  requiresBrowserAuth?: boolean;
}

export interface CanonicalizeResult {
  canonicalUrl: string;
  unwrappedFrom?: string;
}

const TRACKING_PARAMS = new Set([
  'ref',
  'refid',
  'trackingid',
  'source',
  'src',
  'fbclid',
  'gclid',
  'mc_eid',
  'lever-source',
  'lever-origin',
  'gh_src',
  '_ga',
  '_gl',
  'ittk',
  'subid',
  'campaign',
  'medium',
  'trk',
  'trkinfo',
  'sessionid',
  'session_id',
  'originalsubdomain',
  'context',
  'position',
  'pagenumber',
]);

const REDIRECT_TARGET_KEYS = [
  'url',
  'redirect_url',
  'dest',
  'target',
  'posurl',
  'externalurl',
  'u',
  'q',
];

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return TRACKING_PARAMS.has(k) || k.startsWith('utm_') || k.startsWith('rx_');
}

/**
 * Normalizes and unwraps job posting URLs.
 * Handles aggregator redirect unwrapping, view URL rewrites (LinkedIn, Indeed),
 * sub-route trimming (/apply, /application, etc.), and tracking query parameter cleaning.
 */
export function canonicalizeJobUrl(rawUrl: string): CanonicalizeResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { canonicalUrl: '' };
  }
  let current = rawUrl.trim();
  if (!current) {
    return { canonicalUrl: '' };
  }

  let unwrappedFrom: string | undefined;

  // 1. Unwrap aggregator redirects (up to 3 hops)
  for (let hop = 0; hop < 3; hop++) {
    try {
      const parsed = new URL(current.includes('://') ? current : `https://${current}`);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();

      const isRedirectWrapper =
        (host.includes('linkedin.com') && path.includes('/redir/redirect')) ||
        (host.includes('indeed.com') && (path.includes('/rc/clk') || path.includes('/pagead/clk'))) ||
        (host.includes('glassdoor.com') && path.includes('/partner/joblisting')) ||
        parsed.searchParams.has('posUrl') ||
        parsed.searchParams.has('externalUrl') ||
        (parsed.searchParams.has('dest') && !host.includes('myworkdayjobs.com'));

      if (isRedirectWrapper) {
        let foundTarget: string | null = null;
        for (const [key, val] of parsed.searchParams.entries()) {
          if (REDIRECT_TARGET_KEYS.includes(key.toLowerCase())) {
            let candidate = val.trim();
            if (candidate.startsWith('http%3A') || candidate.startsWith('https%3A')) {
              try {
                candidate = decodeURIComponent(candidate);
              } catch {
                // Keep raw candidate
              }
            }
            if (/^https?:\/\//i.test(candidate)) {
              foundTarget = candidate;
              break;
            }
          }
        }
        if (foundTarget) {
          if (!unwrappedFrom) {
            unwrappedFrom = current;
          }
          current = foundTarget;
          continue;
        }
      }
      break;
    } catch {
      break;
    }
  }

  // 2. Normalize and clean the resolved URL
  try {
    const url = new URL(current.includes('://') ? current : `https://${current}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = url.pathname;

    // Aggregator view-url rewrites
    // LinkedIn:
    if (host.includes('linkedin.com')) {
      const currentJobId = url.searchParams.get('currentJobId');
      if (currentJobId && /^\d+$/.test(currentJobId.trim())) {
        return {
          canonicalUrl: `https://www.linkedin.com/jobs/view/${currentJobId.trim()}`,
          unwrappedFrom,
        };
      }
      const viewMatch = pathname.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?/);
      if (viewMatch) {
        return {
          canonicalUrl: `https://www.linkedin.com/jobs/view/${viewMatch[1]}`,
          unwrappedFrom,
        };
      }
    }

    // Indeed:
    if (host.includes('indeed.com')) {
      const jk = url.searchParams.get('jk') || url.searchParams.get('vjk');
      if (jk && jk.trim()) {
        return {
          canonicalUrl: `https://www.indeed.com/viewjob?jk=${jk.trim()}`,
          unwrappedFrom,
        };
      }
    }

    // Sub-route trimming: strip /apply, /application, /apply/start, /apply/manual, /apply/login, /apply/linkedin, /c/new, .md
    pathname = pathname.replace(/\.md$/i, '');
    pathname = pathname.replace(
      /\/(?:apply(?:\/(?:start|manual|login|linkedin))?|application|c\/new)\/?$/i,
      ''
    );
    pathname = pathname.replace(/\/+$/, '') || '/';

    // Strip tracking parameters
    const toDelete: string[] = [];
    url.searchParams.forEach((_val, key) => {
      if (isTrackingParam(key)) {
        toDelete.push(key);
      }
    });
    for (const key of toDelete) {
      url.searchParams.delete(key);
    }

    // Protocol: normalize to https
    const protocol = 'https:';
    const qs = url.searchParams.toString();
    const canonicalUrl = `${protocol}//${host}${pathname}${qs ? `?${qs}` : ''}`;

    return {
      canonicalUrl,
      unwrappedFrom,
    };
  } catch {
    return {
      canonicalUrl: current,
      unwrappedFrom,
    };
  }
}

/**
 * Detect known ATS providers or job aggregators from a job posting URL.
 */
export function detectAts(urlStr: string): AtsDetection {
  if (!urlStr || typeof urlStr !== 'string') {
    return { type: null };
  }

  // Reject strings that cannot be valid web URLs
  const trimmed = urlStr.trim();
  if (
    !trimmed.includes('://') &&
    !trimmed.includes('.') &&
    !trimmed.startsWith('localhost')
  ) {
    return { type: null };
  }

  let canonicalRes: CanonicalizeResult;
  let url: URL;
  try {
    canonicalRes = canonicalizeJobUrl(urlStr);
    url = new URL(
      canonicalRes.canonicalUrl.includes('://')
        ? canonicalRes.canonicalUrl
        : `https://${canonicalRes.canonicalUrl}`
    );
  } catch {
    return { type: null };
  }

  const canonicalUrl = canonicalRes.canonicalUrl;
  const unwrappedFrom = canonicalRes.unwrappedFrom;
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  // 1. Gem check:
  // e.g. jobs.gem.com/helix/am9icG9zdDojrAbFcoTPe6GPCNVbneKn
  if (host.includes('gem.com')) {
    const parts = pathname.split('/').filter(Boolean);
    return {
      type: 'gem',
      board: parts[0] || undefined,
      jobId: parts[1] || undefined,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 2. Darwinbox check:
  // e.g. transcarent.darwinbox.com/ms/candidatev2/main/careers/jobDetails/a6a7106352a0d2
  if (host.includes('darwinbox.com') || host.includes('darwinbox.in')) {
    const companyDomain = host.replace(/^www\./, '').split('.')[0];
    const parts = pathname.split('/').filter(Boolean);
    const jobDetailsIdx = parts.indexOf('jobDetails');
    const jobId =
      jobDetailsIdx !== -1 && parts[jobDetailsIdx + 1] ? parts[jobDetailsIdx + 1] : undefined;
    return {
      type: 'darwinbox',
      board: companyDomain,
      jobId,
      requiresBrowserAuth: true,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 3. Workable check:
  // e.g. apply.workable.com/{account}/j/{SHORTCODE}
  //      apply.workable.com/{account}/jobs/view/{SHORTCODE}
  //      {account}.workable.com/j/{SHORTCODE}
  if (host.includes('workable.com')) {
    const parts = pathname.split('/').filter(Boolean);
    if (host.startsWith('apply.') || host === 'workable.com') {
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
          canonicalUrl,
          unwrappedFrom,
        };
      }
    } else {
      const account = host.replace(/^www\./, '').split('.')[0];
      const jIdx = parts.indexOf('j');
      const shortcode = (jIdx !== -1 && parts[jIdx + 1]) || parts[parts.length - 1];
      if (account && shortcode) {
        return {
          type: 'workable',
          board: account,
          jobId: shortcode.replace(/\.md$/i, ''),
          canonicalUrl,
          unwrappedFrom,
        };
      }
    }
  }

  // 4. Ashby check:
  // e.g. jobs.ashbyhq.com/{org}/{uuid}
  if (host.includes('ashbyhq.com')) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0]) {
      return {
        type: 'ashby',
        board: parts[0],
        jobId: parts[1] || undefined,
        canonicalUrl,
        unwrappedFrom,
      };
    }
  }

  // 5. Greenhouse check:
  // e.g. boards.greenhouse.io/{board}/jobs/{id}
  // or job-boards.greenhouse.io/{board}/jobs/{id}
  // or boards.greenhouse.io/embed/job_app?for={board}&token={id}
  if (host.includes('greenhouse.io')) {
    const matchEmbed = searchParams.get('for') && searchParams.get('token');
    if (matchEmbed) {
      return {
        type: 'greenhouse',
        board: searchParams.get('for')!,
        jobId: searchParams.get('token')!,
        canonicalUrl,
        unwrappedFrom,
      };
    }
    const parts = pathname.split('/').filter(Boolean);
    const jobsIdx = parts.indexOf('jobs');
    if (jobsIdx > 0 && parts[jobsIdx + 1]) {
      return {
        type: 'greenhouse',
        board: parts[jobsIdx - 1],
        jobId: parts[jobsIdx + 1],
        canonicalUrl,
        unwrappedFrom,
      };
    }
  }

  // 6. Lever check:
  // e.g. jobs.lever.co/{company}/{id}
  if (host.includes('lever.co')) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return {
        type: 'lever',
        board: parts[0],
        jobId: parts[1],
        canonicalUrl,
        unwrappedFrom,
      };
    }
  }

  // 7. Workday check:
  // e.g. {tenant}.{wd}.myworkdayjobs.com/{locale?}/{site}/job/{loc?}/{slug}
  // or {tenant}.myworkdayjobs.com/...
  if (host.includes('myworkdayjobs.com')) {
    const wdHostMatch = host.match(/^([a-z0-9_-]+)(?:\.(wd\d+))?\.myworkdayjobs\.com$/i);
    const tenant = wdHostMatch ? wdHostMatch[1] : host.split('.')[0];
    const datacenter = wdHostMatch && wdHostMatch[2] ? wdHostMatch[2] : undefined;

    const parts = pathname.split('/').filter(Boolean);
    const jobIdx = parts.indexOf('job');
    let site: string | undefined;
    let jobId: string | undefined;

    if (jobIdx > 0) {
      site = parts[jobIdx - 1];
      jobId = parts[parts.length - 1];
    } else if (parts.length >= 2) {
      site = parts[0];
      jobId = parts[parts.length - 1];
    }

    return {
      type: 'workday',
      board: tenant,
      datacenter,
      site,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 8. iCIMS check:
  // e.g. {company}.icims.com/jobs/{jobId}/...
  // or careers-{company}.icims.com/jobs/{jobId}/...
  if (host.includes('icims.com')) {
    const company = host.replace(/^www\./, '').split('.')[0].replace(/^careers-/, '');
    const parts = pathname.split('/').filter(Boolean);
    const jobsIdx = parts.indexOf('jobs');
    const jobId = jobsIdx !== -1 && parts[jobsIdx + 1] ? parts[jobsIdx + 1] : undefined;
    return {
      type: 'icims',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 9. SmartRecruiters check:
  // e.g. jobs.smartrecruiters.com/{company}/{jobId}
  // or careers.smartrecruiters.com/{company}/{jobId}
  if (host.includes('smartrecruiters.com')) {
    const parts = pathname.split('/').filter(Boolean);
    let company = parts[0];
    let jobId = parts[1];
    if (company === 'jobs' || company === 'careers') {
      company = parts[1];
      jobId = parts[2];
    }
    return {
      type: 'smartrecruiters',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 10. BambooHR check:
  // e.g. {company}.bamboohr.com/careers/{id}
  // or {company}.bamboohr.com/jobs/view.php?id={id}
  if (host.includes('bamboohr.com')) {
    const company = host.split('.')[0];
    const parts = pathname.split('/').filter(Boolean);
    const careersIdx = parts.indexOf('careers');
    const jobId =
      (careersIdx !== -1 && parts[careersIdx + 1]) || searchParams.get('id') || undefined;
    return {
      type: 'bamboohr',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 11. Recruitee check:
  // e.g. {company}.recruitee.com/o/{slug}
  if (host.includes('recruitee.com')) {
    const company = host.split('.')[0];
    const parts = pathname.split('/').filter(Boolean);
    const oIdx = parts.indexOf('o');
    const slug = oIdx !== -1 && parts[oIdx + 1] ? parts[oIdx + 1] : parts[0];
    return {
      type: 'recruitee',
      board: company,
      jobId: slug,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 12. Pinpoint check:
  // e.g. {company}.pinpointhq.com/postings/{uuid}
  // or {company}.pinpointhq.com/en/postings/{uuid}
  if (host.includes('pinpointhq.com')) {
    const company = host.split('.')[0];
    const parts = pathname.split('/').filter(Boolean);
    const postingsIdx = parts.indexOf('postings');
    const uuid =
      postingsIdx !== -1 && parts[postingsIdx + 1]
        ? parts[postingsIdx + 1].replace(/\.json$/i, '')
        : parts[parts.length - 1]?.replace(/\.json$/i, '');
    return {
      type: 'pinpoint',
      board: company,
      jobId: uuid,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 13. Rippling check:
  // e.g. ats.rippling.com/{company}/jobs/{jobId}
  if (host.includes('rippling.com')) {
    const parts = pathname.split('/').filter(Boolean);
    const company = parts[0];
    const jobsIdx = parts.indexOf('jobs');
    const jobId = jobsIdx !== -1 && parts[jobsIdx + 1] ? parts[jobsIdx + 1] : parts[1];
    return {
      type: 'rippling',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 14. Dover check:
  // e.g. app.dover.com/apply/{company}/{jobId}
  if (host.includes('dover.com') || host.includes('dover.io')) {
    const parts = pathname.split('/').filter(Boolean);
    const applyIdx = parts.indexOf('apply');
    const company = applyIdx !== -1 ? parts[applyIdx + 1] : parts[0];
    const jobId = applyIdx !== -1 ? parts[applyIdx + 2] : parts[1];
    return {
      type: 'dover',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 15. Breezy check:
  // e.g. {company}.breezy.hr/p/{jobId}
  if (host.includes('breezy.hr')) {
    const company = host.split('.')[0];
    const parts = pathname.split('/').filter(Boolean);
    const pIdx = parts.indexOf('p');
    const jobId = pIdx !== -1 && parts[pIdx + 1] ? parts[pIdx + 1] : parts[0];
    return {
      type: 'breezy',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 16. Personio check:
  // e.g. {company}.jobs.personio.de/job/{jobId}
  // or {company}.personio.de/...
  if (host.includes('personio.de') || host.includes('personio.com')) {
    const company = host.replace(/\.jobs$/, '').split('.')[0];
    const parts = pathname.split('/').filter(Boolean);
    const jobIdx = parts.indexOf('job');
    const jobId =
      jobIdx !== -1 && parts[jobIdx + 1] ? parts[jobIdx + 1] : parts[parts.length - 1];
    return {
      type: 'personio',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 17. Teamtailor check:
  // e.g. {company}.teamtailor.com/jobs/{jobId}
  if (host.includes('teamtailor.com')) {
    const company = host.split('.')[0];
    const parts = pathname.split('/').filter(Boolean);
    const jobsIdx = parts.indexOf('jobs');
    const jobId =
      jobsIdx !== -1 && parts[jobsIdx + 1] ? parts[jobsIdx + 1] : parts[parts.length - 1];
    return {
      type: 'teamtailor',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 18. Jobvite check:
  // e.g. jobs.jobvite.com/{company}/job/{jobId}
  if (host.includes('jobvite.com')) {
    const parts = pathname.split('/').filter(Boolean);
    const company = parts[0];
    const jobIdx = parts.indexOf('job');
    const jobId =
      (jobIdx !== -1 && parts[jobIdx + 1]) || searchParams.get('j') || parts[1];
    return {
      type: 'jobvite',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 19. JazzHR check:
  // e.g. {company}.applytojob.com/apply/{jobId}
  // or app.jazz.co/apply/{jobId}
  if (host.includes('applytojob.com') || host.includes('jazz.co')) {
    const company = host.split('.')[0];
    const parts = pathname.split('/').filter(Boolean);
    const applyIdx = parts.indexOf('apply');
    const jobId = applyIdx !== -1 && parts[applyIdx + 1] ? parts[applyIdx + 1] : parts[0];
    return {
      type: 'jazzhr',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 20. Paylocity check:
  // e.g. recruiting.paylocity.com/recruiting/jobs/Details/{jobId}/{company}
  if (host.includes('paylocity.com')) {
    const parts = pathname.split('/').filter(Boolean);
    const detailsIdx = parts.findIndex((p) => p.toLowerCase() === 'details');
    const jobId = detailsIdx !== -1 ? parts[detailsIdx + 1] : undefined;
    const company = detailsIdx !== -1 && parts[detailsIdx + 2] ? parts[detailsIdx + 2] : undefined;
    return {
      type: 'paylocity',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 21. Oracle Cloud HCM check:
  // e.g. *.oraclecloud.com/.../requisition/{jobId}
  // or *.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/{site}/requisitions/preview/{jobId}
  if (host.includes('oraclecloud.com')) {
    const parts = pathname.split('/').filter(Boolean);
    let site: string | undefined;
    const sitesIdx = parts.indexOf('sites');
    if (sitesIdx !== -1 && parts[sitesIdx + 1]) {
      site = parts[sitesIdx + 1];
    }
    const reqIdx = parts.findIndex((p) => p.startsWith('requisition'));
    let jobId: string | undefined;
    if (reqIdx !== -1) {
      if (parts[reqIdx + 1] === 'preview' && parts[reqIdx + 2]) {
        jobId = parts[reqIdx + 2];
      } else if (parts[reqIdx + 1]) {
        jobId = parts[reqIdx + 1];
      }
    }
    if (!jobId) {
      jobId =
        searchParams.get('requisitionId') ||
        searchParams.get('reqId') ||
        undefined;
    }
    return {
      type: 'oracle',
      site,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 22. Taleo check:
  // e.g. {company}.taleo.net/careersection/{site}/jobdetail.ftl?job={jobId}
  if (host.includes('taleo.net')) {
    const company = host.split('.')[0];
    const parts = pathname.split('/').filter(Boolean);
    const csIdx = parts.indexOf('careersection');
    const site = csIdx !== -1 && parts[csIdx + 1] ? parts[csIdx + 1] : undefined;
    const jobId = searchParams.get('job') || searchParams.get('jobId') || undefined;
    return {
      type: 'taleo',
      board: company,
      site,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 23. SAP SuccessFactors check:
  // e.g. career*.successfactors.com/career?company={company}&career_job_req_id={jobId}
  if (host.includes('successfactors.')) {
    const company = searchParams.get('company') || host.split('.')[0];
    const jobId =
      searchParams.get('career_job_req_id') || searchParams.get('jobId') || undefined;
    return {
      type: 'successfactors',
      board: company,
      jobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 24. LinkedIn check:
  // e.g. linkedin.com/jobs/view/{id}
  if (host.includes('linkedin.com')) {
    const viewMatch = pathname.match(/\/jobs\/view\/(\d+)/);
    const jobId = viewMatch ? viewMatch[1] : searchParams.get('currentJobId') || undefined;
    return {
      type: 'linkedin',
      jobId,
      isAggregator: true,
      requiresBrowserAuth: true,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 25. Indeed check:
  // e.g. indeed.com/viewjob?jk={id}
  if (host.includes('indeed.com')) {
    const jobId = searchParams.get('jk') || searchParams.get('vjk') || undefined;
    return {
      type: 'indeed',
      jobId,
      isAggregator: true,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 26. Glassdoor check:
  // e.g. glassdoor.com/job-listing/... or glassdoor.com/Job/...
  if (host.includes('glassdoor.com')) {
    const parts = pathname.split('/').filter(Boolean);
    const jobId = searchParams.get('jobListingId') || parts[parts.length - 1];
    return {
      type: 'glassdoor',
      jobId,
      isAggregator: true,
      requiresBrowserAuth: true,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 27. Wellfound check:
  // e.g. wellfound.com/jobs/...
  if (host.includes('wellfound.com') || host.includes('angel.co')) {
    return {
      type: 'wellfound',
      isAggregator: true,
      requiresBrowserAuth: true,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 28. BuiltIn check:
  // e.g. builtin.com/job/...
  if (host.includes('builtin.com') || /^builtin[a-z]+\.com$/.test(host)) {
    return {
      type: 'builtin',
      isAggregator: true,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 29. YC check:
  // e.g. workatastartup.com/jobs/{id}
  if (host.includes('workatastartup.com') || (host.includes('ycombinator.com') && pathname.includes('/jobs'))) {
    const parts = pathname.split('/').filter(Boolean);
    const jobsIdx = parts.indexOf('jobs');
    const jobId = jobsIdx !== -1 && parts[jobsIdx + 1] ? parts[jobsIdx + 1] : undefined;
    return {
      type: 'yc',
      jobId,
      isAggregator: true,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 30. ZipRecruiter check:
  // e.g. ziprecruiter.com/jobs/...
  if (host.includes('ziprecruiter.com')) {
    return {
      type: 'ziprecruiter',
      isAggregator: true,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  // 31. Embedded Greenhouse or Ashby check on custom domains
  // Per Refinement 9:
  // - ?gh_jid= unconditionally matches Greenhouse
  // - ?ashby_jid= unconditionally matches Ashby
  // - ?job_id= matches Greenhouse only as a fallback
  const ghJid = searchParams.get('gh_jid');
  if (ghJid) {
    const companyDomain = host.replace(/^www\./, '').split('.')[0];
    return {
      type: 'greenhouse',
      board: searchParams.get('for') || searchParams.get('board') || companyDomain,
      jobId: ghJid,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  const ashbyJid = searchParams.get('ashby_jid');
  if (ashbyJid) {
    const companyDomain = host.replace(/^www\./, '').split('.')[0];
    return {
      type: 'ashby',
      board: companyDomain,
      jobId: ashbyJid,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  const genericJobId = searchParams.get('job_id');
  if (genericJobId) {
    const companyDomain = host.replace(/^www\./, '').split('.')[0];
    return {
      type: 'greenhouse',
      board: searchParams.get('for') || searchParams.get('board') || companyDomain,
      jobId: genericJobId,
      canonicalUrl,
      unwrappedFrom,
    };
  }

  return {
    type: null,
    canonicalUrl,
  };
}
