# Task Progress & Single-Slice Work Lock

> Rule: Mark only ONE task line at a time with the active work tag.

- [x] **Slice 1** `[CORE / DATA]`: Install harness v2.1.0 engine and `.spec/` scaffolding — Target files: `.claude/`, `.harness/`, `.spec/`, `CLAUDE.md`
- [x] **Slice 1.1: Record harness v3.2.0 sync in overview** [UI / VISUAL] On-the-fly: Operator chose ad hoc slice on PR 29 gate decision Target files: .spec/OVERVIEW.md | Issue: #30 | Verify: npm run typecheck --silent && npm run lint --silent
- [x] **Slice 2** `[CORE / DATA]`: Centralize status colors in STATUS_META and guard the accent list against drift — Target files: `src/lib/statusMeta.ts`, `src/lib/formatHelpers.ts`, `src/components/HeaderActionPanel.tsx`, `src/lib/__tests__/designTokens.test.ts` | Verify: npm run lint --silent && npx vitest run --reporter=dot
- [x] **Slice 3** `[UI / VISUAL]`: Write the design system export doc and link it from the docs — Target files: `docs/DESIGN_SYSTEM.md`, `AGENTS.md`, `PRD.md`, `package.json` | Verify: npm run lint --silent
- [x] **Slice 4** `[UI / VISUAL]`: Bump version to 0.9.2 for the design system export — Target files: `package.json` | Verify: npm run lint --silent
- [x] **Slice 4.1: Sync design-system kit and Tier 3 Hydrogen updates** Target files: .harness/managed.json, package.json
- [x] **Slice 4.1: Sync design-system kit and Tier 3 Hydrogen updates** Target files: .agents/, .harness/, AGENTS.md, plugins/harness/, package.json
- [ ] **Slice 5: Align with Harness UI v2 design system, neon-cyan accent, dark-mode contrast, modals, and Plain voice** [IN_PROGRESS] `[UI / VISUAL]` Target files: `design-system/`, `docs/DESIGN_SYSTEM.md`, `AGENTS.md`, `PRD.md`, `package.json`, `index.html`, `public/favicon.svg`, `src/` | Verify: npm run typecheck --silent && npm run lint --silent && npx vitest run --reporter=dot
