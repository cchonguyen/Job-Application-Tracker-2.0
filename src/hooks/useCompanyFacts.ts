import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiClient';
import { companyFactsForDisplay } from '../lib/formatHelpers';
import type { JobRecord } from '../types';

type Facts = ReturnType<typeof companyFactsForDisplay>;
const FIELDS = ['headcount', 'headquarters', 'ownership', 'foundingYear'] as const;
const lookups = new Map<string, Promise<(Facts & { source?: string }) | null>>();

function lookup(job: JobRecord) {
  const key = job.company.trim().toLowerCase();
  if (!lookups.has(key)) {
    const params = new URLSearchParams({ company: job.company, url: job.url || '', title: job.jobTitle || '' });
    lookups.set(
      key,
      apiFetch(`/api/company-facts?${params}`)
        .then((res) => res.json())
        .then((data) => (data?.success ? data.facts : null))
        .catch(() => null)
    );
  }
  return lookups.get(key)!;
}

/**
 * Company facts for the detail view. Jobs saved without facts (all Unknown, or the old placeholder) get a live
 * lookup; the result fills only the missing fields on screen and the stored snapshot is not changed.
 */
export function useCompanyFacts(job: JobRecord | null) {
  const stored = companyFactsForDisplay(job?.companyMetadata);
  const needsLookup = !!job && FIELDS.some((f) => stored[f] === 'Unknown');
  const [found, setFound] = useState<{ id: string; facts: (Facts & { source?: string }) | null } | null>(null);

  useEffect(() => {
    if (!job || !needsLookup) return;
    let cancelled = false;
    lookup(job).then((facts) => {
      if (!cancelled) setFound({ id: job.id, facts });
    });
    return () => {
      cancelled = true;
    };
  }, [job?.id, needsLookup]);

  const looked = found && job && found.id === job.id ? found.facts : null;
  const facts: Facts = { ...stored };
  let filledFromLookup = false;
  if (looked) {
    for (const f of FIELDS) {
      if (facts[f] === 'Unknown' && looked[f] && looked[f] !== 'Unknown') {
        facts[f] = looked[f];
        filledFromLookup = true;
      }
    }
  }

  return {
    facts,
    source: filledFromLookup ? looked?.source : job?.companyMetadata?.source,
    isLookingUp: needsLookup && !(found && job && found.id === job.id),
    filledFromLookup,
  };
}
