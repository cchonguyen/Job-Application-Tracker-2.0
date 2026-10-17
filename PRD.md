# Product Requirements Document (PRD)
## Job Application Tracker

What the app does today, how it is built, and the product rules any change must keep. This file is the source of truth for behavior: a PR that changes anything described here updates it in the same PR (see "Documentation" in `AGENTS.md`; the **Docs updated** check enforces it).

---

## 1. Goal

Capture a job posting with one click from its link (or from the page you are viewing) and track the application's status from Saved to its outcome, with as little manual typing as possible.

---

## 2. Product rules

- **Every ingest is an immutable snapshot.** A saved job keeps the JD details as captured. Re-ingesting a reposted or similar job adds a new row; it never overwrites or updates an existing one. Only user-owned fields change after capture: status, date applied, notes and manual edits.
- **Never invent posting details.** When no model actually read the posting, fields that could not be read are stored as `Unknown` / `Not listed`, not as plausible defaults or benchmark salaries. Such jobs show a **Needs review** badge. Jobs saved before v0.3.0 may carry the old hard-coded company placeholder (1,000+ employees, United States, Private); the UI shows that exact trio as Unknown.
- **Duplicates are flagged, not blocked.** A new job is flagged when it has the same posting URL as, or is at the same company as, one of the user's applications from the past six months (any role there counts; same-role matches rank first). The same title at a different company is never flagged. The user sees a comparison and chooses to save anyway or skip.
- **Each account sees only its own jobs.** Every `/api` call (except `GET /api/auth/config`) carries the signed-in user's token, and Postgres row-level security enforces ownership (4.4).

---

## 3. Architecture

| Layer | Choice |
|---|---|
| UI | React 19, Vite, Tailwind CSS 4, `motion`, `lucide-react` |
| Server | Express on Node, TypeScript via `tsx` in dev, bundled by `esbuild` to `dist/server.cjs` |
| Extraction | Cheerio scraper, dedicated ATS APIs, Google Gemini (`@google/genai`, `gemini-3.8-flash`) |
| Storage | Supabase Postgres when `SUPABASE_URL` + `SUPABASE_ANON_KEY` are set, otherwise local `spreadsheet_data.json` (one or the other, not mirrored) |
| Accounts | Supabase Auth with Google sign-in; each job row has an owner (`user_id`) enforced by row-level security |
| Hosting | Render web service (`render.yaml`), built with Bun |
| Optional | Google Sheets sync from the browser (4.6), via a separate Google client in `firebase-applet-config.json` |

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
- Import and export as JSON or CSV; optional Google Sheets sync (4.6).

### 4.4 Accounts and access
- Anyone can sign up with Google. Each account sees, edits, imports and gets duplicate warnings against only its own jobs.
- Every `/api` request (except `GET /api/auth/config`) carries the user's Supabase access token as `Authorization: Bearer <token>`. The server verifies it and queries Postgres as that user, so row-level security enforces ownership.
- Imported jobs whose ids belong to someone else get a fresh id and become new rows; the server picks every new job's id.
- Each user can run `EXTRACTION_DAILY_LIMIT` extractions per UTC day (default 30). Job links are fetched only when they resolve to public addresses.
- Without Supabase the API runs as a single local user in development and returns 503 in production.

### 4.5 Versioning and checks
- Every PR bumps `version` in `package.json` (MINOR for features and behavior changes, PATCH for fixes and chores), enforced by the **Version bump** check. The version and deployed commit (`RENDER_GIT_COMMIT` on Render, else local git) show at the bottom of the Settings menu.
- The **CI** check type-checks, tests and builds every PR.
- The **Docs updated** check fails a PR that changes app files without changing a doc, and a `schema.sql` change without a `docs/MIGRATIONS.md` entry (`AGENTS.md`).

### 4.6 Google Sheets sync (`src/lib/googleSheets.ts`, `src/hooks/useGoogleSheetsSync.ts`)
- Runs entirely in the browser and is separate from app sign-in: the user grants Drive and Sheets access to a Google OAuth client whose ID is `oAuthClientId` in `firebase-applet-config.json` (Google Identity Services popup, with Firebase Auth's popup as the fallback). The access token is kept in memory only.
- The user picks an existing spreadsheet or creates one. Sync writes a header plus one row per job to the first tab from `A1`, and clears leftover rows below, so the tab mirrors the tracker and manual edits there are overwritten.
- Auto-sync (optional) re-syncs shortly after any change to the job list. The chosen sheet and the auto-sync setting are remembered per browser in `localStorage`.
- For a new deployment, the app's URL must be in that OAuth client's **Authorized JavaScript origins** and in the Firebase project's **Authorized domains**.

---

## 5. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/auth/config` | Public. Supabase URL, anon key and Google client ID the browser needs to sign in |
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

`JobRecord` in `src/types.ts`; Postgres table `public.jobs` in `supabase/schema.sql` (keep both in sync, and add the production SQL to `docs/MIGRATIONS.md`). The table also has `user_id` (owner, defaults to `auth.uid()`), which is not part of `JobRecord`.

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
  companyMetadata: { headcount?; headquarters?; ownership?; foundingYear?; source? };
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
| `GEMINI_API_KEY` | Recommended | Gemini extraction (Tiers 3–4 and pasted text) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Production | Postgres storage and Google sign-in; the anon key is public by design |
| `GOOGLE_OAUTH_CLIENT_ID` | Recommended | Google's own sign-in popup on this site, so the account chooser names the app, not Supabase |
| `EXTRACTION_DAILY_LIMIT` | Optional | Extractions per user per UTC day (default 30; 0 turns it off) |
| `NODE_ENV` | Production | `production` serves the built client from `dist/` |
| `PORT` | Optional | Listen port (default 3000; Render sets it) |
| `DISABLE_HMR` | Optional | `true` turns off Vite hot reload and file watching in dev |

See `README.md` for local setup and deployment steps, and `docs/MIGRATIONS.md` for upgrading an existing database.
