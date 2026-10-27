# Project Overview (Owner's Manual)

## What This App Does
- Job Application Tracker: paste a job posting link (or click the bookmarklet on a posting) and the app saves a snapshot of the job, then tracks its status from Saved to its outcome.
- Full product rules and features live in `PRD.md`; setup and deploy steps live in `README.md`.

## Active External Services & Keys
- Supabase (Postgres + Google sign-in): `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Google Gemini (job extraction, company facts): `GEMINI_API_KEY`.
- Cloudflare Workers hosting on jobs.charliechonguyen.com (Render kept as an alternative host).
- See `.env.example` and `README.md` for the full list.

## Current Build Status
- **Live & Verified:** v0.7.x on Cloudflare Workers: link and paste ingest, bookmarklet capture, 4-tier extraction, duplicate warning, multi-user Google login.
- **In Progress:** None
- **Up Next:** Retire the Render deploy once Cloudflare has run cleanly for a week.
