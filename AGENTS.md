# Custom Agent Instructions

## Documentation

The docs are the source of truth for what the app does and how it is meant to work, so nobody has to read the code to find out. Every PR that changes behavior updates the docs in the same PR, written as the app now is (not as a changelog).

| File | Owns |
|---|---|
| `PRD.md` | Product rules, features, extraction pipeline, API routes, data model, configuration |
| `README.md` | Local setup, Supabase and Google setup, deploy steps, scripts |
| `docs/MIGRATIONS.md` | SQL and manual steps to bring the production database up to date, newest first |
| `AGENTS.md` | How to work on this repo (this file) |

When making a change:
- Find every statement in those files that the change makes untrue, and fix it. A new route, env var, status, field, limit or product rule gets a line in the table or section that lists its kind.
- Keep the docs describing the code as it is. If you notice drift in a section you are touching, fix it in the same PR.
- The **Docs updated** check fails a PR that changes app files (`src/`, `server/`, `supabase/`, `server.ts`, `render.yaml`, `.env.example`, `vite.config.ts`, `index.html`; tests excluded) without changing any doc. When a change is truly invisible in the docs (an internal refactor, a pure bug fix), add a line `Docs: none needed - <reason>` to the PR description instead.

## Database schema

Whenever changes are made to the database schema or status definitions within the application:
1. Ensure the PostgreSQL schema under `supabase/schema.sql` is updated to remain fully in sync, and keep `JobRecord` in `src/types.ts` and the data model in `PRD.md` matching it.
2. Add an entry to `docs/MIGRATIONS.md` with the explicit SQL (and any manual steps) to apply the change to the active production Supabase database. The **Docs updated** check requires it whenever `schema.sql` changes.

## Versioning

Every pull request must bump `version` in `package.json` (enforced by the `Version bump` GitHub check):
- **MINOR** (`0.2.0` → `0.3.0`) for new features or behavior changes.
- **PATCH** (`0.2.0` → `0.2.1`) for fixes, refactors, docs, and chores.

If another PR merges first with the same number, rebase or merge `main` and bump again so each deploy carries a distinct version. The version and the deployed commit are shown at the bottom of the Settings menu (gear icon), so a successful deploy is visible at a glance.
