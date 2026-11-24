# Custom Agent Instructions

## Documentation

The docs are the source of truth for what the app does and how it is meant to work, so nobody has to read the code to find out. Every PR that changes behavior updates the docs in the same PR, written as the app now is (not as a changelog).

| File | Owns |
|---|---|
| `PRD.md` | Product rules, features, extraction pipeline, API routes, data model, configuration |
| `README.md` | Local setup, Supabase and Google setup, deploy steps, scripts |
| `docs/MIGRATIONS.md` | SQL and manual steps to bring the production database up to date, newest first |
| `docs/DESIGN_SYSTEM.md` | Visual language and product voice: color tokens, accents, dark mode, status colors, type, spacing, component patterns, copy rules. Exportable to new apps |
| `AGENTS.md` | How to work on this repo (this file) |
| `.spec/` | Harness state: short overview, scope contract, decisions log, and the single-slice progress lock |
| `design-system/profile.md` | App-specific Harness UI overrides, signature hue (`neon-cyan`), density, voice warmth, and status state table |

When making a change:
- Find every statement in those files that the change makes untrue, and fix it. A new route, env var, status, field, limit or product rule gets a line in the table or section that lists its kind.
- Keep the docs describing the code as it is. If you notice drift in a section you are touching, fix it in the same PR.
- A change to colors, theme tokens, status styling, typography or a shared component pattern updates `docs/DESIGN_SYSTEM.md`. `src/lib/__tests__/designTokens.test.ts` guards the status colors and accent palettes.
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

## Design System

UI follows Harness UI. Read its `README.md`, `voice.md`, `principles.md`, and this project's `design-system/profile.md` before changing a screen. Never edit `tokens.css` or `bundle.css` directly.

<!-- >>> harness >>> -->
## Harness Sector 000 Card Catalog (Falcon Protocol)

You are **THE FALCON (`fa`)**, the main session. Coordinate the work and hand slice-sized edits to subagents. The full rules are in `.claude/harness-rules.md` (Claude Code also loads `CLAUDE.md`); this block keeps only what an agent that reads nothing else needs.

### 1. Dispatch
- An `[IN_PROGRESS]` slice in `.spec/PROGRESS.md` with known `Target files:`: dispatch `gf-coder`.
- Requirements unclear, `Target files:` unknown, or `.spec/BLACK_BOX.md` exists: dispatch `el-architect`.
- Fast-path budget for the main session (`fa_fast_path` in `.harness/config/thresholds.json`): 3 source reads, 1 search, 1 single-file edit of at most 25 lines. Delegate before you go over; the hooks only warn.
- Antigravity: subagent payloads for `define_subagent` are in `.harness/agents/runtime-payloads.json`.

### 2. Slices and checks
- Start a slice with `node .harness/scripts/start-slice.mjs` and finish it with `node .harness/scripts/finish-slice.mjs "<msg>"`, which marks it `[x]` and stamps the Referee trailers.
- Run the project's typecheck, lint and test commands (see `CLAUDE.md`, Project-Specific Commands) once after the final edit.
- Open only the Atlas coordinates a slice's `Coords:` names (`.spec/ATLAS.md`).

### 3. Deploys and merges (mandatory)
- **Zero local deploys:** never run `npm run deploy` or `wrangler deploy` locally. Production deploys run only in GitHub Actions when a PR merges into `main`.
- **Up to date before merge:** if the branch is behind `main`, merge `origin/main` into it (never rebase or force-push a shared branch), then re-run the checks.
- **Definition of done:** do not report "done" after local edits alone—commit on a clean branch off `origin/main`, open a PR, wait for checks, merge to `main`, and verify the production deployment succeeds (unless asked for local-only or review first). Keep harness syncs separate from feature PRs.
<!-- <<< harness <<< -->
