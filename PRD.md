# Product Requirements Document (PRD)
## Job Application Tracker

What the app does today, how it is built, and the product rules any change must keep. This file is the source of truth for behavior: a PR that changes anything described here updates it in the same PR (see "Documentation" in `AGENTS.md`; the **Docs updated** check enforces it).

---

## 1. Goal

Capture a job posting with one click from its link (or from the page you are viewing) and track the application's status from Saved to its outcome, with as little manual typing as possible.

---

## 2. Product rules

- **Every ingest is an immutable snapshot.** A saved job keeps the JD details as captured. Re-ingesting a reposted or similar job adds a new row; it never overwrites or updates an existing one. Only user-owned fields change after capture: status, date applied, notes and manual edits. *Exception for incomplete stubs:* When an automated ingest is blocked by bot/login walls (producing a Tier 5 fallback row marked **Needs review**), capturing that exact job page again with real content (e.g. via the 1-Click Capture Bookmarklet or manual paste) automatically updates the existing stub row in-place with the completed extraction while strictly preserving all user-owned fields (status, date applied, date added, notes, status history). No duplicate warning is triggered and no second row is created.
- **Never invent posting details.** When no model actually read the posting, fields that could not be read are stored as `Unknown` / `Not listed`, not as plausible defaults or benchmark salaries. Such jobs show a **Needs review** badge. Jobs saved before v0.3.0 may carry the old hard-coded company placeholder (1,000+ employees, United States, Private); the UI shows that exact trio as Unknown.
- **Always persist canonical unwrapped URLs.** Ingested URLs are canonicalized at Phase 0 (unwrapping aggregator redirects, stripping tracking query parameters, and trimming `/apply` sub-routes) before persistence in `JobRecord.url`, ensuring clean links, reliable 6-month duplicate matching, and seamless stub upgrades.
- **Duplicates are flagged, not blocked.** A new job is flagged when it has the same posting URL as, or is at the same company as, one of the user's applications from the past six months (any role there counts; same-role matches rank first). The same title at a different company is never flagged. The user sees a comparison and chooses to save anyway or skip.
- **Each account sees only its own jobs.** Every `/api` call (except `GET /api/auth/config`) carries the signed-in user's token, and Postgres row-level security enforces ownership (4.4).

---

## 3. Architecture

| Layer | Choice |
|---|---|
| UI | React 19, Vite, Tailwind CSS 4, `motion`, `lucide-react` |
| Icons | Favicon is a white briefcase on a cyan (`#0b7285`) rounded square: `public/favicon.svg`, with `favicon.ico` (16/32/48) and `apple-touch-icon.png` (180) fallbacks, linked from `index.html` |
| Server | The `/api` routes are one Hono app (`server/routes/index.ts`) that runs in two places: on Cloudflare Workers (`worker.ts`, `wrangler.toml`, with `nodejs_compat`), and on Node through `server.ts`, where Express also serves the client (Vite middleware in dev, `dist/` in production; bundled by `esbuild` to `dist/server.cjs`) |
| Extraction | Cheerio scraper, dedicated ATS APIs, Google Gemini (`@google/genai`, `gemini-3.8-flash`) |
| Storage | Supabase Postgres when `SUPABASE_URL` + `SUPABASE_ANON_KEY` are set, otherwise local `spreadsheet_data.json` (one or the other, not mirrored) |
| Accounts | Supabase Auth with Google sign-in; each job row has an owner (`user_id`) enforced by row-level security |
| Hosting | Cloudflare Workers (`wrangler.toml`): `dist/` is served as static assets with a single-page-app fallback, and only `/api/*` runs the Worker. Cloudflare Workers Builds deploys `main`. The Render web service (`render.yaml`) still works as an alternative host. Both build with Bun |
| Optional | Google Sheets sync from the browser (4.6), via a separate Google client in `firebase-applet-config.json` |

---

## 4. Features

### 4.1 Ingest
- **Link ingest**: paste a URL in the header bar. `POST /api/extract-job` canonicalizes the link (Phase 0), runs the extraction pipeline (4.2), checks for duplicates, and saves the job with the chosen starting status.
- **Paste text**: for pages that cannot be fetched, paste the job description; Gemini extracts it, with a deterministic text parser as the fallback.
- **One-click capture bookmarklet** (Settings › One-click capture): drag the bookmark to the bookmarks bar, then click it on any posting. It opens a small tracker popup with the page URL and the rendered page text (or the current selection), sent in the URL fragment, and saves it through the same ingest. This covers client-rendered or bot-protected sites such as Darwinbox, Workday, SmartRecruiters, and LinkedIn. If an incomplete **Needs review** stub already exists for this URL, the bookmarklet upgrades it in-place. Real-time cross-tab synchronization over `BroadcastChannel('jat-jobs-sync')` (with `localStorage` fallback) immediately reflects saved or upgraded jobs in the main tracker tab and open Job Detail drawer without refreshing the page. A per-browser token embedded in the bookmark stops other sites from adding jobs through crafted links; resetting it retires old bookmarks.

### 4.2 Extraction pipeline (`server/services/parsing`)
Supports 25+ ATS and career platforms across 5 coordinated layers with early exit and WAF bypass:
1. **Phase 0, Pre-Flight Canonicalizer**: Unwraps aggregator redirects (LinkedIn `/redir/redirect`, Indeed `/rc/clk`, Glassdoor), rewrites LinkedIn `currentJobId` and Indeed `jk` view URLs, strips tracking noise (`utm_*`, `gh_src`, etc.) and `/apply` subpaths while preserving critical ATS job IDs (`?gh_jid`, `?ashby_jid`, etc.), guarded against SSRF by `fetchPublicUrl`.
2. **Tier 1, ATS APIs**: Direct REST and JSON APIs for Greenhouse, Lever, Workable (`.md` and v3 API), Ashby, Workday (`/wday/cxs` JSON with automatic fallback to Tier 2 SSR JSON-LD), SmartRecruiters, Recruitee, Pinpoint, and BambooHR.
3. **Strict Fast-Path Normalizer (Tier 1.5 & Tier 2.5)**: When Tier 1 or Tier 2 retrieves structured data with valid company, title, location, and substantive text (>= 200 clean characters), the record is deterministically normalized in `< 5ms` (title/team splitting, skill taxonomy matching, seniority/department classification, summary extraction) and skips Gemini entirely (**0 AI quota charged**).
4. **Tier 2, HTML scrape & hydration state**: Stream-bounded (2MB max via `readResponseTextUpTo`), recursive Schema.org `JobPosting` JSON-LD parser with salary unit awareness (`YEAR` vs `HOUR`), SPA hydration state reader (`<script id="__NEXT_DATA__">`, `window.__INITIAL_STATE__`), and iCIMS iframe unnesting (`?in_iframe=1`).
5. **WAF / Bot-Wall Short-Circuit**: URLs on login-walled or bot-guarded portals (LinkedIn returning HTTP 999, Darwinbox SPA shell, Cloudflare 401/403/429) that fail Tier 2 immediately short-circuit past Tier 4 directly to Tier 5 in `< 3s`, avoiding 20–40s hangs, alerting the user via an informative warning toast that automated ingestion was blocked and the job was saved as "Needs review", and consuming **0 AI quota**.
6. **Tier 3, Gemini on scraped content**: Structured JSON extraction from what Tier 2 retrieved (`gemini-3.8-flash`).
7. **Tier 4, Gemini URL context**: Gemini fetches the page itself with the `url_context` tool (skipped on hard WAF/auth walls).
8. **Tier 5, Deterministic fallback**: Company and title from URL or HTML tags; unreadable fields marked `Unknown` / `Not listed` with the **Needs review** badge, paired with an actionable 1-Click Bookmarklet callout in the Job Detail drawer.

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
- Each user can run `EXTRACTION_DAILY_LIMIT` AI extractions per UTC day (default 30), and the same number of company-fact lookups, counted separately. Daily extraction quota is charged only when Gemini inference (Tier 3 or Tier 4) is actually invoked; Fast-Path extractions and WAF short-circuit fallbacks consume **0 AI quota**. When daily quota is exhausted, Fast-Path and deterministic fallbacks still process listings cleanly rather than hard-failing. With Supabase the counts live in `public.daily_usage` through `take_daily_usage()`, so they hold across restarts and across Worker instances; without Supabase, or if that function is missing, they are counted in the server's memory.
- Job links are fetched only when they resolve to public addresses (checked on every redirect). Outbound requests are stream-capped at 2MB to prevent Worker memory exhaustion. On Node the check uses the system resolver; on Cloudflare it asks Cloudflare's DNS-over-HTTPS service.
- Without Supabase the API runs as a single local user in development and returns 503 in production.

### 4.5 Versioning and checks
- Every PR bumps `version` in `package.json` (MINOR for features and behavior changes, PATCH for fixes and chores), enforced by the **Version bump** check. The version and deployed commit (`WORKERS_CI_COMMIT_SHA` on Cloudflare, `RENDER_GIT_COMMIT` on Render, else local git) show at the bottom of the Settings menu.
- The **CI** check type-checks, tests and builds every PR.
- The **Docs updated** check fails a PR that changes app files without changing a doc, and a `schema.sql` change without a `docs/MIGRATIONS.md` entry (`AGENTS.md`).

### 4.6 Google Sheets sync (`src/lib/googleSheets.ts`, `src/hooks/useGoogleSheetsSync.ts`)
- Runs entirely in the browser and is separate from app sign-in: the user grants Drive and Sheets access to a Google OAuth client whose ID is `oAuthClientId` in `firebase-applet-config.json` (Google Identity Services popup, with Firebase Auth's popup as the fallback). The access token is kept in memory only.
- The user picks an existing spreadsheet or creates one. Sync writes a header plus one row per job to the first tab from `A1`, and clears leftover rows below, so the tab mirrors the tracker and manual edits there are overwritten.
- Auto-sync (optional) re-syncs shortly after any change to the job list. The chosen sheet and the auto-sync setting are remembered per browser in `localStorage`.
- For a new deployment, the app's URL must be in that OAuth client's **Authorized JavaScript origins** and in the Firebase project's **Authorized domains**.

### 4.7 Gmail status suggestions (`src/lib/emailSignals.ts`, `apps-script/GmailBridge.gs`)
- A personal feature for the account named in `GMAIL_BRIDGE_OWNER_EMAIL`. Every other account gets `enabled: false` and never sees the owner's mail. Setup steps are in `docs/GMAIL_BRIDGE.md`.
- The owner deploys `apps-script/GmailBridge.gs` in their own Google account as an Apps Script web app. It only reads mail: when called with the right key it searches recent job emails (ATS senders, or subjects about applications, interviews and offers) and returns up to 200 summaries (ids, date, sender, subject, the first 1,500 characters of plain text, and up to 20 links). The tracker holds no Gmail token.
- Settings › Gmail suggestions calls `GET /api/email-suggestions`, which asks the bridge for the last 30 days and builds suggestions. Nothing is changed until the user clicks **Apply**, which goes through the normal status update. **Dismiss** hides that email's suggestion in this browser.
- Classifying uses keyword rules only, so it never uses Gemini quota. Rejection phrases win over everything except job-alert mail, which is ignored. After that, Offer beats Interviewing, which beats an application confirmation (Applied).
- Matching considers only jobs in Saved, Applied, Interviewing or Offer. Signals are the ATS board slug from the job's link (Greenhouse, Lever, Ashby, Workday, SmartRecruiters) found in the email's links or sender, and the company name in the sender's name, domain or subject, plus title words as a tie-breaker. A clear winner is high confidence. A weaker or close match is shown as "check this".
- Suggestions only move a job forward (Saved → Applied → Interviewing → Offer), or to Rejected from any open status. They never suggest Accepted or Declined, never create jobs, and never touch the captured job details, so the snapshot and duplicate rules are unaffected.

### 4.8 Appearance (`src/lib/theme.ts`, `src/index.css`)
- Light, dark, and system appearance modes (defaulting to `light`, with `system` following OS `prefers-color-scheme`) plus five accent colors (`cyan` / `neon-cyan` default `#0b7285`, `emerald`, `amber`, `rose`, and `indigo`), chosen in the Theme menu and saved in the browser (`jat-theme`). The saved theme is applied before first paint with both `data-mode` and `data-theme` synced on `<html>`.
- Status colors are fixed per status and never follow the accent; they are defined once in `src/lib/statusMeta.ts`.
- The project's Harness UI profile lives in [`design-system/profile.md`](design-system/profile.md) and the full design language and voice rules live in `docs/DESIGN_SYSTEM.md`.

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
| `GET` | `/api/email-suggestions?days=` | Owner only. Suggested status changes from recent Gmail via the Apps Script bridge (read-only) |
| `POST` | `/api/test-ats-diagnostic` | Run the pipeline on a URL and report every tier |

---

## 6. Data model

`JobRecord` in `src/types.ts`; Postgres table `public.jobs` in `supabase/schema.sql` (keep both in sync, and add the production SQL to `docs/MIGRATIONS.md`). The table also has `user_id` (owner, defaults to `auth.uid()`), which is not part of `JobRecord`. A second table, `public.daily_usage` (`user_id`, `kind`, `day`, `count`), holds the daily-limit counters; users cannot read or write it directly, only through `take_daily_usage(p_kind, p_limit)`.

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
| `GMAIL_BRIDGE_URL`, `GMAIL_BRIDGE_KEY` | Optional | The Apps Script web app's `/exec` URL and its key (4.7). Store both as Secrets |
| `GMAIL_BRIDGE_OWNER_EMAIL` | Optional | The only account allowed to see Gmail suggestions. All three must be set or the feature stays off |
| `NODE_ENV` | Production | `production` serves the built client from `dist/` on Node, and makes the API refuse to run without Supabase. Set in `wrangler.toml` for Cloudflare |
| `PORT` | Optional | Listen port on Node (default 3000; Render sets it). Unused on Cloudflare |
| `DISABLE_HMR` | Optional | `true` turns off Vite hot reload and file watching in dev |

See `README.md` for local setup and deployment steps, and `docs/MIGRATIONS.md` for upgrading an existing database.
