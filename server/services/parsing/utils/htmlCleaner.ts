import * as cheerio from 'cheerio';
import { deriveCompanyFromTitle, slugToCompanyName, NON_COMPANY_TOKENS } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson } from '../../../../src/lib/salary.ts';
import { UNKNOWN_COMPANY_METADATA } from '../unknowns.ts';
import { ExtractedJobAttributes, ScrapedHtmlData } from '../types.ts';
import { fetchPublicUrl, readResponseTextUpTo } from './safeFetch.ts';
import {
  cleanHtmlDescription,
  decodeHtmlEntities,
  extractSchemaOrgJobPosting,
  SchemaOrgJobPostingResult,
} from './schemaOrgNormalizer.ts';

export const BANNED_HEADERS_REGEX = /^(job\s+description|job\s+summary|job\s+overview|job\s+details|position\s+overview|position\s+summary|role\s+overview|role\s+summary|about\s+the\s+role|about\s+the\s+job|about\s+the\s+team|about\s+us|who\s+we\s+are|what\s+you'?ll\s+do|what\s+you\s+will\s+do|what\s+you\s+bring|what\s+we'?re\s+looking\s+for|what\s+we\s+offer|who\s+you\s+are|responsibilities|key\s+responsibilities|essential\s+duties|qualifications|requirements|minimum\s+qualifications|preferred\s+qualifications|skills\s+and\s+experience|skills|experience|benefits|perks|compensation|total\s+rewards|pay\s+range|salary|location|remote|hybrid|apply\s+now|how\s+to\s+apply|equal\s+opportunity|overview|summary|description|introduction|careers?)$/i;

export const OG_SITE_NAME_ATS_NOISE = Array.from(NON_COMPANY_TOKENS);

export const GENERIC_HOST_TOKENS = ['jobs', 'careers', 'boards', 'job-boards', 'app', 'apply', 'career'];

export function cleanCompanyName(rawUrl: string, ogSiteName?: string, text?: string, titleHint?: string): string {
  if (ogSiteName && !OG_SITE_NAME_ATS_NOISE.some((noise) => ogSiteName.toLowerCase().includes(noise))) {
    return ogSiteName.trim();
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const host = parsedUrl.hostname.toLowerCase();

    // Gem check: jobs.gem.com/helix/...
    if (host.includes('gem.com')) {
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      if (parts[0]) {
        return slugToCompanyName(parts[0]);
      }
    }

    // Ashby HQ URL path: /Overjet/3b74e8b2-0872-48a6-8995-663b944c89aa
    if (host.includes('ashbyhq.com')) {
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      if (parts[0]) {
        return slugToCompanyName(parts[0]);
      }
    }

    // Workable: apply.workable.com/{account}/... or {account}.workable.com/...
    if (host.includes('workable.com')) {
      const fromTitle = deriveCompanyFromTitle(titleHint);
      if (fromTitle) return fromTitle;
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      const account =
        host.startsWith('apply.') || host === 'workable.com' || host === 'www.workable.com'
          ? parts[0]
          : host.replace(/^www\./, '').split('.')[0];
      if (account) return slugToCompanyName(account);
    }

    // Workday path: /en-US/InitechHealthPartnersCareers/job/...
    const workdayMatch = parsedUrl.pathname.match(/\/([A-Za-z]+)(?:Careers|Jobs)?\/job\//i);
    if (workdayMatch && workdayMatch[1]) {
      return workdayMatch[1].replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    }

    if (text) {
      const careerAtMatch = text.match(/(?:career|job|opportunity|work)\s+at\s+([A-Z][A-Za-z0-9\s&]{2,30})[!.]/i);
      if (careerAtMatch && careerAtMatch[1]) {
        return careerAtMatch[1].trim();
      }
      const atMissionMatch = text.match(/At\s+([A-Z][A-Za-z0-9\s&]{2,20}),\s+(?:our\s+mission|we|our)/i);
      if (atMissionMatch && atMissionMatch[1]) {
        return atMissionMatch[1].trim();
      }
    }

    const hostParts = parsedUrl.hostname.replace('www.', '').split('.');
    let hostToken = hostParts[0];
    if (GENERIC_HOST_TOKENS.includes(hostToken.toLowerCase()) && hostParts[1] && hostParts[1] !== 'com') {
      hostToken = hostParts[1];
    }
    if (GENERIC_HOST_TOKENS.includes(hostToken.toLowerCase())) {
      const fromTitle = deriveCompanyFromTitle(titleHint);
      if (fromTitle) return fromTitle;
    }
    return hostToken.charAt(0).toUpperCase() + hostToken.slice(1);
  } catch {
    return deriveCompanyFromTitle(titleHint) || 'Company';
  }
}

/**
 * Recursively inspects a parsed JavaScript / JSON hydration state object for job posting data.
 */
function findJobInSpaObject(obj: any, depth = 0): any | null {
  if (!obj || typeof obj !== 'object' || depth > 8) return null;

  // Direct job object detection
  if (
    (typeof obj.title === 'string' || typeof obj.jobTitle === 'string') &&
    (typeof obj.description === 'string' ||
      typeof obj.jobDescription === 'string' ||
      Array.isArray(obj.requirements) ||
      typeof obj.content === 'string')
  ) {
    return obj;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findJobInSpaObject(item, depth + 1);
      if (found) return found;
    }
  } else {
    const priorityKeys = ['job', 'jobPosting', 'posting', 'jobData', 'position', 'pageProps', 'props', 'data'];
    for (const k of priorityKeys) {
      if (obj[k]) {
        const found = findJobInSpaObject(obj[k], depth + 1);
        if (found) return found;
      }
    }
    for (const k of Object.keys(obj)) {
      if (!priorityKeys.includes(k) && typeof obj[k] === 'object' && obj[k] !== null) {
        const found = findJobInSpaObject(obj[k], depth + 1);
        if (found) return found;
      }
    }
  }

  return null;
}

export async function scrapeHtmlWithCheerio(urlStr: string): Promise<ScrapedHtmlData> {
  const response = await fetchPublicUrl(urlStr, {
    // Slow or hanging career sites must not stall the ingest; past this the pipeline moves on to Tier 4.
    signal: AbortSignal.timeout(10_000),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  });

  const status = response.status;
  if (!response.ok && status !== 200) {
    throw new Error(`Scraper received HTTP ${status} from target server`);
  }

  // Stream-bounded fetch up to 2MB to protect Worker and V8 memory
  const html = await readResponseTextUpTo(response, 2 * 1024 * 1024);
  const $ = cheerio.load(html);

  // 1. Extract JSON-LD candidates across all <script type="application/ld+json"> tags
  const jsonLdCandidates: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      if (content) {
        jsonLdCandidates.push(JSON.parse(content));
      }
    } catch {
      // Ignore JSON parse errors for malformed snippets
    }
  });

  let normalizedJob = extractSchemaOrgJobPosting(jsonLdCandidates);
  let jsonLd: any = normalizedJob
    ? {
        ...normalizedJob.raw,
        _normalized: normalizedJob,
        title: normalizedJob.title,
        company: normalizedJob.company,
        location: normalizedJob.location,
        salary: normalizedJob.salary,
        salaryMin: normalizedJob.salaryMin,
        salaryMax: normalizedJob.salaryMax,
      }
    : jsonLdCandidates[0] || null;

  // 2. SPA Hydration State Extraction (__NEXT_DATA__, __INITIAL_STATE__, __PRELOADED_STATE__)
  let spaState: any = null;
  const nextDataHtml = $('script#__NEXT_DATA__').html();
  if (nextDataHtml) {
    try {
      const parsedNext = JSON.parse(nextDataHtml);
      const schemaFromNext = extractSchemaOrgJobPosting(parsedNext);
      if (schemaFromNext && !normalizedJob) {
        normalizedJob = schemaFromNext;
        jsonLd = {
          ...schemaFromNext.raw,
          _normalized: schemaFromNext,
          title: schemaFromNext.title,
          company: schemaFromNext.company,
          location: schemaFromNext.location,
          salary: schemaFromNext.salary,
          salaryMin: schemaFromNext.salaryMin,
          salaryMax: schemaFromNext.salaryMax,
        };
      }
      const rawJobState = findJobInSpaObject(parsedNext?.props?.pageProps || parsedNext);
      if (rawJobState) {
        spaState = rawJobState;
      }
    } catch {}
  }

  if (!spaState) {
    $('script:not([src])').each((_, el) => {
      if (spaState) return;
      const scriptContent = $(el).html() || '';
      if (
        scriptContent.includes('__INITIAL_STATE__') ||
        scriptContent.includes('__PRELOADED_STATE__') ||
        scriptContent.includes('__APOLLO_STATE__')
      ) {
        const stateMatch = scriptContent.match(
          /window\.(?:__INITIAL_STATE__|__PRELOADED_STATE__|__APOLLO_STATE__)\s*=\s*(\{.*?\});/s
        );
        if (stateMatch && stateMatch[1]) {
          try {
            const parsed = JSON.parse(stateMatch[1]);
            const schemaFromState = extractSchemaOrgJobPosting(parsed);
            if (schemaFromState && !normalizedJob) {
              normalizedJob = schemaFromState;
              jsonLd = {
                ...schemaFromState.raw,
                _normalized: schemaFromState,
                title: schemaFromState.title,
                company: schemaFromState.company,
                location: schemaFromState.location,
                salary: schemaFromState.salary,
                salaryMin: schemaFromState.salaryMin,
                salaryMax: schemaFromState.salaryMax,
              };
            }
            const foundState = findJobInSpaObject(parsed);
            if (foundState) {
              spaState = foundState;
            }
          } catch {}
        }
      }
    });
  }

  // 3. Embedded Greenhouse / Ashby discovery: custom career pages that embed a board's script, iframe or link
  let detectedAts: { type: string; board?: string; jobId?: string } | undefined;

  // Search Greenhouse script/iframe embeds
  $('script[src*="greenhouse.io"], iframe[src*="greenhouse.io"], a[href*="greenhouse.io"]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('href') || '';
    const forMatch = src.match(/[?&]for=([a-zA-Z0-9_-]+)/i);
    const tokenMatch = src.match(/[?&]token=([0-9]+)/i) || src.match(/\/jobs\/([0-9]+)/i);
    const boardMatch = src.match(/boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?([a-zA-Z0-9_-]+)/i);

    const b = forMatch?.[1] || boardMatch?.[1];
    const j = tokenMatch?.[1];

    if (b && (!detectedAts || detectedAts.type !== 'greenhouse')) {
      detectedAts = {
        type: 'greenhouse',
        board: b,
        jobId: j,
      };
    } else if (j && detectedAts && detectedAts.type === 'greenhouse' && !detectedAts.jobId) {
      detectedAts.jobId = j;
    }
  });

  // Search Ashby script/iframe embeds
  if (!detectedAts) {
    $('script[src*="ashbyhq.com"], iframe[src*="ashbyhq.com"], a[href*="ashbyhq.com"]').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('href') || '';
      const ashbyMatch = src.match(/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)(?:\/([a-zA-Z0-9_-]{8,}))?/i);
      if (ashbyMatch && ashbyMatch[1]) {
        if (!detectedAts) {
          detectedAts = {
            type: 'ashby',
            board: ashbyMatch[1],
            jobId: ashbyMatch[2],
          };
        } else if (ashbyMatch[2] && !detectedAts.jobId) {
          detectedAts.jobId = ashbyMatch[2];
        }
      }
    });
  }

  // 4. iCIMS iframe unwrapping: if page contains #icims_content_iframe or iframe pointing to icims.com,
  // or is an iCIMS shell without content, fetch ?in_iframe=1 to retrieve inner Schema.org JSON-LD & DOM.
  const icimsIframe = $('iframe#icims_content_iframe, iframe[src*="icims.com"], iframe[name="icims_content_iframe"]');
  const isIcimsPortal = urlStr.includes('icims.com') || icimsIframe.length > 0;

  if (isIcimsPortal && !jsonLd?._normalized) {
    let iframeUrl: string | null = null;
    const iframeSrc = icimsIframe.attr('src');
    if (iframeSrc) {
      try {
        iframeUrl = new URL(iframeSrc, urlStr).toString();
      } catch {}
    } else if (urlStr.includes('icims.com') && !urlStr.includes('in_iframe=1')) {
      try {
        const u = new URL(urlStr);
        u.searchParams.set('in_iframe', '1');
        iframeUrl = u.toString();
      } catch {}
    }

    if (iframeUrl) {
      try {
        if (!iframeUrl.includes('in_iframe=1')) {
          const u = new URL(iframeUrl);
          u.searchParams.set('in_iframe', '1');
          iframeUrl = u.toString();
        }
        const innerResp = await fetchPublicUrl(iframeUrl, {
          signal: AbortSignal.timeout(6000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        if (innerResp.ok) {
          const innerHtml = await readResponseTextUpTo(innerResp, 2 * 1024 * 1024);
          const $inner = cheerio.load(innerHtml);

          const innerCandidates: any[] = [];
          $inner('script[type="application/ld+json"]').each((_, el) => {
            try {
              const c = $inner(el).html();
              if (c) innerCandidates.push(JSON.parse(c));
            } catch {}
          });

          const innerNormalized = extractSchemaOrgJobPosting(innerCandidates);
          if (innerNormalized) {
            normalizedJob = innerNormalized;
            jsonLd = {
              ...innerNormalized.raw,
              _normalized: innerNormalized,
              title: innerNormalized.title,
              company: innerNormalized.company,
              location: innerNormalized.location,
              salary: innerNormalized.salary,
              salaryMin: innerNormalized.salaryMin,
              salaryMax: innerNormalized.salaryMax,
            };
          }

          // If inner page has rich job content, use it to augment DOM text
          $inner('script, style, noscript, svg, nav, footer, header').remove();
          const innerMainText = $inner('.iCIMS_JobContent, .icims_job_content, main, article, body').text();
          if (innerMainText && innerMainText.trim().length > 150) {
            $('body').append(`<div>${innerMainText}</div>`);
          }
        }
      } catch {
        // Iframe fetch failure is non-fatal; continue with outer page data
      }
    }
  }

  // Extract Meta tags
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDescription = $('meta[property="og:description"]').attr('content');
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  const metaDescription = $('meta[name="description"]').attr('content');
  const title = normalizedJob?.title || $('title').text() || '';

  // Clean body text
  $('script, style, noscript, iframe, svg, nav, footer, header').remove();
  let mainText = $('main, article, [role="main"], [class*="job"], [class*="posting"], [id*="job"], [id*="posting"]').text();
  if (!mainText || mainText.trim().length < 200) {
    mainText = $('body').text();
  }

  const metaText = [metaDescription, ogDescription].filter(Boolean).join('\n\n');
  if (metaText.length > 100 && (!mainText || mainText.trim().length < 200 || metaText.length > mainText.length)) {
    mainText = [metaText, mainText].filter(Boolean).join('\n\n');
  }

  // If normalized description from JSON-LD or SPA is available and DOM text is sparse, augment it
  const spaRawDesc = spaState?.description || spaState?.jobDescription || spaState?.content;
  if ((!mainText || mainText.trim().length < 200) && normalizedJob?.description) {
    mainText = [normalizedJob.description, mainText].filter(Boolean).join('\n\n');
  } else if ((!mainText || mainText.trim().length < 200) && spaRawDesc) {
    const cleanSpaDesc = cleanHtmlDescription(String(spaRawDesc));
    mainText = [cleanSpaDesc, mainText].filter(Boolean).join('\n\n');
  }

  const cleanedText = mainText
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);

  return {
    title,
    metaDescription,
    ogTitle,
    ogDescription,
    ogSiteName,
    jsonLd,
    cleanedText,
    rawHtmlStatus: status,
    detectedAts,
    spaState,
  };
}

export function parseManualTextDeterministically(text: string, targetUrl?: string): ExtractedJobAttributes {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  let company = '';
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      const hostParts = parsed.hostname.replace(/^www\./, '').split('.');
      let compSlug = hostParts[0];
      if (['careers', 'jobs', 'boards', 'job-boards', 'app', 'ms'].includes(compSlug.toLowerCase()) && hostParts[1]) {
        compSlug = hostParts[1];
      }
      if (compSlug && !['candidatev2', 'careers', 'jobs'].includes(compSlug.toLowerCase())) {
        company = compSlug.charAt(0).toUpperCase() + compSlug.slice(1);
      }
    } catch {}
  }

  if (!company) {
    const compMatch = text.match(/(?:company|organization|employer)\s*[:\-]\s*([^\n]+)/i);
    if (compMatch && compMatch[1]) {
      company = compMatch[1].trim();
    }
  }

  if (!company) {
    const possMatch = text.match(
      /\b([A-Z][a-zA-Z0-9]+)\x27s\s+(?:Pharmacy|Care|solution|team|product|mission|vision|members?|patients?|platform|business|clients?|customers?)\b/i
    );
    if (possMatch && possMatch[1] && !BANNED_HEADERS_REGEX.test(possMatch[1])) {
      company = possMatch[1].trim();
    }
  }

  if (!company) {
    const atMatch = text.match(/(?:at|join|working\s+with|about)\s+([A-Z][A-Za-z0-9&.\s]{2,30}?)(?:\s+is|\s+as|\s+in|\s+team|\.|\n|$)/);
    if (atMatch && atMatch[1] && !BANNED_HEADERS_REGEX.test(atMatch[1])) {
      company = atMatch[1].trim();
    }
  }

  if (!company) {
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (
        !BANNED_HEADERS_REGEX.test(line) &&
        line.length >= 2 &&
        line.length <= 40 &&
        !/^(location|salary|remote|hybrid|status|pay|\$)/i.test(line) &&
        !/\b(Manager|Engineer|Developer|Specialist|Analyst)\b/i.test(line)
      ) {
        company = line;
        break;
      }
    }
  }
  if (!company) company = 'Direct Applicant Posting';

  let jobTitle = '';
  const titleMatch = text.match(/(?:job\s+title|role|position|title)\s*[:\-]\s*([^\n]+)/i);
  if (titleMatch && titleMatch[1]) {
    jobTitle = titleMatch[1].trim();
  }

  if (!jobTitle) {
    const roleIntroMatch = text.match(
      /(?:The\s+)?((?:Senior|Sr\.?|Lead|Principal|Staff|Associate|Director|Head\s+of|VP\s+of)?\s*(?:Product\s+Manager|Software\s+Engineer|Engineering\s+Manager|Data\s+Scientist|Data\s+Engineer|Product\s+Designer|Specialist|Analyst)(?:[,\s\-–—]+[A-Za-z\s&/]+?)?)(?:\s+(?:role|position|presents|is|will|at|team|leads|shapes|offers|requires|\.|\n))/i
    );
    if (roleIntroMatch && roleIntroMatch[1]) {
      jobTitle = roleIntroMatch[1].trim();
    }
  }

  if (!jobTitle) {
    const phraseMatch = text.match(
      /(?:opportunity\s+for\s+a(?:n)?|seeking\s+a(?:n)?|hiring\s+a(?:n)?|role\s+of\s+(?:a(?:n)?\s+)?|position\s+of\s+(?:a(?:n)?\s+)?)\s+([A-Za-z\s,\/&-]+?(?:Manager|Engineer|Lead|Director|Specialist|Analyst|Scientist|Designer))/i
    );
    if (phraseMatch && phraseMatch[1]) {
      jobTitle = phraseMatch[1].trim();
    }
  }

  if (!jobTitle) {
    for (let i = 0; i < Math.min(6, lines.length); i++) {
      const line = lines[i];
      if (
        !BANNED_HEADERS_REGEX.test(line) &&
        line !== company &&
        line.length >= 4 &&
        line.length <= 75 &&
        /\b(Manager|Engineer|Developer|Architect|Lead|Director|Specialist|Analyst|Scientist|Designer)\b/i.test(line)
      ) {
        jobTitle = line;
        break;
      }
    }
  }

  if (!jobTitle) {
    for (let i = 0; i < Math.min(4, lines.length); i++) {
      const line = lines[i];
      if (!BANNED_HEADERS_REGEX.test(line) && line !== company && line.length >= 3 && line.length <= 75) {
        jobTitle = line;
        break;
      }
    }
  }
  if (!jobTitle) jobTitle = 'Software & Product Specialist';

  let team = '';
  const teamMatch = text.match(/(?:team|group|unit)\s*[:\-]\s*([^\n]+)/i);
  if (teamMatch && teamMatch[1]) {
    team = teamMatch[1].trim();
  } else if (jobTitle.includes(',') || jobTitle.includes(' - ') || jobTitle.includes(' – ')) {
    const parts = jobTitle.split(/,|\s+[-–—]\s+/);
    if (parts.length >= 2) {
      jobTitle = parts[0].trim();
      team = parts.slice(1).join(', ').trim();
    }
  } else {
    jobTitle = jobTitle.replace(/\s*[-|•].*$/, '').trim();
  }

  // No company/title hints: a fallback snapshot must not substitute benchmark salaries for what the text says.
  const salary = extractSalaryFromTextOrJson(text);

  let location = 'Not listed';
  const locMatch = text.match(/(?:location|workplace|office)\s*[:\-]\s*([^\n]+)/i);
  if (locMatch && locMatch[1]) {
    location = locMatch[1].trim();
  } else if (/hybrid/i.test(text)) {
    location = 'Hybrid (US)';
  } else if (/on-site|onsite/i.test(text)) {
    location = 'On-site';
  }

  const isSr = /\b(sr|senior|lead|principal|director|head|staff|vp)\b/i.test(jobTitle);
  const seniority = isSr ? 'Senior' : 'Mid-level';

  let department = 'Product & Engineering';
  if (/product/i.test(jobTitle)) department = 'Product';
  else if (/engineer|developer|architect|full\s*stack/i.test(jobTitle)) department = 'Engineering';
  else if (/data|analytics|scientist/i.test(jobTitle)) department = 'Data & Analytics';
  else if (/design|ux|ui/i.test(jobTitle)) department = 'Design';
  else if (/sales|account/i.test(jobTitle)) department = 'Sales';
  else if (/marketing/i.test(jobTitle)) department = 'Marketing';

  const commonSkills = [
    'Product Management', 'Product Strategy', 'Roadmap Strategy', 'Agile Delivery', 'System Design',
    'TypeScript', 'React', 'Node.js', 'Python', 'SQL', 'Cloud Infrastructure',
    'Cross-functional Leadership', 'Data Analysis', 'User Research', 'Healthcare Tech', 'Pharmacy Care'
  ];
  const detectedSkills = commonSkills.filter(skill => new RegExp(`\\b${skill}\\b`, 'i').test(text));
  const requiredSkills = detectedSkills.slice(0, 5);

  const cleanSummary = lines.filter(l => !BANNED_HEADERS_REGEX.test(l)).slice(0, 4).join(' ').slice(0, 400);

  const industry = 'Unknown';

  return {
    company,
    jobTitle,
    team: team || undefined,
    location,
    salary: salary.salary,
    salaryMin: salary.salaryMin,
    salaryMax: salary.salaryMax,
    industry,
    summary: cleanSummary || `${company} is hiring for the role of ${jobTitle}.`,
    companyMetadata: { ...UNKNOWN_COMPANY_METADATA },
    positionMetadata: {
      seniority,
      department,
      employmentType: /contract/i.test(text) ? 'Contract' : /full[-\s]?time/i.test(text) ? 'Full-time' : 'Unknown',
      requiredSkills,
    },
  };
}

export function parseUrlDeterministically(urlStr: string, scraped?: ScrapedHtmlData | null): ExtractedJobAttributes {
  let company = 'Target Company';
  let jobTitle = 'Software & Product Specialist';
  let location = 'Not listed';
  let salaryInfo = { salary: 'Not listed', salaryMin: null as number | null, salaryMax: null as number | null };

  if (scraped) {
    if (scraped.title || scraped.ogTitle) {
      jobTitle = scraped.ogTitle || scraped.title || jobTitle;
    }
    const combinedScrapedText = [
      scraped.cleanedText,
      scraped.metaDescription,
      scraped.ogDescription,
    ]
      .filter(Boolean)
      .join('\n\n');

    company = cleanCompanyName(urlStr, scraped.ogSiteName, combinedScrapedText, scraped.ogTitle || scraped.title);
    salaryInfo = extractSalaryFromTextOrJson(combinedScrapedText, scraped.jsonLd);
    if (combinedScrapedText && /remote/i.test(combinedScrapedText)) {
      location = 'Remote';
    }

    if (scraped.jsonLd?._normalized) {
      const norm = scraped.jsonLd._normalized as SchemaOrgJobPostingResult;
      if (norm.title) jobTitle = norm.title;
      if (norm.company) company = norm.company;
      if (norm.location) location = norm.location;
      if (norm.salary && norm.salary !== 'Not listed') {
        salaryInfo = {
          salary: norm.salary,
          salaryMin: norm.salaryMin ?? null,
          salaryMax: norm.salaryMax ?? null,
        };
      }
    }
  }

  try {
    const parsed = new URL(urlStr);
    const hostParts = parsed.hostname.replace(/^www\./, '').split('.');
    let compSlug = hostParts[0];
    if (['careers', 'jobs', 'boards', 'job-boards', 'app'].includes(compSlug.toLowerCase()) && hostParts[1]) {
      compSlug = hostParts[1];
    }
    if (company === 'Target Company' || company === 'Company') {
      company = compSlug.charAt(0).toUpperCase() + compSlug.slice(1);
    }

    if (
      jobTitle === 'Software & Product Specialist' ||
      jobTitle.toLowerCase().includes('careers at') ||
      jobTitle.includes('403') ||
      jobTitle.includes('Blocked')
    ) {
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      for (const p of pathParts) {
        if (p.includes('-') && p.length > 5 && !/^[0-9a-f-]{25,}$/i.test(p)) {
          jobTitle = p
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          break;
        }
      }
    }
  } catch {}

  let team: string | undefined;
  if (jobTitle.includes(',') || jobTitle.includes(' - ') || jobTitle.includes(' – ')) {
    const parts = jobTitle.split(/,|\s+[-–—]\s+/);
    if (parts.length >= 2) {
      jobTitle = parts[0].trim();
      team = parts.slice(1).join(', ').trim();
    }
  } else {
    jobTitle = jobTitle.replace(/\s*[-|•].*$/, '').trim() || 'Software & Product Specialist';
  }

  const isSr = /\b(sr|senior|lead|principal|director|head|staff|vp)\b/i.test(jobTitle);
  let department = 'Product & Engineering';
  if (/product/i.test(jobTitle)) department = 'Product';
  else if (/engineer|developer|architect/i.test(jobTitle)) department = 'Engineering';
  else if (/data|analytics/i.test(jobTitle)) department = 'Data & Analytics';

  return {
    company,
    jobTitle,
    team: team || undefined,
    location,
    salary: salaryInfo.salary,
    salaryMin: salaryInfo.salaryMin,
    salaryMax: salaryInfo.salaryMax,
    industry: 'Unknown',
    summary:
      scraped?.ogDescription ||
      scraped?.metaDescription ||
      `The posting page could not be read automatically. Company and title were taken from the link; open the posting to review the details.`,
    companyMetadata: { ...UNKNOWN_COMPANY_METADATA },
    positionMetadata: {
      seniority: isSr ? 'Senior' : 'Mid-level',
      department,
      employmentType: 'Unknown',
      team: team || undefined,
      requiredSkills: [],
    },
  };
}
