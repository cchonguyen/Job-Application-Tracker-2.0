import { Type } from '@google/genai';
import { getGemini } from '../geminiClient.ts';
import { ExtractedJobAttributes } from '../types.ts';

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
      responseMimeType: 'application/json',
      responseSchema: {
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
      },
    },
  });

  const text = response.text || '{}';
  return JSON.parse(text);
}

export async function extractWithUrlInference(urlStr: string, errorMessage?: string): Promise<ExtractedJobAttributes> {
  const ai = getGemini();

  const prompt = `You are an expert job application analyst.
A user provided this job posting URL, but direct automated HTTP scraping was blocked or returned a restricted shell:
URL: "${urlStr}"
${errorMessage ? `Fetch diagnostic note: "${errorMessage}"` : ''}

Based on the URL domain, URL path segments, slugs, query parameters, company branding in the domain, standard tech industry compensation levels, and typical role responsibilities for this company:
1. Deduce the company name accurately from the domain/subdomain/slug (e.g. "careers.google.com" -> "Google", "stripe.com" -> "Stripe", "boards.greenhouse.io/figma" -> "Figma").
2. Deduce the job title or department from the slug/path (or provide a sensible default if only an ID is visible).
3. Provide realistic industry classification, typical headquarters and employee size for that company, and a summary describing the expected role scope.
4. Note that if specific compensation is not in the URL slug, set salary to "Not listed (Refer to job post)".

Return a strictly valid JSON object matching this schema:
{
  "company": "Official Company Name",
  "jobTitle": "Standardized Role Title",
  "location": "Location (Remote / Hybrid / On-site)",
  "salary": "Compensation or Not listed",
  "industry": "Industry Sector",
  "summary": "3-5 sentence summary of the role responsibilities, tech stack, and company mission.",
  "companyMetadata": {
    "headcount": "Approximate headcount",
    "headquarters": "City, Country",
    "ownership": "Public or Private",
    "foundingYear": "Founding year"
  },
  "positionMetadata": {
    "seniority": "Seniority level",
    "department": "Department",
    "employmentType": "Full-time",
    "requiredSkills": ["Skill1", "Skill2", "Skill3"]
  }
}
Output JSON only.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          company: { type: Type.STRING },
          jobTitle: { type: Type.STRING },
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
      },
    },
  });

  const text = response.text || '{}';
  return JSON.parse(text);
}
