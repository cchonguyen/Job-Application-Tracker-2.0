import * as cheerio from 'cheerio';
import { deriveCompanyFromTitle, slugToCompanyName } from '../../../../src/lib/companyName.ts';
import { extractSalaryFromTextOrJson } from '../../../../src/lib/salary.ts';
import { ExtractedJobAttributes, ScrapedHtmlData } from '../types.ts';

export const BANNED_HEADERS_REGEX = /^(job\s+description|job\s+summary|job\s+overview|job\s+details|position\s+overview|position\s+summary|role\s+overview|role\s+summary|about\s+the\s+role|about\s+the\s+job|about\s+the\s+team|about\s+us|who\s+we\s+are|what\s+you'?ll\s+do|what\s+you\s+will\s+do|what\s+you\s+bring|what\s+we'?re\s+looking\s+for|what\s+we\s+offer|who\s+you\s+are|responsibilities|key\s+responsibilities|essential\s+duties|qualifications|requirements|minimum\s+qualifications|preferred\s+qualifications|skills\s+and\s+experience|skills|experience|benefits|perks|compensation|total\s+rewards|pay\s+range|salary|location|remote|hybrid|apply\s+now|how\s+to\s+apply|equal\s+opportunity|overview|summary|description|introduction|careers?)$/i;

export const OG_SITE_NAME_ATS_NOISE = [
  'workday',
  'greenhouse',
  'ashby',
  'gem',
  'lever',
  'workable',
  'smartrecruiters',
  'icims',
  'jobvite',
  'job',
];

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

    // Workday path: /en-US/EnsembleHealthPartnersCareers/job/...
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

export async function scrapeHtmlWithCheerio(urlStr: string): Promise<ScrapedHtmlData> {
  const response = await fetch(urlStr, {
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

  const html = await response.text();
  const $ = cheerio.load(html);

  // Extract JSON-LD
  let jsonLd: any = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      if (!content) return;
      const parsed = JSON.parse(content);
      if (
        parsed['@type'] === 'JobPosting' ||
        (Array.isArray(parsed['@graph']) && parsed['@graph'].some((item: any) => item['@type'] === 'JobPosting'))
      ) {
        jsonLd = parsed['@type'] === 'JobPosting' ? parsed : parsed['@graph'].find((item: any) => item['@type'] === 'JobPosting');
      } else if (!jsonLd) {
        jsonLd = parsed;
      }
    } catch {
      // Ignore JSON parse error
    }
  });

  // Extract Meta tags
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDescription = $('meta[property="og:description"]').attr('content');
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  const metaDescription = $('meta[name="description"]').attr('content');
  const title = $('title').text() || '';

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
  };
}

// Deterministic fallbacks only run when no model read the posting. Saved jobs are immutable snapshots,
// so fields we cannot read are recorded as unknown rather than filled with plausible-looking defaults.
const UNKNOWN_COMPANY_METADATA = {
  headcount: 'Unknown',
  headquarters: 'Unknown',
  ownership: 'Unknown',
  foundingYear: 'Unknown',
};

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
    companyMetadata: UNKNOWN_COMPANY_METADATA,
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
    companyMetadata: UNKNOWN_COMPANY_METADATA,
    positionMetadata: {
      seniority: isSr ? 'Senior' : 'Mid-level',
      department,
      employmentType: 'Unknown',
      team: team || undefined,
      requiredSkills: [],
    },
  };
}
