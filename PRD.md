# Product Requirements Document (PRD)
## Job Application Tracker

What the app does today, how it is built, and the product rules any change must keep. Keep this file in step with the code: a PR that changes behavior described here updates it in the same PR.

---

## 1. Goal

Capture a job posting with one click from its link (or from the page you are viewing) and track the application's status from Saved to its outcome, with as little manual typing as possible.

---

## 2. Product rules

- **Every ingest is an immutable snapshot.** A saved job keeps the JD details as captured. Re-ingesting a reposted or similar job adds a new row; it never overwrites or updates an existing one. Only user-owned fields change after capture: status, date applied, notes and manual edits.
- **Never invent posting details.** When no model actually read the posting, fields that could not be read are stored as `Unknown` / `Not listed`, not as plausible defaults or benchmark salaries. Such jobs show a **Needs review** badge. Jobs saved before v0.3.0 may carry the old hard-coded company placeholder (1,000+ employees, United States, Private); the UI shows that exact trio as Unknown.
- **Duplicates are flagged, not blocked.** If a company or role matches an application from the past six months, the user sees a comparison and chooses to save anyway or skip.
- **The API is private.** Every `/api` call presents the server's access key.

---

## 3. Architecture

| Layer | Choice |
|---|---|
| UI | React 19, Vite, Tailwind CSS 4, `motion`, `lucide-react` |
| Server | Express on Node, TypeScript via `tsx` in dev, bundled by `esbuild` to `dist/server.cjs` |
| Extraction | Cheerio scraper, dedicated ATS APIs, Google Gemini (`@google/genai`, `gemini-3.8-flash`) |
| Storage | Supabase Postgres when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, otherwise local `spreadsheet_data.json` (one or the other, not mirrored) |
| Hosting | Render web service (`render.yaml`), built with Bun |
| Optional | Google Sheets sync from the browser (Google sign-in with Drive/Sheets scopes) |

---

## 4. Features

### 4.1 Ingest
- **Link ingest**: paste a URL in the header bar. `POST /api/extract-job` runs the extraction pipeline (4.2), checks for duplicates, and saves the job with the chosen starting status.
- **Paste text**: for pages that cannot be fetched, paste the job description; Gemini extracts it, with a deterministic text parser as the fallback.
- **One-click capture bookmarklet** (Settings › One-click capture): drag the bookmark to the bookmarks bar, then click it on any posting. It opens a small tracker popup with the page URL and the rendered page text (or the current selection), sent in the URL fragment, and saves it through the same ingest. This covers client-rendered or bot-protected sites such as Darwinbox, Workday and LinkedIn. A per-browser token embedded in the bookmark stops other sites from adding jobs through crafted links; resetting it retires old bookmarks.

### 4.2 Extraction pipeline (`server/services/parsing`)
1. **Tier 1, ATS APIs**: Greenhouse, Lever, Workable and Ashby public posting APIs. Darwinbox is detected and skipped (client-rendered behind bot protection; use the bookmarklet).
2. **Tier 2, HTML scrape**: fetch and parse the page (JSON-LD `JobPosting`, OpenGraph, cleaned body text).
3. **Tier 3, Gemini on scraped content**: structured JSON extraction from what Tier 2 found.
4. **Tier 4, Gemini URL context**: Gemini fetches the page itself with the `url_context` tool. If it reports that the page was not retrieved, the tier fails rather than guessing.
5. **Deterministic fallback**: company and title from the page or link; everything unreadable is `Unknown` / `Not listed`, flagged **Needs review**.

Every network step has a timeout (ATS APIs 4–6 s, scraper 10 s, Gemini 25 s, Gemini URL context 40 s), so an ingest always finishes. The ATS diagnostic tool (Settings › ATS Regex Diagnostic, `POST /api/test-ats-diagnostic`) shows each tier's result for a URL.

### 4.2a Company facts (`server/services/company`)
Headcount, headquarters, ownership and founding year come from real sources, field by field, in this order: **Wikidata** (free, no key; matched on the exact company name and only entities that look like a business), facts already saved on earlier jobs at the same company, the posting extraction, then a **Gemini call grounded in Google Search** for anything still missing (answers without search grounding are discarded). Results are cached for 12 hours per company. A field no source states stays `Unknown`, and the source is stored in `companyMetadata.source` and shown under Company Intelligence. Jobs saved without facts get the same lookup when their detail view opens; it fills the view only, and the stored snapshot is not changed.

### 4.3 Tracking
- Statuses: **Saved, Applied, Interviewing, Offer, Accepted, Rejected, Declined**. Each change is appended to the job's status history with a timestamp; moving to Applied sets the applied date.
- Spreadsheet view with search, filters, column sort (sorting turns off status grouping), compact and full layouts, and stacked cards on mobile.
- Job detail drawer: summary, metadata, status timeline, notes, applied date, edit and delete.
- Analytics bar: pipeline counts, callback rate and salary ranges.
- Import and export as JSON or CSV; optional Google Sheets sync.

### 4.4 Access
- The server requires `API_ACCESS_KEY` on every `/api` request (`Authorization: Bearer <key>` or `X-Api-Key`). The UI asks for it once on a 401 and keeps it in the browser's local storage.
- With no key configured the API stays open in development and returns 503 in production.

### 4.5 Versioning
- Every PR bumps `version` in `package.json` (MINOR for features and behavior changes, PATCH for fixes and chores), enforced by the **Version bump** check. The version and deployed commit show at the bottom of the Settings menu.
- The **CI** check type-checks, tests and builds every PR.

---

## 5. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/jobs` | All jobs, newest first (paged internally past Supabase's 1,000-row limit) |
| `POST` | `/api/extract-job` | Ingest a URL and/or text; returns the saved job or a duplicate warning. With `candidateJob` + `confirmDuplicate` it saves a reviewed duplicate |
| `PATCH` | `/api/jobs/:id` | Update status, notes, date applied or edited fields |
| `DELETE` | `/api/jobs/:id` | Delete a job |
| `POST` | `/api/jobs/import` | Upsert imported jobs by id |
| `POST` | `/api/jobs/reparse` | Re-normalize stored records |
| `GET` | `/api/company-facts?company=&url=&title=` | Look up company facts for a job saved without them (read-only) |
| `POST` | `/api/test-ats-diagnostic` | Run the pipeline on a URL and report every tier |

---

## 6. Data model

`JobRecord` in `src/types.ts`; Postgres table `public.jobs` in `supabase/schema.sql` (keep both in sync).

```typescript
type JobStatus = 'Saved' | 'Applied' | 'Interviewing' | 'Offer' | 'Accepted' | 'Rejected' | 'Declined';

interface JobRecord {
  id: string;
  company: string;
  jobTitle: string;
  team?: string;
  location: string;
  salary: string;               // display string, or "Not listed"
  salaryMin?: number | null;
  salaryMax?: number | null;
  status: JobStatus;
  dateApplied: string | null;   // YYYY-MM-DD
  dateAdded?: string;
  industry: string;
  summary: string;
  url: string;
  companyMetadata: { headcount?; headquarters?; ownership?; foundingYear? };
  positionMetadata: { seniority?; department?; employmentType?; requiredSkills: string[]; team? };
  extractedVia?: string;        // pipeline tier that produced the snapshot
  createdAt: string;
  notes?: string;
  statusHistory?: { at: string; from: JobStatus | null; to: JobStatus }[];
}
```

---

## 7. Configuration

| Variable | Required | Purpose |
|---|---|---|
| `API_ACCESS_KEY` | Production | Key every `/api` call must present |
| `GEMINI_API_KEY` | Recommended | Gemini extraction (Tiers 3–4 and pasted text) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Production | Persistent Postgres storage; server-side only |
| `NODE_ENV` | Production | `production` serves the built client from `dist/` |

See `README.md` for local setup and deployment steps.
