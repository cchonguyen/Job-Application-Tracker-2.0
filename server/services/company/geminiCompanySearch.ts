import { Type } from '@google/genai';
import { getGemini } from '../parsing/geminiClient.ts';
import type { CompanyFacts } from './types.ts';

const TIMEOUT_MS = 25_000;

/**
 * Asks Gemini to look the employer up with Google Search grounding. Used only for facts Wikidata did not have.
 * Answers that were not grounded in search results are discarded, so this never falls back to model memory.
 */
export async function searchCompanyFactsWithGemini(
  company: string,
  context: { jobUrl?: string; jobTitle?: string }
): Promise<Partial<CompanyFacts> | null> {
  if (!process.env.GEMINI_API_KEY) return null;

  const prompt = `Search the web for the company "${company}"${context.jobTitle ? `, which is hiring a "${context.jobTitle}"` : ''}${
    context.jobUrl ? ` (job posting: ${context.jobUrl})` : ''
  }. Make sure you have the right company: it is the employer behind that posting, not a different company with a similar name.

Return:
- headcount: approximate current employee count as stated by a source, e.g. "250 employees" or "1,001-5,000 employees".
- headquarters: "City, Country" (US: "City, State").
- ownership: "Public" if its shares trade on a stock exchange, "Private" if privately held (including venture-backed startups), "Non-profit" for non-profits, else "Unknown". A subsidiary takes its parent's status.
- foundingYear: four-digit year founded.
Use "Unknown" for any field the search results do not state. Do not guess.`;

  const response = await getGemini().models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headcount: { type: Type.STRING },
          headquarters: { type: Type.STRING },
          ownership: { type: Type.STRING },
          foundingYear: { type: Type.STRING },
        },
        required: ['headcount', 'headquarters', 'ownership', 'foundingYear'],
      },
    },
  });

  const grounded = (response.candidates?.[0]?.groundingMetadata?.groundingChunks?.length || 0) > 0;
  if (!grounded) return null;

  const raw = JSON.parse(response.text || '{}');
  const facts: Partial<CompanyFacts> = { source: 'Google Search via Gemini' };
  const known = (v: unknown) => typeof v === 'string' && v.trim() && !/^(unknown|n\/a|not (listed|available|found))$/i.test(v.trim());
  if (known(raw.headcount)) facts.headcount = raw.headcount.trim();
  if (known(raw.headquarters)) facts.headquarters = raw.headquarters.trim();
  if (['Public', 'Private', 'Non-profit'].includes(raw.ownership)) facts.ownership = raw.ownership;
  if (/^\d{4}$/.test(String(raw.foundingYear || '').trim())) facts.foundingYear = String(raw.foundingYear).trim();
  return facts;
}
