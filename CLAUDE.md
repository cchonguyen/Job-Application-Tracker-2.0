# Project Context & Harness Dispatcher

@AGENTS.md
@.claude/harness-rules.md

Project rules in `AGENTS.md` (docs, schema, versioning) win over harness rules where they differ.

## Work Mode
- No `[IN_PROGRESS]` line in `.spec/PROGRESS.md` = **Vibe Mode**: edit requested files directly, no `/triage` or `/spec` needed.
- One `[IN_PROGRESS]` line = **Slice Mode**: strict single-task lock on that slice's target files.

## Project-Specific Commands
Run the quick check once per turn, after the final edit.
- Typecheck / Lint: `npm run lint --silent` (runs `tsc --noEmit`)
- Unit Tests: `npx vitest run --reporter=dot`
