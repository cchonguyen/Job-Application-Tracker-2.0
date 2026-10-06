export type JobStatus = 'Saved' | 'Applied' | 'Interviewing' | 'Offer' | 'Accepted' | 'Rejected' | 'Declined';

export interface StatusHistoryEntry {
  at: string; // ISO timestamp
  from: JobStatus | null;
  to: JobStatus;
}

export interface CompanyMetadata {
  headcount?: string;
  headquarters?: string;
  ownership?: 'Public' | 'Private' | 'Non-profit' | 'Unknown';
  foundingYear?: string | number;
}

export interface PositionMetadata {
  seniority?: string;
  department?: string;
  employmentType?: string;
  requiredSkills: string[];
  team?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  dateAdded?: string | null;
  statusHistory?: StatusHistoryEntry[];
}

export interface JobRecord {
  id: string;
  company: string;
  jobTitle: string;
  team?: string;
  location: string;
  salary: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  status: JobStatus;
  dateApplied: string | null; // YYYY-MM-DD
  dateAdded?: string; // YYYY-MM-DD or ISO timestamp
  industry: string;
  summary: string;
  url: string;
  companyMetadata: CompanyMetadata;
  positionMetadata: PositionMetadata;
  extractedVia?: string;
  createdAt: string;
  notes?: string;
  /** Per-job status changelog; older records may omit this. */
  statusHistory?: StatusHistoryEntry[];
}

export interface ExtractJobRequest {
  url?: string;
  manualText?: string;
  status?: JobStatus;
  notes?: string;
}

export interface DiagnosticStep {
  tier: string;
  name: string;
  status: 'pending' | 'success' | 'skipped' | 'failed';
  details?: string;
  durationMs?: number;
}

export interface DiagnosticReport {
  targetUrl: string;
  detectedAts?: string | null;
  overallSuccess: boolean;
  finalTier: string;
  steps: DiagnosticStep[];
  extractedData?: Partial<JobRecord>;
  rawOutputSnippet?: string;
}

export type DuplicateMatchType = 'both' | 'company' | 'role';

export interface DuplicateMatch {
  existingJob: JobRecord;
  matchType: DuplicateMatchType;
  matchedFields: ('company' | 'role')[];
  appliedDateStr: string;
  daysAgo: number;
  timeAgoLabel: string;
  reason: string;
}

export interface PendingDuplicateCandidate {
  candidateJob: JobRecord;
  duplicates: DuplicateMatch[];
}
