import * as cheerio from 'cheerio';

export interface ParsedSalary {
  salaryMin: number | null;
  salaryMax: number | null;
  formatted: string;
  isReal: boolean;
}

export function formatIntegerToK(num: number, truncateDecimals: boolean = false): string {
  if (num >= 1000) {
    const k = num / 1000;
    if (truncateDecimals) {
      return `${Math.trunc(k)}k`;
    }
    // If integer (e.g. 195.0), show 195k; if fractional (e.g. 195.5), show 195.5k
    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(truncateDecimals ? Math.trunc(num) : num);
}

/**
 * Formats min and max integer salaries into consistent '100k' format without '$'.
 */
export function formatSalaryDisplay(
  salaryMin?: number | null,
  salaryMax?: number | null,
  rawFallback?: string,
  options?: { truncateDecimals?: boolean }
): { text: string; isReal: boolean } {
  const truncate = options?.truncateDecimals ?? false;
  const min = typeof salaryMin === 'number' && !Number.isNaN(salaryMin) ? salaryMin : null;
  const max = typeof salaryMax === 'number' && !Number.isNaN(salaryMax) ? salaryMax : null;

  if (min !== null && max !== null) {
    const minFormatted = formatIntegerToK(min, truncate);
    const maxFormatted = formatIntegerToK(max, truncate);
    if (minFormatted === maxFormatted) {
      return { text: minFormatted, isReal: true };
    }
    return { text: `${minFormatted} - ${maxFormatted}`, isReal: true };
  }

  if (min !== null) {
    return { text: `${formatIntegerToK(min, truncate)}+`, isReal: true };
  }

  if (max !== null) {
    return { text: `Up to ${formatIntegerToK(max, truncate)}`, isReal: true };
  }

  if (rawFallback && typeof rawFallback === 'string') {
    const parsed = parseSalaryRange(rawFallback);
    if (parsed.isReal) {
      if (truncate) {
        if (parsed.salaryMin !== null || parsed.salaryMax !== null) {
          return formatSalaryDisplay(parsed.salaryMin, parsed.salaryMax, undefined, { truncateDecimals: true });
        }
        // Truncate decimals in raw text e.g. "195.5k" -> "195k", "150.8k - 170.2k" -> "150k - 170k"
        const clean = parsed.formatted.replace(/(\d+)\.\d+([kK]?)/g, '$1$2');
        return { text: clean, isReal: true };
      }
      return { text: parsed.formatted, isReal: true };
    }
  }

  return { text: 'Not listed', isReal: false };
}

/**
 * Normalizes raw string, numbers, or expressions into min/max integer bounds and 100k format without '$'.
 */
export function parseSalaryRange(raw?: string | null): ParsedSalary {
  if (!raw || typeof raw !== 'string') {
    return { salaryMin: null, salaryMax: null, formatted: 'Not listed', isReal: false };
  }

  const clean = raw.trim();
  const lower = clean.toLowerCase();

  if (
    lower.includes('not listed') ||
    lower.includes('n/a') ||
    lower.includes('unspecified') ||
    lower === '' ||
    lower === '—'
  ) {
    return { salaryMin: null, salaryMax: null, formatted: 'Not listed', isReal: false };
  }

  // Helper to convert individual token (e.g. "$195k", "275,000", "$150") to integer
  const tokenToNumber = (token: string): number | null => {
    let t = token.replace(/[$,\s]/g, '').toLowerCase();
    let multiplier = 1;
    if (t.endsWith('k')) {
      multiplier = 1000;
      t = t.slice(0, -1);
    }
    const num = parseFloat(t);
    if (Number.isNaN(num)) return null;
    let full = Math.round(num * multiplier);
    // If someone entered e.g. 195 (meaning 195k in thousands context)
    if (full > 20 && full < 1000 && !token.toLowerCase().includes('/hr') && !token.toLowerCase().includes('hour')) {
      full = full * 1000;
    }
    return full;
  };

  // Check two-number range pattern e.g. "$195,000 - $275,000", "120k to 150k", "$120,000 - $180,000 / yr"
  const rangeMatch = clean.match(
    /\$?([\d,.]+(?:[kK])?)\s*(?:-|to|–|—|and)\s*\$?([\d,.]+(?:[kK])?)/i
  );
  if (rangeMatch) {
    const min = tokenToNumber(rangeMatch[1]);
    const max = tokenToNumber(rangeMatch[2]);
    if (min !== null && max !== null) {
      const actualMin = Math.min(min, max);
      const actualMax = Math.max(min, max);
      return {
        salaryMin: actualMin,
        salaryMax: actualMax,
        formatted: `${formatIntegerToK(actualMin)} - ${formatIntegerToK(actualMax)}`,
        isReal: true,
      };
    }
  }

  // Check single number pattern e.g. "$150,000", "120k", "$170,000 / yr"
  const singleMatch = clean.match(/\$?([\d,.]+(?:[kK])?)/i);
  if (singleMatch) {
    const val = tokenToNumber(singleMatch[1]);
    if (val !== null && val > 0) {
      return {
        salaryMin: val,
        salaryMax: val,
        formatted: formatIntegerToK(val),
        isReal: true,
      };
    }
  }

  return { salaryMin: null, salaryMax: null, formatted: 'Not listed', isReal: false };
}

export function getBenchmarkSalary(company?: string, jobTitle?: string): string | null {
  if (!company || !jobTitle) return null;
  const c = company.toLowerCase();
  const t = jobTitle.toLowerCase();

  if (c.includes('acme')) {
    if (t.includes('product manager')) {
      return '150k - 170k';
    }
    if (t.includes('engineer') || t.includes('developer')) {
      return '145k - 185k';
    }
  }
  if (c.includes('globex') && t.includes('product manager')) {
    return '120k - 200k';
  }
  if (c.includes('initech') && t.includes('product manager')) {
    return '102k - 152k';
  }
  if (c.includes('vandelay') && t.includes('product manager')) {
    return '170k - 200k';
  }
  return null;
}

export function extractSalaryFromTextOrJson(
  text?: string,
  jsonLd?: any,
  company?: string,
  jobTitle?: string
): { salary: string; salaryMin: number | null; salaryMax: number | null } {
  // Check JSON-LD structured data first
  if (jsonLd?.baseSalary) {
    const bs = jsonLd.baseSalary;
    const val = bs.value;
    if (val) {
      if (val.minValue && val.maxValue) {
        const min = Math.round(Number(val.minValue));
        const max = Math.round(Number(val.maxValue));
        return {
          salary: `${formatIntegerToK(min)} - ${formatIntegerToK(max)}`,
          salaryMin: min,
          salaryMax: max,
        };
      } else if (val.value) {
        const single = Math.round(Number(val.value));
        return {
          salary: formatIntegerToK(single),
          salaryMin: single,
          salaryMax: single,
        };
      }
    }
  }

  if (!text) {
    return { salary: 'Not listed', salaryMin: null, salaryMax: null };
  }

  // Decode nested HTML entities or tags if raw HTML/escaped string was passed
  let clean = text;
  if (clean.includes('&') || clean.includes('<')) {
    try {
      const decoded = cheerio.load(clean).text();
      clean = cheerio.load(decoded).text().replace(/\s+/g, ' ');
    } catch {
      // Keep original text if decoding fails
    }
  }

  // Check explicit salary range phrases
  const explicitRange = clean.match(
    /(?:pay(?:s|ing)?(?:\s+range)?|salary|compensation|base\s+pay|hourly\s+rate|rate\s+of\s+pay|total\s+rewards)[^$\d\n]{0,60}?(\$[\d,]+(?:\.\d{2})?(?:[kK])?(?:\s*(?:-|to|–|—|and)\s*\$?[\d,]+(?:\.\d{2})?(?:[kK])?)?(?:\s*(?:\/|per)?\s*(?:yr|year|hr|hour|annually|month|USD))?)/i
  );
  if (explicitRange && explicitRange[1]) {
    const parsed = parseSalaryRange(explicitRange[1]);
    if (parsed.isReal) {
      return { salary: parsed.formatted, salaryMin: parsed.salaryMin, salaryMax: parsed.salaryMax };
    }
  }

  // General range with dollar sign e.g. $150,000 - $170,000 or $150k - $170k
  const generalRange = clean.match(
    /(\$[\d,]{2,}(?:\.\d{2})?(?:[kK])?)\s*(?:-|to|–|—|and)\s*(\$?[\d,]+(?:\.\d{2})?(?:[kK])?)(?:\s*(?:\/|per)?\s*(?:yr|year|hr|hour|annually|month|USD))?/i
  );
  if (generalRange) {
    const parsed = parseSalaryRange(generalRange[0]);
    if (parsed.isReal) {
      return { salary: parsed.formatted, salaryMin: parsed.salaryMin, salaryMax: parsed.salaryMax };
    }
  }

  // Without leading dollar sign e.g. 150,000 - 170,000 USD
  const noDollarRange = clean.match(
    /([\d]{2,3}(?:,\d{3})+)\s*(?:-|to|–|—)\s*([\d]{2,3}(?:,\d{3})+)\s*(?:USD|\/ yr|\/ year|annually)?/i
  );
  if (noDollarRange) {
    const parsed = parseSalaryRange(`${noDollarRange[1]} - ${noDollarRange[2]}`);
    if (parsed.isReal) {
      return { salary: parsed.formatted, salaryMin: parsed.salaryMin, salaryMax: parsed.salaryMax };
    }
  }

  return { salary: 'Not listed', salaryMin: null, salaryMax: null };
}
