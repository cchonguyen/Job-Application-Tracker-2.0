# Architecture Decision Records (ADRs)

- **ADR-001 (2026-10-15):** Every ingest is a point-in-time snapshot of the job description. Re-ingesting a reposted or similar job adds a new row and never overwrites the existing one.
- **ADR-002 (2026-10-16):** Duplicate warning flags the same posting URL or any role at the same company; the same title at a different company is never flagged.
- **ADR-003 (2026-10-17):** Multi-user accounts use Supabase Auth with Google-only sign-in and open sign-ups.
- **ADR-004 (2026-10-20):** Production hosting moved to Cloudflare Workers; Render stays as a fallback until retired.
- **ADR-005 (2026-10-27):** Adopted the claude-harness-hub v2.1.0 harness (hooks, commands, subagents, `.spec/`). `AGENTS.md` stays the source of repo working rules; `CLAUDE.md` imports both.
