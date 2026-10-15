// Fallback paths run when no model read the posting. Saved jobs are immutable snapshots, so anything we could not
// read is stored as unknown rather than a plausible-looking default that would look identical on every job.
export const UNKNOWN_COMPANY_METADATA = {
  headcount: 'Unknown',
  headquarters: 'Unknown',
  ownership: 'Unknown',
  foundingYear: 'Unknown',
};
