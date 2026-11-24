# System Specification & Contracts

`PRD.md` is the detailed source of truth. This file is the short contract the harness checks work against.

## 1. Core Scope & MVP Boundaries
- One-click ingest of a job posting into an immutable snapshot row, plus status tracking (Saved, Applied, Interviewing, Offer, Accepted, Rejected, Declined).
- Each account sees only its own jobs (Supabase row-level security).
- Supporting features: one-click capture bookmarklet, duplicate warning, company facts, search and analytics, JSON/CSV import and export, optional Google Sheets sync, and owner-only Gmail status suggestions (`PRD.md` section 4).
- Design system export: `docs/DESIGN_SYSTEM.md` is a Markdown guide a new Claude Code app can follow to reuse this app's visual language and product voice. Status colors live in one place (`src/lib/statusMeta.ts`).

## 2. Strictly Out of Scope ("Do NOT Build" List)
- Never overwrite or update a saved job's posting details when the same job is ingested again; add a new row. The one exception is an incomplete **Needs review** stub, which a complete capture of the same link upgrades in place (ADR-006).
- Never invent posting details; unreadable fields stay `Unknown` / `Not listed`.
- Never block a duplicate; flag it and let the user choose.
- Design export: no Style Dictionary or Figma pipeline, no npm package, no machine-readable token file, no new theme engine beyond the light, dark and system modes and five accents.

## 3. Data Models & Module Boundaries
- `src/`: React client. `JobRecord` in `src/types.ts` mirrors `supabase/schema.sql`.
- `server/`: Hono `/api` routes, extraction pipeline (`server/services/parsing`), company facts (`server/services/company`).
- `apps-script/GmailBridge.gs`: the read-only Gmail bridge the owner deploys in their own Google account.
- `worker.ts` / `server.ts`: Cloudflare Workers and Node entry points.
- `supabase/schema.sql`: database schema; production changes are recorded in `docs/MIGRATIONS.md`.
