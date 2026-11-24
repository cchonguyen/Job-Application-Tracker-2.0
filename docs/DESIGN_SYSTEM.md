# Design System

The visual language and product voice of Job Application Tracker, written so a new app built with Claude Code can adopt them without reading this repo's code.

**How to use this file in a new app**
1. Copy this file into the new repo as `docs/DESIGN_SYSTEM.md`.
2. Add one line to the new repo's `CLAUDE.md` (or `AGENTS.md`): `UI work follows docs/DESIGN_SYSTEM.md. Read it before building or changing any screen.`
3. Copy the token files listed in [9. Starter kit](#9-starter-kit) so the theme works on day one.
4. Keep the "Philosophy" and "Voice" sections. Replace the product-specific examples (statuses, job fields) with the new app's own.

In this repo, `design-system/profile.md` declares the project's Harness UI profile (following `.harness/design-system/README.md`, `voice.md`, and `principles.md`; `tokens.css` and `bundle.css` are never edited directly) and the code in `src/index.css`, `src/lib/theme.ts`, and `src/lib/statusMeta.ts` is the source of truth for values. A test (`src/lib/__tests__/designTokens.test.ts`) fails when the status colors or accent palettes drift apart, and this file is updated in the same PR as any change to them.

---

## 1. Philosophy

The app is a quiet, dense work tool. It should feel like a well-kept spreadsheet that happens to be pleasant, not a marketing site.

| Principle | What it means on screen |
|---|---|
| **Calm by default** | Neutral slate surfaces carry almost everything. Color is reserved for meaning (status, accent, warnings), so it stays legible. |
| **Dense, not cramped** | Small type (`text-xs`) and tight spacing fit a whole pipeline on one screen. Generous radius and soft borders keep it from feeling crowded. |
| **One accent, chosen by the user** | Interactive elements share a single accent hue. The user can switch it (five options, defaulting to `cyan`); the app never hard-codes a brand color into a component. |
| **Meaning never depends on the accent** | Status and warning colors come from fixed hues outside the accent scale, so "Interviewing" looks the same under every accent and in both modes. |
| **Color is never the only signal** | Every status pairs a hue with an icon and a text label. |
| **Honest data** | The UI shows what is known and marks what is not. Missing values read `Unknown` or `Not listed`; nothing is filled with plausible defaults. |
| **Flag, don't block** | Risky actions (duplicates, incomplete captures) get a visible warning and a choice. The app does not refuse the user. |
| **Fewer steps** | One click or one paste is the target for any capture flow. Typing is a fallback. |

---

## 2. Stack assumptions

- **React** with **Tailwind CSS v4** utility classes, written inline in components. No component library.
- **lucide-react** for every icon.
- Theme tokens are CSS variables in `src/index.css`. Components use stock Tailwind color names; the variables remap them (see 3.2).
- Default font stack is Tailwind's system sans (`font-sans`). There is no web font. `font-mono` is used for URLs, IDs and code snippets.

A new app on another stack keeps the tokens and rules and translates the class names.

---

## 3. Color

### 3.1 Neutrals (slate)

Slate is the whole interface: backgrounds, borders, text. Common roles:

| Role | Light mode class | Notes |
|---|---|---|
| Page background | `bg-slate-50` | |
| Card / panel / modal surface | `bg-white` | Remapped to a dark surface in dark mode |
| Sunken surface, hover row | `bg-slate-100` | |
| Hairline border | `border-slate-200` | Default border for cards and inputs |
| Strong border | `border-slate-300` | Inputs and secondary buttons |
| Primary text | `text-slate-900` / `text-slate-800` | Titles, values |
| Body text | `text-slate-700` / `text-slate-600` | |
| Secondary text, labels | `text-slate-500` | |
| Placeholder, disabled, meta | `text-slate-400` | |
| Modal overlay | `.jat-scrim` + `backdrop-blur-xs` + `overflow-y-auto` | `--jat-scrim`: `rgba(24, 24, 27, 0.42)` light, `rgba(6, 6, 9, 0.68)` dark |
| Toast / tooltip surface | `.jat-tooltip` | `--jat-tooltip-bg: #18181b`, `--jat-tooltip-text: #ececf1` |

### 3.2 Accent (user-selectable)

Components always write `indigo-*` for accent color. `src/index.css` redefines the `--color-indigo-50` to `--color-indigo-950` variables per `data-accent` attribute on `<html>`, so `bg-indigo-600` becomes cyan (default), emerald, amber, rose, or indigo when the user picks one. Nothing else in the UI may use `indigo-*` for a non-accent meaning.

| Accent | id | 600 step (primary) |
|---|---|---|
| Cyan (`neon-cyan`, default) | `cyan` | `oklch(50.3% 0.095 210.8)` (`#0b7285` light / `#4fd8eb` dark) |
| Emerald | `emerald` | `oklch(59.6% 0.145 163.225)` |
| Amber | `amber` | `oklch(66.6% 0.179 58.318)` |
| Rose | `rose` | `oklch(58.6% 0.253 17.585)` |
| Indigo | `indigo` | `oklch(51.1% 0.262 276.966)` |

Each accent is a full 11-step scale (50 to 950) taken from the matching palette. Accent roles:

| Role | Class |
|---|---|
| Primary button fill | `bg-indigo-600 hover:bg-indigo-700` |
| Active switch / toggle track | `peer-checked:bg-indigo-600` (never green/good) |
| Links, active icons, selected text | `text-indigo-600` (`text-indigo-700` on tinted backgrounds) |
| Tinted chip / selected row | `bg-indigo-50 border-indigo-200 text-indigo-700` |
| Focus ring | `focus:ring-2 focus:ring-indigo-500` |
| Progress fill | `bg-indigo-600` |

### 3.3 Dark mode

Dark mode is a remap, not a second set of classes. `src/lib/theme.ts` and the pre-paint script in `index.html` resolve `system` via `prefers-color-scheme` and keep both `data-mode` and `data-theme` synced on `<html>` (`light` or `dark`, defaulting to `light`), alongside `data-accent`. With `data-mode="dark"` on `<html>`:

- The slate scale is inverted (`slate-50` becomes the darkest surface, `slate-900` the lightest text), all on a cool blue-gray hue (oklch hue about 255 to 265).
- `--color-white` becomes a dark surface (`oklch(22% 0.03 265)`), so `bg-white` cards stay cards.
- Pastel tint steps (`50` to `300`) are inverted for dark mode (`color-mix` in oklch for `indigo-*`, and dedicated dark surface/border oklch steps for status and semantic hues `amber`, `orange`, `blue`, `purple`, `emerald`, `rose`, `teal`, `stone`, `sky`), leaving `500`/`600`/`700`+ solid fills untouched.
- Dark-mode ink rules remap `.text-*-700`, `.text-*-800`, and `.text-*-900` (and light-on-dark `.text-*-100`/`200` where used) to maintain `>=4.5:1` contrast against dark tints.
- `text-white` is forced back to pure white so text on accent buttons and badges keeps contrast.
- `color-scheme: dark` is set so native controls and scrollbars follow.
- Theme changes fade background and text color over 160 ms.

Components therefore write light-mode classes only. A component needing a dark-specific tweak gets a named class (for example `.analytics-card`) with a `[data-mode="dark"]` rule in `src/index.css`, never a `dark:` variant scattered across markup.

### 3.4 Status colors

Pipeline statuses use fixed hues, defined once in `src/lib/statusMeta.ts` (`STATUS_META`). Every status surface reads from it.

| Status | Hue | Icon (lucide) | Badge | Icon tint | Dot / card border |
|---|---|---|---|---|---|
| Saved | slate | `Bookmark` | `bg-slate-100 text-slate-700 border-slate-200` | `slate-500` | `slate-400` |
| Applied | amber | `Send` | `bg-amber-50 text-amber-800 border-amber-300` | `amber-500` | `amber-500` |
| Interviewing | blue | `Calendar` | `bg-blue-50 text-blue-700 border-blue-200` | `blue-600` | `blue-600` |
| Offer | purple | `Award` | `bg-purple-50 text-purple-700 border-purple-200` | `purple-600` | `purple-600` |
| Accepted | teal | `CheckCircle2` | `bg-teal-50 text-teal-700 border-teal-200` | `teal-600` | `teal-500` |
| Rejected | rose | `XCircle` | `bg-rose-50 text-rose-700 border-rose-200` | `rose-600` | `rose-500` |
| Declined | stone | `Ban` | `bg-stone-100 text-stone-700 border-stone-200` | `stone-600` | `stone-500` |

Rules:
- One hue per status across badge, icon, menu chip and dot. `STATUS_META` also carries a `borderAccent` class for a 4 px card left border; no screen uses it yet.
- Status hues never use `indigo-*` (it is the accent).
- Order of importance (used for sorting and grouping): Accepted, Offer, Interviewing, Applied, Saved, Rejected, Declined. Closed statuses (Rejected, Declined) are hidden by default.

A new app maps its own states the same way: pick hues outside the accent, give each an icon, keep closed or negative states muted (stone, rose).

### 3.5 Semantic colors

| Meaning | Hue | Example |
|---|---|---|
| Warning, needs review | amber | `bg-amber-100 text-amber-800` pill for **Needs review** |
| Success, positive numbers | emerald | `text-emerald-600` |
| Danger, destructive actions, errors | rose | `text-rose-600`, `bg-rose-50` |
| Work arrangement | Remote uses the accent tint, Hybrid amber, Onsite slate | `bg-indigo-50 text-indigo-700 border-indigo-200/70` |

---

## 4. Typography

| Token | Class | Use |
|---|---|---|
| Base UI text | `text-xs` (12 px) | The default for almost everything: table cells, buttons, inputs, menus |
| Comfortable text | `text-sm` (14 px) | Modal body copy, descriptions |
| Eyebrow label | `text-[11px] font-semibold uppercase tracking-wider text-slate-500` | Field labels above values, section labels |
| Micro tag | `text-[10px] font-semibold` | Dense tags inside rows |
| Section / modal title | `text-base` to `text-lg`, `font-bold` | |
| Hero number | `text-2xl` to `text-3xl`, `font-bold tracking-tight` | Analytics figures only |
| Monospace | `font-mono` | URLs, IDs, code |

Weights: `font-semibold` is the default emphasis, `font-bold` for titles and values, `font-medium` for quiet emphasis. `font-extrabold` is reserved for the few hero figures; avoid `font-black`.

---

## 5. Space, shape, depth, motion

**Spacing.** Tight 4 px rhythm. Gaps are `gap-1.5` or `gap-2` inside controls and `gap-3` between groups. Controls use `px-3 py-1.5` (compact) or `px-4 py-2` (primary). Panels use `p-3` to `p-4`; modals `p-5` to `p-6`.

**Radius.**

| Element | Class |
|---|---|
| Inputs, buttons, menus, small cards | `rounded-lg` |
| Cards, panels, callouts | `rounded-xl` |
| Modals and dialogs | `rounded-t-2xl sm:rounded-2xl` (mobile bottom sheet on phones; `JobDetailModal` uses `rounded-t-3xl sm:rounded-2xl`) |
| Pills, dots, avatars, progress bars | `rounded-full` |

**Elevation.** Mostly flat. Borders separate surfaces before shadows do.
- Resting cards and controls: `shadow-2xs` or `shadow-xs`.
- Popovers and dropdowns: `shadow-lg` to `shadow-xl`.
- Modals: `shadow-2xl`.

**Motion.** Short and functional.
- Hover and color changes: `transition-colors` (or `transition-all`) at the default 150 ms.
- Modals and menus enter with CSS entrance animations in `src/index.css` (`.animate-in`, `.fade-in`, `.zoom-in-95`, `.slide-in-from-top-*`, `.slide-in-from-bottom-*` backed by `@keyframes jat-enter`). Under `@media (prefers-reduced-motion: reduce)`, `.animate-in` animations are disabled.
- Loading: a lucide `Loader2` with `animate-spin`. No skeleton shimmer.

**Icons.** lucide-react only, stroke style. `w-3.5 h-3.5` inside `text-xs` controls, `w-4 h-4` standalone, `w-5 h-5` in headers. Icons inherit text color unless they carry a status tint.

**App icon.** A rounded square (radius 7 of 32) filled with the default accent `#0b7285` (`cyan`), holding a white lucide-style briefcase with a 2.5 stroke and round caps (`public/favicon.svg`). Browser `theme-color` is the same `#0b7285`.

---

## 6. Component patterns

Copy these class strings as the starting point. Swap layout classes freely; keep the color, radius, type and focus rules.

**Primary button**
`inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 cursor-pointer`

**Secondary button**
`px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer`

**Accent outline button (inline action)**
`px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer`

**Destructive action.** Secondary button shape with `text-rose-600 hover:bg-rose-50 border-rose-200`, always behind a confirm step.

**Text input**
`w-full px-3 py-1.5 text-xs bg-slate-50/60 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all`
Search inputs add a leading `w-3.5 h-3.5 text-slate-400` icon with `pl-9`.

**Field label + value**
Label: eyebrow token (4). Value: `text-xs font-semibold text-slate-800`. Missing value: `text-slate-400` reading `Unknown` or `Not listed`.

**Status badge**
`STATUS_META[status].badge` + `text-xs font-bold border rounded-lg px-2 py-1`, with the status icon in `iconClass` on the left. In menus, use `chipBg` behind each option and a `dot` (`w-2 h-2 rounded-full`) for compact pickers.

**Pill / tag**
`text-[10px] font-semibold px-2 py-0.5 rounded-full border` + a semantic tint (3.5).

**Card / row**
`bg-white border border-slate-200 rounded-xl shadow-2xs`. A card that represents a pipeline item shows its status with the status badge or dot. If a stronger cue is needed, use `border-l-4` + `STATUS_META[status].borderAccent`.

**Modal**
- Every dialog uses `src/components/Modal.tsx` for the scrim and dialog wrapper (`role="dialog"`, or `role="alertdialog"` for confirmations, `aria-modal`, `aria-labelledby`, backdrop click, z layer). Only the panel classes and content vary. `JobDetailModal` is a side drawer and keeps its own shell.
- Z-index scale: `z-40` for primary dialogs and the sticky header (header-triggered modals portal to `document.body` to escape header transform bounds); `z-50` for stacked confirmation dialogs (`DuplicateWarningModal`, `GoogleSheetsSyncModal` confirm), `PortalDropdown`, and `.jat-toast-container` (matching `--z-toast: 50`).
- Overlay: `fixed inset-0 z-40 overflow-y-auto flex items-end sm:items-center justify-center p-0 sm:p-4 jat-scrim backdrop-blur-xs animate-in fade-in duration-150` (`z-50` for stacked confirmations).
- Panel (set by `Modal`): `role="dialog"` (or `role="alertdialog"` for confirmations), `aria-modal="true"`, `aria-labelledby={headingId}`, `relative w-full max-w-xl bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] pb-[env(safe-area-inset-bottom)]` (`JobDetailModal` uses `rounded-t-3xl sm:rounded-2xl`).
- Header with heading (`id={headingId}`) and a close `<button type="button">` using Lucide `<X />` with an explicit `aria-label="Close ..."`; scrollable body; footer with secondary then primary button on the right.

**Toast**
- Positioned via `.jat-toast-container` in `src/index.css` (`position: fixed; right: 1.25rem; bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px)); z-index: 50;`), using `.jat-tooltip` for success toasts and `role="status" aria-live="polite"`.

**Warning callout**
`p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs`, used for duplicates and incomplete captures, always with a way forward ("save anyway" or "skip").

**Layout**
Full-width spreadsheet on desktop, stacked cards on mobile. `html, body, #root` clip horizontal overflow and use `min-height: 100dvh`. Every screen works at phone width.

---

## 7. Voice and content

The product voice uses `Plain` warmth per `.harness/design-system/voice.md` and `design-system/profile.md`: plain, specific, and honest, like a capable assistant handing you a filled-in form.

- **Say what happened, in the user's terms.** "Saved as a new row" beats "Operation completed".
- **Never pretend to know.** Show `Unknown` or `Not listed` and a **Needs review** badge instead of a guess. A confident wrong value is worse than an honest blank.
- **Warn, then let the user decide.** Duplicate and risk messages explain what matched and offer a choice. They never block.
- **Keep the user's data theirs.** Captured details are a snapshot; copy never implies the app will change them later.
- **Short, sentence-case labels.** Buttons and actions name what they do in sentence case (`Delete job`, `Sync now`, `Personal notes`), never "OK" or "Submit".
- **Destructive confirmations ask a question.** `Delete?` / `Delete this posting?`, followed by an explicit action (`Delete job`).
- **No exclamation marks, emoji, celebrations, or hype** in UI copy.

---

## 8. Accessibility rules

- Focus is always visible: `focus:outline-none` is only allowed together with `focus:ring-2 focus:ring-indigo-500`.
- Status and warnings carry an icon and a label, not color alone.
- Text on accent fills is pure white in both modes (enforced in `src/index.css`).
- `color-scheme` follows the mode, so native inputs, scrollbars and date pickers match.
- Touch targets in mobile layouts are at least `py-2` with full-row tap areas on cards.

---

## 9. Starter kit

Files a new app copies to get the same theme working:

| Copy from this repo | What it gives you |
|---|---|
| `src/index.css` | The five accent palettes, dark mode pastel/ink remap, `.jat-scrim`, `.jat-tooltip`, `.jat-toast-container`, entrance animations, white-text fix, and theme fade |
| `design-system/profile.md` | Harness UI profile declaring `neon-cyan` signature hue, light/dark/system modes, density, display font override, `Plain` voice, and state map |
| `src/lib/theme.ts` | Mode and accent types, the accent list with swatches, load/save/apply helpers (storage key `jat-theme`; rename it for the new app) |
| The inline `<script>` in `index.html` `<body>` | Applies the saved theme before first paint, so there is no flash of the wrong theme. Its accent list must match `THEME_ACCENTS` |
| `src/components/ThemeSelector.tsx` | Mode toggle and accent swatches for a settings menu |
| `src/lib/statusMeta.ts` | The pattern for state colors (replace the statuses with the new app's) |
| `src/lib/__tests__/designTokens.test.ts` | Drift guards for the above |

**Onboarding checklist for a new app**
1. Tailwind v4 and lucide-react installed.
2. Theme files copied; `data-mode`, `data-theme`, and `data-accent` set on `<html>` before first paint.
3. Components use `slate-*` for structure, `indigo-*` for accent only, and a `STATUS_META`-style map for every state color.
4. Base text is `text-xs`; labels use the eyebrow token.
5. Every interactive element has the indigo focus ring.
6. Missing data renders as `Unknown` / `Not listed`, never a placeholder value.
7. The new app's `CLAUDE.md` points at its copy of this file.

**Do not**
- Hard-code a hex or oklch color in a component (except the app icon and `theme-color`).
- Use `dark:` variants; extend the remap in `index.css` instead.
- Use the accent scale for status, warning or success meaning.
- Add a web font, a component library or a second icon set without updating this file first.
