# Job Application Tracker — Design System Profile

Project profile adopting Harness UI (`.harness/design-system/tokens.css`, `bundle.css`, `README.md`, `adopting.md`, `voice.md`, `principles.md`).

## Identity & Tokens

- **Signature hue:** `neon-cyan` (`cyan` default accent, `#0b7285` light / `#4fd8eb` dark, `oklch(50.3% 0.095 210.8)` at step 600). Moves off `indigo` per `adopting.md` so this app stays visually distinct from LiveArchive (`neon-violet`).
- **Secondary accent overrides:** The user theme picker retains `emerald`, `amber`, `rose`, and `indigo` as optional personal overrides.
- **Theme mode:** Light, dark, and system (`light`, `dark`, `system`), defaulting to `light` for continuity while resolving `system` via `prefers-color-scheme` and setting both `data-mode` and `data-theme` on `<html>`. No `theme-lock`.
- **Density:** `comfortable` (`body` / `14px`–`15px`) with `compact` spreadsheet cells (`32px`) for dense pipeline scanning.
- **Font display override:** Uses the system sans stack (`--font-sans`) rather than Newsreader for high-density spreadsheet/CRM utility.
- **Voice warmth:** `Plain` — capable, specific, honest, no exclamation marks or celebrations.

## App States (`src/lib/statusMeta.ts`)

Every status pill, badge, icon, and border accent reads from `STATUS_META` and `STATUS_ORDER`:

| Status | Label | Lucide Icon | Tone |
| --- | --- | --- | --- |
| `Accepted` | Accepted | `CheckCircle2` | `good` (`teal` — closed won) |
| `Offer` | Offer | `Award` | `purple` (milestone offer) |
| `Interviewing` | Interviewing | `Calendar` | `blue` (active progress) |
| `Applied` | Applied | `Send` | `amber` (active pending) |
| `Saved` | Saved | `Bookmark` | `neutral` (`slate` — bookmarked) |
| `Rejected` | Rejected | `XCircle` | `bad` (`rose` — closed lost) |
| `Declined` | Declined | `Ban` | `neutral` (`stone` — closed declined) |
