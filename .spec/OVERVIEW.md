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
- **Live & Verified:** v0.12.x on Cloudflare Workers (jobs.charliechonguyen.com): link and paste ingest, one-click capture bookmarklet (with in-place upgrade of **Needs review** stubs), multi-tier extraction (ATS APIs for nine platforms, Schema.org fast path, Gemini, bot-wall short-circuit), company facts, duplicate warning, Google sign-in per account, search across every status, Google Sheets sync, and owner-only Gmail status suggestions.
- **Harness:** Engine files synced to claude-harness-hub v3.2.0 (PR #29, 2026-11-12; later engine-only syncs PRs #44, #46, #47).
- **In Progress:** None
- **Up Next:** Retire the Render deploy (Cloudflare has been the production host since 2026-10-20; Charlie to confirm).
