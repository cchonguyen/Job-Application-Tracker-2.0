# Job Application Easy Tracker

Personal job-application tracker that ingests posting URLs (or pasted descriptions), extracts structured fields, and stores them in a spreadsheet-style UI.

## Features

- Paste a Greenhouse, Lever, or career-page URL to extract company, title, location, salary, and metadata
- Manual text fallback for SPA / bot-protected portals (e.g. Darwinbox)
- One-click capture bookmarklet (Settings › One-click capture) that saves the page you are viewing, including Darwinbox, Workday and LinkedIn
- Track status: Saved → Applied → Interviewing → Offer → Accepted / Rejected / Declined
- Search, filter, sort, edit, notes, and CSV/JSON export
- Import previously exported JSON or CSV (Options → Import JSON / CSV)
- ATS debugger for multi-tier extraction diagnostics
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

Use this on Render Free so jobs survive redeploys and each user signs in with Google.

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → New query → paste and run [`supabase/schema.sql`](supabase/schema.sql).
3. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon / publishable** key → `SUPABASE_ANON_KEY` (public by design; the server never needs the service_role key)
4. Turn on Google sign-in:
   - In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** (type *Web application*). Under **Authorized redirect URIs** add `https://YOUR_REF.supabase.co/auth/v1/callback`.
   - In Supabase **Authentication → Sign In / Providers → Google**, enable it and paste the client ID and secret.
   - In Supabase **Authentication → URL Configuration**, set **Site URL** to your app URL (e.g. `https://your-app.onrender.com`) and add it, plus `http://localhost:3000` for local testing, to **Redirect URLs**.
5. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `.env` locally and to Render **Environment**.

On startup the server logs `Persistence: Supabase with Google sign-in (…)` when configured.

### Security notes

- The server queries Postgres as the signed-in user, so the row-level security policies in `schema.sql` are what keep accounts apart.
- Each user can add `EXTRACTION_DAILY_LIMIT` jobs by link or pasted text per day (default 30), since each one can spend Gemini quota.
- Job links are fetched only if they resolve to public addresses; private, loopback and cloud-metadata addresses are refused, including via redirects.

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Express + Vite middleware (port 3000) |
| `bun run build` | Production client + server bundle |
| `bun run start` | Run production server from `dist/` |
| `bun run test` | Unit tests (ATS detection, salary parsing, date rules) |
| `bun run lint` | Typecheck with `tsc --noEmit` |

## Deploy on Render

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
- `EXTRACTION_DAILY_LIMIT` = optional per-user daily extraction limit (default 30)

Then **Manual Deploy**. Confirm logs show `Persistence: Supabase with Google sign-in`.

## Stack

React 19, Vite, Tailwind CSS 4, Express, Cheerio, Google Gemini (`@google/genai`), Supabase Postgres.
