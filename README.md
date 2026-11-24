# Job Application Easy Tracker

Personal job-application tracker that ingests posting URLs (or pasted descriptions), extracts structured fields, and stores them in a spreadsheet-style UI.

## Documentation

| File | What it covers |
|---|---|
| [`PRD.md`](PRD.md) | What the app does and the rules it must keep: features, extraction pipeline, API, data model, configuration |
| This README | Setup, deployment and scripts |
| [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) | SQL to bring an existing production database up to date |
| [`docs/GMAIL_BRIDGE.md`](docs/GMAIL_BRIDGE.md) | Connecting your own Gmail for status suggestions |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Colors, status styling, type, component patterns and copy rules |
| [`design-system/profile.md`](design-system/profile.md) | This app's Harness UI profile (signature hue, density, voice) |
| [`AGENTS.md`](AGENTS.md) | How to contribute: docs, schema and versioning rules |
| [`.spec/`](.spec/) | Harness state for Claude Code: overview, scope contract, decisions log, slice progress and session handoff |

The docs change in the same PR as the code they describe; the **Docs updated** check enforces it.

## Features

- Paste a job posting URL (Greenhouse, Lever, Workable, Ashby, Workday, SmartRecruiters and more, or any career page) to extract company, title, location, salary, and metadata
- Manual text fallback for SPA / bot-protected portals (e.g. Darwinbox)
- One-click capture bookmarklet (Settings › One-click capture) that saves the page you are viewing, including Darwinbox, Workday and LinkedIn
- Track status: Saved → Applied → Interviewing → Offer → Accepted / Rejected / Declined
- Search across all statuses, filter, sort, edit, notes, and CSV/JSON export
- Import previously exported JSON or CSV (Data → Import CSV/JSON above the table)
- ATS diagnostic (Settings › ATS diagnostic) that shows what each extraction tier returned for a URL
- Optional Google Sheets sync, and owner-only Gmail status suggestions
- Google sign-in: each account sees only its own applications (Supabase Auth + Postgres row-level security)
- Free persistent storage via **Supabase** (Postgres), with local JSON fallback for offline/dev

## Setup (local)

```bash
bun install
cp .env.example .env
# Set GEMINI_API_KEY. Optionally set SUPABASE_URL + SUPABASE_ANON_KEY to use sign-in.
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without Supabase env vars, sign-in is skipped and jobs are stored in gitignored `spreadsheet_data.json` (copied from the example on first run).

## Supabase (storage and sign-in)

Use this in production so jobs survive redeploys and each user signs in with Google.

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → New query → paste and run [`supabase/schema.sql`](supabase/schema.sql).
3. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon / publishable** key → `SUPABASE_ANON_KEY` (public by design; the server never needs the service_role key)
4. Turn on Google sign-in:
   - In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** (type *Web application*). Under **Authorized redirect URIs** add `https://YOUR_REF.supabase.co/auth/v1/callback`.
   - In Supabase **Authentication → Sign In / Providers → Google**, enable it and paste the client ID and secret.
   - In Supabase **Authentication → URL Configuration**, set **Site URL** to your app URL (e.g. `https://jobs.example.com`) and add it, plus `http://localhost:3000` for local testing, to **Redirect URLs**.
5. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `.env` locally and to your host's settings (Cloudflare or Render, below).
6. Optional but recommended: set `GOOGLE_OAUTH_CLIENT_ID` to the same Google client ID. Sign-in then runs in Google's popup on your site, so Google's account chooser names your app's address instead of `YOUR_REF.supabase.co`. Your app URL must be in the client's **Authorized JavaScript origins**.

On startup the server logs `Persistence: Supabase with Google sign-in (…)` when configured.

Upgrading a database created before v0.6.0? Follow [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) instead of step 2, including claiming your existing jobs after the first sign-in.

### Google Sheets sync (optional)

Sheets sync runs in the browser using `GOOGLE_OAUTH_CLIENT_ID` from `/api/auth/config`. On a new deployment, add your app URL to that client's **Authorized JavaScript origins** in Google Cloud. See PRD 4.6 for how sync behaves.

### Gmail status suggestions (optional, owner only)

Deploy [`apps-script/GmailBridge.gs`](apps-script/GmailBridge.gs) as a web app in your own Google account, then set `GMAIL_BRIDGE_URL`, `GMAIL_BRIDGE_KEY` and `GMAIL_BRIDGE_OWNER_EMAIL` on the Worker. Step-by-step setup is in [`docs/GMAIL_BRIDGE.md`](docs/GMAIL_BRIDGE.md), and PRD 4.7 describes how suggestions are made.

### Security notes

- The server queries Postgres as the signed-in user, so the row-level security policies in `schema.sql` are what keep accounts apart.
- Set `ALLOWED_USER_EMAILS` (comma-separated emails) to restrict API access to specific Google accounts; leave it empty to allow any Google account.
- Each user gets `EXTRACTION_DAILY_LIMIT` Gemini extractions per UTC day (default 30), plus the same number of company-fact lookups. Only steps that call Gemini count; once the limit is reached, jobs are still saved without Gemini, from ATS data or the deterministic parsers (which mark them **Needs review**). The counts are kept in Supabase (`daily_usage`), so they hold on Cloudflare too, and `take_daily_usage` validates counter kinds and limits.
- Job links are fetched only if they resolve to public addresses; private, loopback and cloud-metadata addresses are refused, including via redirects.

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Node server with Vite middleware (port 3000) |
| `npx wrangler dev` | After `bun run build`: run the Cloudflare Worker locally (port 8787) |
| `bun run build` | Production client + server bundle |
| `bun run start` | Run production server from `dist/` |
| `bun run test` | Unit tests (extraction, duplicates, import, sign-in middleware, rate limits, safe fetching, and more) |
| `bun run lint` / `bun run typecheck` | Typecheck with `tsc --noEmit` (both run the same check) |
| `bun run test:watch` | Unit tests in watch mode |

## Deploy on Cloudflare

The app runs as one Cloudflare Worker: Cloudflare serves the built app from `dist/`, and only `/api/*` runs code (`worker.ts`, configured in `wrangler.toml`).

1. Run the SQL for the current version in [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) if you haven't.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → pick this repo. Name the Worker `job-application-tracker-2-0` (it must match `name` in `wrangler.toml`).
   - **Build command:** `bun install && bun run build`
   - **Deploy command:** `npx wrangler deploy`
   - Leave the production branch as `main`. Every push to `main` then builds and deploys.
3. Worker → **Settings** → **Variables and Secrets**, add each as type **Secret** (secrets always survive deploys; `keep_vars` in `wrangler.toml` also keeps plain-text ones):
   - `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optionally `GOOGLE_OAUTH_CLIENT_ID`, `EXTRACTION_DAILY_LIMIT`, and `ALLOWED_USER_EMAILS`. `NODE_ENV` comes from `wrangler.toml`.
   - For Gmail suggestions, also `GMAIL_BRIDGE_URL`, `GMAIL_BRIDGE_KEY` and `GMAIL_BRIDGE_OWNER_EMAIL` ([`docs/GMAIL_BRIDGE.md`](docs/GMAIL_BRIDGE.md)).
4. Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain**, e.g. `jobs.example.com` (the domain's DNS must be on Cloudflare, and no other DNS record may already use that name). Cloudflare creates the DNS record and certificate. (`workers_dev` and `preview_urls` are `false` in `wrangler.toml` so the Worker is only reachable via the custom domain.)
5. Add that address to the sign-in allow-lists: Supabase **Site URL** and **Redirect URLs**, the Google OAuth client's **Authorized JavaScript origins** (see above).

`WORKERS_CI_COMMIT_SHA` is set by Cloudflare's build and feeds the version line in the Settings menu. Logs: Worker → **Observability**.

Limits to know: on the Workers Free plan each request gets 10 ms of CPU time (time spent waiting on Gemini, Supabase or a job page does not count) and 50 outbound requests. Most requests fit; if very large job pages fail with "exceeded CPU", the Workers Paid plan raises the CPU limit.

## Deploy on Render (alternative)

| Setting | Value |
|---|---|
| **Branch** | `main` |
| **Build Command** | `bun install && bun run build` |
| **Start Command** | `bun run start` |

Environment variables:

- `NODE_ENV` = `production`
- `GEMINI_API_KEY` = your Google AI Studio key
- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_ANON_KEY` = Supabase **anon / publishable** key. Required in production: the API returns 503 without Supabase.
- `GOOGLE_OAUTH_CLIENT_ID` = optional; the Google client ID from Supabase's Google provider, so sign-in shows your app's name
- `EXTRACTION_DAILY_LIMIT` = optional per-user daily Gemini extraction limit (default 30)
- `ALLOWED_USER_EMAILS` = optional comma-separated Google account emails allowed to call `/api`

`PORT` and `RENDER_GIT_COMMIT` are set by Render automatically; the commit feeds the version line in the Settings menu.

Then **Manual Deploy**. Confirm logs show `Persistence: Supabase with Google sign-in`.

## Stack

React 19, Vite, Tailwind CSS 4, Hono (API), Express (Node host), Cloudflare Workers, Cheerio, Google Gemini (`@google/genai`), Supabase Postgres.
