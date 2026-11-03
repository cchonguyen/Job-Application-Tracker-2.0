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
## Harness rules for external agents (managed by the harness; edit in claude-harness-hub)

Before you change this repo, read `.spec/EXTERNAL_AGENT_RULES.md`. It is the full contract.

Rules that always apply:
1. Read `.spec/SESSION_HANDOFF.md` and check `Branch Owner`. Push only to a branch you own. If the owner is someone else, open `antigravity/<slice>` or post a PR review comment instead.
2. Record code review findings in `.spec/AUDIT_VERDICT.json` and post PR review comments with structured verdicts (`CLEAN` or `NEEDS CHANGES`).
3. Never commit or push directly to `main`.
4. Complete slices using `node .harness/scripts/finish-slice.mjs "<msg>"` so Neutral Referee trailers are attached. Run `node .harness/scripts/pr-scope-check.mjs` before PR merges.
5. Do not start a new slice while origin has the tag `harness-main-red` (`git ls-remote --tags origin harness-main-red` prints a line). Fixing main is the only work until it is gone. If repeated build/test failures trigger the 2-strike circuit breaker, restore files with `node .harness/hooks/pre-tool-guard.mjs --restore`.
6. Never merge a PR with a red or missing check.
7. Queue baton-pass updates via `HARNESS_ACTOR=antigravity node .harness/scripts/status-batch.mjs append baton_pass "<summary>"`, and when asked to brief the operator (`"brief me"`), consolidate `node .harness/scripts/status-batch.mjs digest` in plain English using a lightweight Flash/Flash-Lite agent and run `node .harness/scripts/status-batch.mjs clear`.
<!-- <<< harness <<< -->
