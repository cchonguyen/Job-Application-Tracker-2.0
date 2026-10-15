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
- Free persistent storage via **Supabase** (Postgres), with local JSON fallback for offline/dev

## Setup (local)

```bash
bun install
cp .env.example .env
# Set GEMINI_API_KEY. Optionally set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without Supabase env vars, jobs are stored in gitignored `spreadsheet_data.json` (copied from the example on first run).

## Supabase (free persistent storage)

Use this on Render Free so jobs survive redeploys — no paid disk required.

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → New query → paste and run [`supabase/schema.sql`](supabase/schema.sql).
3. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server only; never put this in frontend code)
4. Add both to `.env` locally and to Render **Environment**.

On startup the server logs `Persistence: Supabase (jobs table)` when configured.

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
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase **service_role** key
- `API_ACCESS_KEY` = a long random secret (`openssl rand -hex 32`). Required in production: the API returns 503 without it. The app asks for it once per browser.

Then **Manual Deploy**. Confirm logs show `Persistence: Supabase (jobs table)`.

## Stack

React 19, Vite, Tailwind CSS 4, Express, Cheerio, Google Gemini (`@google/genai`), Supabase Postgres.
