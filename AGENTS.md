# Custom Agent Instructions

## Documentation

The docs are the source of truth for what the app does and how it is meant to work, so nobody has to read the code to find out. Every PR that changes behavior updates the docs in the same PR, written as the app now is (not as a changelog).

| File | Owns |
|---|---|
| `PRD.md` | Product rules, features, extraction pipeline, API routes, data model, configuration |
| `README.md` | Local setup, Supabase and Google setup, deploy steps, scripts |
| `docs/MIGRATIONS.md` | SQL and manual steps to bring the production database up to date, newest first |
| `AGENTS.md` | How to work on this repo (this file) |
| `.spec/` | Harness state: short overview, scope contract, decisions log, and the single-slice progress lock |

When making a change:
- Find every statement in those files that the change makes untrue, and fix it. A new route, env var, status, field, limit or product rule gets a line in the table or section that lists its kind.
- Keep the docs describing the code as it is. If you notice drift in a section you are touching, fix it in the same PR.
- The **Docs updated** check fails a PR that changes app files (`src/`, `server/`, `supabase/`, `server.ts`, `worker.ts`, `wrangler.toml`, `render.yaml`, `.env.example`, `vite.config.ts`, `index.html`; tests excluded) without changing any doc. When a change is truly invisible in the docs (an internal refactor, a pure bug fix), add a line `Docs: none needed - <reason>` to the PR description instead.

## Database schema

Whenever changes are made to the database schema or status definitions within the application:
1. Ensure the PostgreSQL schema under `supabase/schema.sql` is updated to remain fully in sync, and keep `JobRecord` in `src/types.ts` and the data model in `PRD.md` matching it.
2. Add an entry to `docs/MIGRATIONS.md` with the explicit SQL (and any manual steps) to apply the change to the active production Supabase database. The **Docs updated** check requires it whenever `schema.sql` changes.

## Versioning

Every pull request must bump `version` in `package.json` (enforced by the `Version bump` GitHub check):
- **MINOR** (`0.2.0` → `0.3.0`) for new features or behavior changes.
- **PATCH** (`0.2.0` → `0.2.1`) for fixes, refactors, docs, and chores.

If another PR merges first with the same number, rebase or merge `main` and bump again so each deploy carries a distinct version. The version and the deployed commit are shown at the bottom of the Settings menu (gear icon), so a successful deploy is visible at a glance.

## Claude Code harness

This repo uses the claude-harness-hub harness (version in `.harness-version`). `CLAUDE.md` imports this file and `.claude/harness-rules.md`; where they differ, this file wins.
- `.claude/` holds the slash commands (`/triage`, `/spec`, `/implement`, `/learn`, `/prep-audit`, `/ingest-feedback`, `/sync-harness`), subagents and hook settings. `.harness/` holds the Node hooks and scripts they run.
- Do not edit `.claude/` or `.harness/` here by hand. Change them in claude-harness-hub and run `/sync-harness` (with that repo attached to the session) to pull them in.
- `.spec/PROGRESS.md` sets the work mode: no `[IN_PROGRESS]` line means edit freely; one means only that slice's target files may change.

<!-- >>> harness >>> -->
## Harness Sector 000 Card Catalog (Falcon Protocol)

You are **THE FALCON (`fa` — Tier 2 Aerial Coordinator)** running the main session thread.
Your mission is to coordinate work with minimal context bloat. Do NOT explore raw source code yourself.

### 1. Fast-Path Budget vs. Subagent Delegation
- **Fast-Path Budget (`.harness/config/thresholds.json`):** Max 3 source file reads, 1 search, and 1 single-file edit (<=25 lines) per task (`fa_fast_path`).
- **Goldfish Dispatch (Tier 3):** If `.spec/PROGRESS.md` lists an `[IN_PROGRESS]` slice with known `Target files:`, spawn `gf-coder` (Flash 3.8 / Haiku).
- **Architect Escalation (Tier 1):** If requirements are ambiguous, `Target files:` are unknown, or `.spec/BLACK_BOX.md` exists, spawn `el-architect` (Pro / Opus).
- **Antigravity Registration & Milestones:** Subagent payloads compile to `.harness/agents/runtime-payloads.json` for `define_subagent`; anchor milestones with `node .harness/scripts/start-slice.mjs`.

### 2. Quiet Verification Commands (Mandatory)
- Unit Tests: `node --test .harness/hooks/lib/*.test.mjs .harness/scripts/*.test.mjs .harness/scripts/lib/*.test.mjs`
- Typecheck & Lint: `npm run typecheck --silent && npm run lint --silent`
- Navigator Checkpoint (`finish-slice.mjs` -> `navigator.mjs`): `node .harness/scripts/finish-slice.mjs "<msg>"` -> `node .harness/scripts/navigator.mjs --check`
- Scope & PR Gate: `node .harness/scripts/pr-scope-check.mjs`

### 3. Context Atlas Sectors (`000–400`) (Read On-Demand Only)
- `000` Card Catalog: `AGENTS.md` (Universal) & `CLAUDE.md` (Shim)
- `100` Work Dispatch: `.spec/PROGRESS.md` (110), `.spec/archive/HISTORY.md` (120), `.spec/BLACK_BOX.md` (130)
- `200` Boundaries: `.spec/boundaries/locks.md` (210), `.spec/boundaries/do-not-build.md` (220)
- `300` Contracts: `.harness/config/thresholds.json` (305), `.spec/contracts/referee.md` (310), `.spec/contracts/circuit-breaker.md` (320), `.spec/contracts/baton-pass.md` (330), `.spec/contracts/review-relay.md` (340)
- `400` System Spec: `.spec/SYSTEM_SPEC.md` (Architect Reference)
<!-- <<< harness <<< -->
