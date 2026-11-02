export interface PositionMetadata {
  seniority: string;
  department: string;
  employmentType: string;
  requiredSkills: string[];
  team?: string;
}

export interface CompanyMetadata {
  headcount: string;
  headquarters: string;
  ownership: string;
  foundingYear: string;
}

export interface ExtractedJobAttributes {
  company: string;
  jobTitle: string;
  team?: string;
  location: string;
  salary: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  industry: string;
  summary: string;
  companyMetadata: CompanyMetadata;
  positionMetadata: PositionMetadata;
}

export interface DiagnosticStep {
  tier: string;
  name: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  durationMs?: number;
  details?: string;
}

export interface ExtractionResult {
  extractedData: ExtractedJobAttributes;
  tierUsed: string;
  diagnosticSteps: DiagnosticStep[];
}

export interface ScrapedHtmlData {
  title?: string;
  metaDescription?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogSiteName?: string;
  jsonLd?: any;
  cleanedText?: string;
  rawHtmlStatus: number;
  detectedAts?: {
    type: string;
    board?: string;
    jobId?: string;
  };
  spaState?: any;
}
