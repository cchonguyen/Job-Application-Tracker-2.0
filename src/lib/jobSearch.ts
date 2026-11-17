import { JobRecord } from '../types';

function fieldContains(value: string | null | undefined, needle: string): boolean {
  return typeof value === 'string' && value.toLowerCase().includes(needle);
}

/**
 * Case-insensitive substring search across a job's text fields.
 * An empty (or whitespace-only) query matches every job.
 */
export function jobMatchesSearch(job: JobRecord, query: string): boolean {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return true;

  if (
    fieldContains(job.company, q) ||
    fieldContains(job.jobTitle, q) ||
    fieldContains(job.team, q) ||
    fieldContains(job.location, q) ||
    fieldContains(job.industry, q) ||
    fieldContains(job.notes, q) ||
    fieldContains(job.url, q) ||
    fieldContains(job.summary, q) ||
    fieldContains(job.status, q)
  ) {
    return true;
  }

  const skills = job.positionMetadata?.requiredSkills;
  if (Array.isArray(skills)) {
    return skills.some((skill) => fieldContains(skill, q));
  }
  return false;
}
