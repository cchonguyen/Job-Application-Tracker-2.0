# Task Progress & Single-Slice Work Lock

> Rule: Mark only ONE task line at a time with the active work tag.

- [x] **Slice 1** `[CORE / DATA]`: Install harness v2.1.0 engine and `.spec/` scaffolding — Target files: `.claude/`, `.harness/`, `.spec/`, `CLAUDE.md`
- [ ] **Slice 2** [IN_PROGRESS] `[CORE / DATA]`: Centralize status colors in STATUS_META and guard the accent list against drift | Target files: `src/lib/statusMeta.ts`, `src/lib/formatHelpers.ts`, `src/components/HeaderActionPanel.tsx`, `src/lib/__tests__/designTokens.test.ts` | Verify: npm run lint --silent && npx vitest run --reporter=dot
- [ ] **Slice 3** `[UI / VISUAL]`: Write the design system export doc and link it from the docs | Target files: `docs/DESIGN_SYSTEM.md`, `AGENTS.md`, `PRD.md`, `package.json` | Verify: npm run lint --silent
