# Custom Agent Instructions

Whenever changes are made to the database schema or status definitions within the application:
1. Ensure the PostgreSQL schema under `supabase/schema.sql` is updated to remain fully in sync.
2. Provide explicit SQL migration instructions so modifications can easily be applied to the active production Supabase database.

## Versioning

Every pull request must bump `version` in `package.json` (enforced by the `Version bump` GitHub check):
- **MINOR** (`0.2.0` → `0.3.0`) for new features or behavior changes.
- **PATCH** (`0.2.0` → `0.2.1`) for fixes, refactors, docs, and chores.

If another PR merges first with the same number, rebase or merge `main` and bump again so each deploy carries a distinct version. The version and the deployed commit are shown at the bottom of the Settings menu (gear icon), so a successful deploy is visible at a glance.
