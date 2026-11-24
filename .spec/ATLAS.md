# Context Atlas

## Sector 000 Card Catalog
- `000` [CLAUDE.md](CLAUDE.md) — 5-line pointer
- `010` [AGENTS.md](AGENTS.md) — Agent working rules
- `020` [.spec/ATLAS.md](.spec/ATLAS.md) — This sector table

## Sector 100 Work Dispatch
- `110` [.spec/PROGRESS.md](.spec/PROGRESS.md) — Active slice queue and lock

## Sector 200 Spec Files
- `210` [.spec/OVERVIEW.md](.spec/OVERVIEW.md) — Plain-English overview
- `220` [.spec/SYSTEM_SPEC.md](.spec/SYSTEM_SPEC.md) — System spec
- `230` [.spec/DECISIONS.md](.spec/DECISIONS.md) — Decisions log
- `240` [.spec/SCOUT.md](.spec/SCOUT.md) — Triage metrics
- `250` [.spec/SESSION_HANDOFF.md](.spec/SESSION_HANDOFF.md) — Platform handoff
- `260` [.spec/EXTERNAL_AGENT_RULES.md](.spec/EXTERNAL_AGENT_RULES.md) — External agent contract
- `270` [.spec/AI_STUDIO_RULES.md](.spec/AI_STUDIO_RULES.md) — Alias to 260
- `280` [.spec/STATUS_BATCH.jsonl](.spec/STATUS_BATCH.jsonl) — Telemetry batch
- `290` [.spec/.vibe-checkpoint.json](.spec/.vibe-checkpoint.json) — Vibe checkpoint
- `295` [.spec/.session-telemetry.json](.spec/.session-telemetry.json) — Session telemetry
- `298` [.spec/.events](.spec/.events) — Event logs

## Sector 300 App Code
- `310` [src/components](src/components) — React components
- `320` [src/lib](src/lib) — Shared logic and utilities
- `330` [src/hooks](src/hooks) — React hooks
- `340` [server/routes](server/routes) — API routes
- `350` [server/middleware](server/middleware) — Server middleware
- `360` [server/services/parsing](server/services/parsing) — Email parsing
- `370` [server/services/company](server/services/company) — Company lookup
- `380` [apps-script](apps-script) — Gmail bridge script
- `390` [supabase](supabase) — Database schema

## Sector 400 Docs
- `410` [docs](docs) — Setup, migrations, design system
