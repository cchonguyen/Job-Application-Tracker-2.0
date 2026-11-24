# Architecture Decision Records (ADRs)

- **ADR-001 (2026-10-15):** Every ingest is a point-in-time snapshot of the job description. Re-ingesting a reposted or similar job adds a new row and never overwrites the existing one.
- **ADR-002 (2026-10-16):** Duplicate warning flags the same posting URL or any role at the same company; the same title at a different company is never flagged.
- **ADR-003 (2026-10-17):** Multi-user accounts use Supabase Auth with Google-only sign-in and open sign-ups.
- **ADR-004 (2026-10-20):** Production hosting moved to Cloudflare Workers; Render stays as a fallback until retired.
- **ADR-005 (2026-10-27):** Adopted the claude-harness-hub v2.1.0 harness (hooks, commands, subagents, `.spec/`). `AGENTS.md` stays the source of repo working rules; `CLAUDE.md` imports both.
- **ADR-006 (2026-11-02):** Exception to ADR-001: when an ingest could not read the posting and saved a **Needs review** stub, a later complete capture of the same canonical link (usually the bookmarklet) updates that stub in place. User-owned fields (status, dates, notes, status history) are kept. Complete snapshots stay immutable. Design: `docs/solutions/expanded-multi-portal-scanning.md`.
- **ADR-007 (2026-11-02):** The daily `EXTRACTION_DAILY_LIMIT` counts only steps that call Gemini. ATS-API, Schema.org fast-path and bot-wall fallbacks are free, and past the limit jobs are still saved without Gemini.
- **ADR-008 (2026-11-03):** Gmail status suggestions are a personal, owner-only feature, read through an Apps Script bridge the owner deploys (no Gmail token in the tracker). Suggestions are applied only after the user confirms each one.
