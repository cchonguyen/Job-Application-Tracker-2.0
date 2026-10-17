export interface CompanyFacts {
  headcount: string;
  headquarters: string;
  ownership: 'Public' | 'Private' | 'Non-profit' | 'Unknown';
  foundingYear: string;
  /** Where the facts came from, e.g. "Wikidata (Q123)" or "Google Search via Gemini". */
  source?: string;
}

export const FACT_FIELDS = ['headcount', 'headquarters', 'ownership', 'foundingYear'] as const;
export type FactField = (typeof FACT_FIELDS)[number];
