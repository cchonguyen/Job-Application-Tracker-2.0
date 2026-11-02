import * as cheerio from 'cheerio';
import { formatIntegerToK } from '../../../../src/lib/salary.ts';

export interface SchemaOrgJobPostingResult {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string;
  unitText?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string;
  raw: any;
}

/**
 * Safely decodes HTML entities in text fields (e.g., &amp; -> &, &#x2F; -> /, &#39; -> ').
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || typeof text !== 'string') return '';
  if (!text.includes('&') && !text.includes('<')) return text;
  try {
    const $ = cheerio.load(text);
    return $.text();
  } catch {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
}

/**
 * Cleans an HTML description by removing non-content tags (script, style) and converting
 * block tags to newlines while preserving readable text formatting.
 */
export function cleanHtmlDescription(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';
  try {
    const $ = cheerio.load(rawHtml);
    $('script, style, noscript, svg').remove();
    $('br').replaceWith('\n');
    $('p, li, div, h1, h2, h3, h4, h5, h6').each((_, el) => {
      $(el).append('\n');
    });
    return $.text().replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  } catch {
    return rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

/**
 * Recursively locates a JobPosting node in an object, array, or @graph structure.
 */
function findJobPostingNode(candidate: any, visited = new Set<any>()): any | null {
  if (!candidate || typeof candidate !== 'object') return null;
  if (visited.has(candidate)) return null;
  visited.add(candidate);

  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const found = findJobPostingNode(item, visited);
      if (found) return found;
    }
    return null;
  }

  const type = candidate['@type'];
  if (
    type === 'JobPosting' ||
    (Array.isArray(type) && type.includes('JobPosting')) ||
    (typeof type === 'string' && (type.endsWith('JobPosting') || type.endsWith('/JobPosting')))
  ) {
    return candidate;
  }

  if (candidate['@graph']) {
    const found = findJobPostingNode(candidate['@graph'], visited);
    if (found) return found;
  }

  for (const key of Object.keys(candidate)) {
    const val = candidate[key];
    if (typeof val === 'object' && val !== null) {
      const found = findJobPostingNode(val, visited);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Formats a single Schema.org Place / PostalAddress node into a readable location string.
 */
function formatPlaceNode(place: any): string {
  if (!place) return '';
  if (typeof place === 'string') return decodeHtmlEntities(place).trim();
  if (typeof place !== 'object') return '';

  const address = place.address;
  if (typeof address === 'string') {
    return decodeHtmlEntities(address).trim();
  }

  if (address && typeof address === 'object') {
    const locality = address.addressLocality ? decodeHtmlEntities(String(address.addressLocality)).trim() : '';
    const region = address.addressRegion ? decodeHtmlEntities(String(address.addressRegion)).trim() : '';
    let country = '';
    if (address.addressCountry) {
      const c = typeof address.addressCountry === 'object' ? address.addressCountry.name : address.addressCountry;
      if (c) country = decodeHtmlEntities(String(c)).trim();
    }

    if (locality && region) return `${locality}, ${region}`;
    if (locality && country) return `${locality}, ${country}`;
    if (region && country) return `${region}, ${country}`;
    if (locality) return locality;
    if (region) return region;
    if (country) return country;
  }

  if (place.name) {
    return decodeHtmlEntities(String(place.name)).trim();
  }

  return '';
}

/**
 * Formats applicantLocationRequirements node (e.g. { name: 'United States' } -> 'US').
 */
function formatApplicantRequirements(req: any): string {
  if (!req) return '';
  if (typeof req === 'string') {
    const trimmed = decodeHtmlEntities(req).trim();
    if (/^united states( of america)?$/i.test(trimmed) || trimmed.toUpperCase() === 'USA') return 'US';
    return trimmed;
  }
  if (Array.isArray(req)) {
    return req.map(formatApplicantRequirements).filter(Boolean).join(', ');
  }
  if (typeof req === 'object') {
    const name = req.name || req['@name'] || req.addressCountry || '';
    if (name) {
      const trimmed = decodeHtmlEntities(typeof name === 'object' ? name.name : String(name)).trim();
      if (/^united states( of america)?$/i.test(trimmed) || trimmed.toUpperCase() === 'USA') return 'US';
      return trimmed;
    }
  }
  return '';
}

/**
 * Extracts and normalizes a Schema.org JobPosting object.
 */
export function extractSchemaOrgJobPosting(jsonLdCandidates: any[] | any): SchemaOrgJobPostingResult | null {
  if (!jsonLdCandidates) return null;

  let candidates: any[] = [];
  if (typeof jsonLdCandidates === 'string') {
    try {
      candidates = [JSON.parse(jsonLdCandidates)];
    } catch {
      return null;
    }
  } else if (Array.isArray(jsonLdCandidates)) {
    candidates = jsonLdCandidates;
  } else {
    candidates = [jsonLdCandidates];
  }

  let rawNode: any = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    let parsed = candidate;
    if (typeof candidate === 'string') {
      try {
        parsed = JSON.parse(candidate);
      } catch {
        continue;
      }
    }
    rawNode = findJobPostingNode(parsed);
    if (rawNode) break;
  }

  if (!rawNode) return null;

  // Title
  const rawTitle = rawNode.title || rawNode.name || '';
  const title = decodeHtmlEntities(String(rawTitle)).trim() || undefined;

  // Company
  let company: string | undefined;
  const hiringOrg = rawNode.hiringOrganization;
  if (typeof hiringOrg === 'string') {
    company = decodeHtmlEntities(hiringOrg).trim();
  } else if (hiringOrg && typeof hiringOrg === 'object') {
    const orgName = hiringOrg.name || hiringOrg.legalName || hiringOrg['@name'];
    if (orgName) {
      company = decodeHtmlEntities(String(orgName)).trim();
    }
  }
  if (!company) {
    const publisherName = rawNode.publisher?.name || rawNode.author?.name;
    if (publisherName) company = decodeHtmlEntities(String(publisherName)).trim();
  }

  // Location
  let location: string | undefined;
  const isTelecommute =
    rawNode.jobLocationType === 'TELECOMMUTE' ||
    (typeof rawNode.jobLocationType === 'string' && /telecommute|remote/i.test(rawNode.jobLocationType));

  let physicalLocations: string[] = [];
  if (Array.isArray(rawNode.jobLocation)) {
    physicalLocations = rawNode.jobLocation.map(formatPlaceNode).filter(Boolean);
  } else if (rawNode.jobLocation) {
    const single = formatPlaceNode(rawNode.jobLocation);
    if (single) physicalLocations = [single];
  }

  // Deduplicate physical locations preserving order
  const uniqueLocations = Array.from(new Set(physicalLocations));
  const joinedPhysical = uniqueLocations.join('; ');
  const applicantReq = formatApplicantRequirements(rawNode.applicantLocationRequirements);

  if (isTelecommute) {
    if (applicantReq) {
      location = `Remote (${applicantReq})`;
    } else if (joinedPhysical) {
      location = /remote/i.test(joinedPhysical) ? joinedPhysical : `Remote (${joinedPhysical})`;
    } else {
      location = 'Remote';
    }
  } else if (joinedPhysical) {
    location = joinedPhysical;
  } else if (applicantReq) {
    location = `Remote (${applicantReq})`;
  }

  // Base Salary
  let salary: string | undefined;
  let salaryMin: number | null = null;
  let salaryMax: number | null = null;
  let currency = 'USD';
  let unitText: string | undefined;

  const bs = rawNode.baseSalary || rawNode.estimatedSalary;
  if (bs && typeof bs === 'object') {
    if (bs.currency) currency = String(bs.currency).toUpperCase();
    if (bs.unitText) unitText = String(bs.unitText).toUpperCase();

    const valObj = bs.value;
    let minVal: number | undefined;
    let maxVal: number | undefined;

    if (valObj && typeof valObj === 'object') {
      if (valObj.currency) currency = String(valObj.currency).toUpperCase();
      if (valObj.unitText) unitText = String(valObj.unitText).toUpperCase();
      if (valObj.minValue !== undefined) minVal = Number(valObj.minValue);
      if (valObj.maxValue !== undefined) maxVal = Number(valObj.maxValue);
      if (valObj.value !== undefined && minVal === undefined && maxVal === undefined) {
        minVal = Number(valObj.value);
        maxVal = Number(valObj.value);
      }
    } else if (valObj !== undefined) {
      minVal = Number(valObj);
      maxVal = Number(valObj);
    }

    if (minVal === undefined && bs.minValue !== undefined) minVal = Number(bs.minValue);
    if (maxVal === undefined && bs.maxValue !== undefined) maxVal = Number(bs.maxValue);
    if (minVal === undefined && maxVal === undefined && bs.value !== undefined) {
      minVal = Number(bs.value);
      maxVal = Number(bs.value);
    }

    if (minVal !== undefined && !Number.isNaN(minVal)) {
      if (maxVal === undefined || Number.isNaN(maxVal)) maxVal = minVal;
      const actualMin = Math.min(minVal, maxVal);
      const actualMax = Math.max(minVal, maxVal);

      const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

      const isHourly =
        unitText === 'HOUR' ||
        unitText === 'HR' ||
        unitText === 'HOURLY' ||
        (!unitText && actualMax < 500 && actualMin > 0);

      const isMonth = unitText === 'MONTH' || unitText === 'MO' || unitText === 'MONTHLY';
      const isDay = unitText === 'DAY' || unitText === 'DAILY';

      if (isHourly) {
        const minStr = actualMin % 1 === 0 ? String(actualMin) : actualMin.toFixed(2);
        const maxStr = actualMax % 1 === 0 ? String(actualMax) : actualMax.toFixed(2);
        salary = actualMin === actualMax ? `${sym}${minStr} / hr` : `${sym}${minStr} - ${sym}${maxStr} / hr`;
        salaryMin = null;
        salaryMax = null;
      } else if (isMonth) {
        const minFormatted = Math.round(actualMin).toLocaleString();
        const maxFormatted = Math.round(actualMax).toLocaleString();
        salary = actualMin === actualMax ? `${sym}${minFormatted} / mo` : `${sym}${minFormatted} - ${sym}${maxFormatted} / mo`;
        salaryMin = null;
        salaryMax = null;
      } else if (isDay) {
        const minFormatted = Math.round(actualMin).toLocaleString();
        const maxFormatted = Math.round(actualMax).toLocaleString();
        salary = actualMin === actualMax ? `${sym}${minFormatted} / day` : `${sym}${minFormatted} - ${sym}${maxFormatted} / day`;
        salaryMin = null;
        salaryMax = null;
      } else {
        // Annual / yearly
        const minInt = Math.round(actualMin);
        const maxInt = Math.round(actualMax);
        salaryMin = minInt;
        salaryMax = maxInt;
        const minK = formatIntegerToK(minInt);
        const maxK = formatIntegerToK(maxInt);
        salary = minInt === maxInt ? `${sym}${minK}` : `${sym}${minK} - ${sym}${maxK}`;
      }
    }
  }

  // Description
  let description: string | undefined;
  if (rawNode.description) {
    const cleaned = cleanHtmlDescription(decodeHtmlEntities(String(rawNode.description)));
    if (cleaned) description = cleaned;
  }

  // Employment Type
  let employmentType: string | undefined;
  if (rawNode.employmentType) {
    if (Array.isArray(rawNode.employmentType)) {
      employmentType = rawNode.employmentType.map((e: any) => decodeHtmlEntities(String(e))).join(', ');
    } else {
      employmentType = decodeHtmlEntities(String(rawNode.employmentType)).trim();
    }
  }

  return {
    title,
    company,
    location,
    salary,
    salaryMin,
    salaryMax,
    currency,
    unitText,
    description,
    datePosted: rawNode.datePosted ? String(rawNode.datePosted) : undefined,
    validThrough: rawNode.validThrough ? String(rawNode.validThrough) : undefined,
    employmentType,
    raw: rawNode,
  };
}
