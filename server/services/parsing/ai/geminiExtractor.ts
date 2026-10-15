import { Type, UrlRetrievalStatus } from '@google/genai';
import { getGemini } from '../geminiClient.ts';
import { ExtractedJobAttributes } from '../types.ts';

// Gemini calls must never hang an ingest: past these limits the pipeline moves on to the next tier.
const GEMINI_TIMEOUT_MS = 25_000;
const GEMINI_URL_CONTEXT_TIMEOUT_MS = 40_000;

const JOB_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    company: { type: Type.STRING },
    jobTitle: { type: Type.STRING },
    team: { type: Type.STRING },
    location: { type: Type.STRING },
    salary: { type: Type.STRING },
    industry: { type: Type.STRING },
    summary: { type: Type.STRING },
    companyMetadata: {
      type: Type.OBJECT,
      properties: {
        headcount: { type: Type.STRING },
        headquarters: { type: Type.STRING },
        ownership: { type: Type.STRING },
        foundingYear: { type: Type.STRING },
      },
      required: ['headcount', 'headquarters', 'ownership'],
    },
    positionMetadata: {
      type: Type.OBJECT,
      properties: {
        seniority: { type: Type.STRING },
        department: { type: Type.STRING },
        employmentType: { type: Type.STRING },
        requiredSkills: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ['seniority', 'department', 'employmentType', 'requiredSkills'],
    },
  },
  required: [
    'company',
    'jobTitle',
    'location',
    'salary',
    'industry',
    'summary',
    'companyMetadata',
    'positionMetadata',
  ],
};

export async function extractWithGemini(extractedContext: {
  url?: string;
  sourceType: string;
  rawContent: string;
  companyHint?: string;
  jobTitleHint?: string;
}): Promise<ExtractedJobAttributes> {
  const ai = getGemini();

  const prompt = `You are an expert autonomous job application analyst.
Extract all key attributes from the provided job posting information and return a strictly structured JSON object.

Source Type: ${extractedContext.sourceType}
Job URL: ${extractedContext.url || 'Not provided'}
Company Hint: ${extractedContext.companyHint || 'None'}
Role Title Hint: ${extractedContext.jobTitleHint || 'None'}

RAW POSTING DATA:
"""
${extractedContext.rawContent.slice(0, 15000)}
"""

REQUIREMENTS FOR FIELDS:
- company: The official employer brand name. Clean away ATS or domain names (e.g., if posting is for "Shopify" hosted on Greenhouse, return "Shopify", NEVER "Greenhouse").
- jobTitle: The standardized official position role title without the team/sub-group (e.g., "Senior Product Manager", "Senior Software Engineer").
- team: The specific team, product group, division, or sub-business unit if mentioned (e.g., "Pharmacy Care", "Patient CRM", "Legal & Insurance", "Billing & Subscriptions"). Return empty string if no specific team is specified.
- location: Work arrangement and region (e.g., "Remote (US)", "San Francisco, CA (Hybrid)", "New York, NY (On-site)").
- salary: Exact salary range, hourly rate, or "Not listed" (e.g. "$160,000 - $210,000 / yr", "$80 - $100 / hr").
- industry: Specific industry sector (e.g., "Enterprise SaaS", "Financial Technology", "Healthcare & Biotech", "E-Commerce", "AI & Machine Learning", "Cybersecurity").
- summary: A concise, highly informative 3-5 sentence overview detailing primary responsibilities, core stack, team scope, and company mission.
- companyMetadata:
  * headcount: approximate size (e.g., "1,000 - 5,000 employees")
  * headquarters: city, state/country (e.g., "San Francisco, CA")
  * ownership: "Public", "Private", "Non-profit", or "Unknown"
  * foundingYear: founding year string (e.g., "2015") or "Unknown"
- positionMetadata:
  * seniority: e.g., "Intern", "Junior", "Mid-level", "Senior", "Staff", "Principal", "Director", "Lead"
  * department: e.g., "Engineering", "Product", "Data Science", "Design", "Marketing"
  * employmentType: e.g., "Full-time", "Contract", "Part-time", "Internship"
  * requiredSkills: array of 4-8 core required technologies, languages, or domain skills (e.g., ["TypeScript", "React", "Node.js", "GraphQL", "AWS"])`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      responseMimeType: 'application/json',
      responseSchema: JOB_RESPONSE_SCHEMA,
    },
  });

  const text = response.text || '{}';
  return JSON.parse(text);
}

/**
 * Last-resort tier when our own scraper could not read the page. Gemini fetches the URL itself through the
 * url_context tool. Saved jobs are immutable snapshots, so this must never guess: if Gemini could not read
 * the page we throw and let the caller fall back to the deterministic parser, which marks unknowns as such.
 */
export async function extractWithUrlContext(urlStr: string): Promise<ExtractedJobAttributes> {
  const ai = getGemini();

  const prompt = `You are an expert job application analyst.
Read the job posting at this URL with the URL context tool: ${urlStr}

Extract the posting into the JSON schema. Use ONLY facts stated on that page:
- Never infer salary, location, skills, or responsibilities from the company name or from typical roles.
- salary: the exact range or rate the page states, otherwise "Not listed".
- summary: 3-5 sentences describing responsibilities and scope exactly as the page describes them.
- requiredSkills: skills the page names; an empty array if it names none.
- Any other field the page does not state: "Unknown".
- companyMetadata may use well-known public facts about the employer (headquarters, ownership, founding year, approximate headcount); use "Unknown" when unsure.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      abortSignal: AbortSignal.timeout(GEMINI_URL_CONTEXT_TIMEOUT_MS),
      tools: [{ urlContext: {} }],
      responseMimeType: 'application/json',
      responseSchema: JOB_RESPONSE_SCHEMA,
    },
  });

  const retrievals = response.candidates?.[0]?.urlContextMetadata?.urlMetadata || [];
  const pageWasRead = retrievals.some((m) => m.urlRetrievalStatus === UrlRetrievalStatus.URL_RETRIEVAL_STATUS_SUCCESS);
  if (!pageWasRead) {
    const status = retrievals[0]?.urlRetrievalStatus || 'no retrieval reported';
    throw new Error(`Gemini could not read the posting page (${status}); refusing to guess its contents.`);
  }

  const text = response.text || '{}';
  return JSON.parse(text);
}
