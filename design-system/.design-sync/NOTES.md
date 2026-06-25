# design-sync notes — @gtm-ide/design-system

## What this package is
A **net-new extraction**, not the product itself. The GTM IDE app (`ui/`) has no
component library — its look lives in a ~9.6k-line bespoke `ui/src/index.css`
(tokens + hand-written `.gtm-node`/`.stage-node`/etc. classes) plus two stock
shadcn primitives. This package lifts the **token foundation** (`ui/src/index.css:11-92`)
and rebuilds the genuinely-reusable atoms + composites as clean components so the
look can be synced to Claude Design. The product UI was **not** modified.

## Build
- From `design-system/`: `npm run build` (tsup → `dist/index.js` ESM + `dist/index.d.ts`).
- Converter entry: `./dist/index.js`; `--node-modules ./node_modules` (react resolves there).
- `dist/` and `node_modules/` are gitignored — a fresh clone must `npm install` then
  `npm run build` before running the converter.

## Fonts
- Geist + Geist Mono ship self-hosted via `cfg.extraFonts` →
  `node_modules/@fontsource-variable/{geist,geist-mono}/wght.css` (the converter copies
  the referenced woff2 into `fonts/` and emits `@font-face`).
- **Do not** re-add `@import "@fontsource-variable/…"` to `styles.css` — a bare
  node_modules specifier does not resolve inside the bundle and trips
  `[CSS_IMPORT_MISSING]`. (That was the only build error; fixed via extraFonts.)
- `wght.css` ships all subsets (latin/latin-ext/cyrillic/greek/vietnamese) — a few
  hundred KB; acceptable.

## Component scoping
- 12 components synced. The 7 compound sub-parts (`CardHeader`/`CardTitle`/
  `CardDescription`/`CardContent`, `Brand`, `ToolbarDivider`, `ToolbarSpacer`) are
  excluded via `componentSrcMap: null` — they compose **inside** Card/Toolbar previews,
  not as standalone cards.
- `Toolbar` uses `cfg.overrides.Toolbar.cardMode: "column"` (full-width bar).
- No provider/wrapper needed — tokens sit on `:root` in `styles.css`.

## Known render warns
- None outstanding. (`CitationCard` floor-card `[RENDER_THIN]` was resolved by authoring
  its preview.)

## Re-sync risks
- **This DS does not track the product automatically.** It was hand-extracted from
  `ui/src/index.css`. If the product's tokens or component look shift, re-curate
  `styles.css` and the components here — a re-sync will not notice product drift.
- Playwright pins **chromium 1228** (cached at build time). A fresh machine needs that
  exact browser build for the render check, or pass `--render-sample`/install it.
- All 26 preview cells graded `good` on the absolute rubric (no Storybook reference).
  Grades carry forward via the uploaded `_ds_sync.json`.
