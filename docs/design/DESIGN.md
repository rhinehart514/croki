# GTM IDE — design system record

The living index of the codebase's design system, extracted from the real code
(`ui/src/index.css`, `ui/src/styles/*`). Refreshed as the system accretes, not rewritten.
Last refreshed: 2026-06-27.

## The register

GTM IDE is an **operating tool, not a marketing site**: a clean light canvas, monochrome
ink, semantic color for meaning only, restrained motion that shows causality (evidence flows
into nodes, decisions pause at gates). "Calm GTM Control Room." The dark element is the
*primary button* (ink pill, white text), not the theme. Font: **Geist** (sans) + **Geist Mono**
(code-like identifiers). The spine — "vibe up to the gate, never past it" — has a visual
correlate: the gate is sacred, marked in amber, never just another modal.

## Tokens (source of truth: `ui/src/index.css` `:root`)

Use the tokens, never raw hex. OKLCH ramp so steps are perceptually even.

- **Ink ramp** — `--ink` #18181b · `--ink-2` #3f3f46 · `--muted` #71717a · `--faint` #a1a1aa · `--ghost` #d4d4d8
- **Surfaces** — `--surface` #fff · `--surface-2` #f4f4f5 · `--canvas` #fafafa · `--line` #ececec · `--line-2` #e4e4e7 · `--panel` (translucent)
- **Primary** — `--primary` ink · `--on-primary` white · `--link` #2563eb (the one restrained blue)
- **Semantic — color for MEANING only (status dots, edge pills, gates):**
  - `--proven` #16a34a (+`-soft`) — cited/ready/safe; in capabilities = **runs free (read)**
  - `--gap` #d97706 (+`-soft`) — needs attention; **the gate owns amber** (see `library-palette.css`); in capabilities = **behind the gate (write)**
  - `--danger` #dc2626 (+`-soft`) — error/reject/untrusted
  - `--blind` #a1a1aa — no signal (honest "we can't see it" state)
- **Type scale** — `--text-xs` 11px … `--text-2xl` 26px (Geist, ~1.22 modular)
- **Spacing** — `--space-1` 4px … `--space-12` 48px (4px base, one rhythm)
- **Radius** — `--r-sm` 6 · `--r-md` 9 · `--r-lg` 12 · `--r-xl` 16
- **Elevation** — `--shadow-card` (rests) · `--shadow-pop` (floats) · `--shadow-modal` (commands)
- **Motion** — `--ease`/`--ease-out` (~120–200ms hover/press), `--ease-spring` (entrances/lands only, soft overshoot), no bounce on interaction

A `[data-skin="glass"]` warm-glass skin exists (`--st-*` tokens) for the canvas register.

## Primitives & conventions

- **The one menu** (`ui/src/styles/menu.css`, `.menu`) — every dropdown routes through it,
  grounded in shadcn/ui. Monochrome; the trailing check is the only signature mark. Two skins:
  opaque (chrome) and `.menu-glass` (floats over the canvas).
- **The glass palette** (`ui/src/styles/library-palette.css`, `libp-`) — the summoned "+ Add
  step" surface; the canonical glass recipe (color-mix + backdrop-blur + hairline). Establishes
  the rule **"the gate owns amber"** (no decorative amber elsewhere).
- **Opaque content surfaces** — any panel you read or work in (the "+ Add step" library palette,
  node editors, pickers, modals with content) is **opaque**: `background: var(--surface)` + hairline
  border + soft shadow. NEVER the glass recipe (`backdrop-filter` blur + translucent fill) — over the
  busy canvas it bleeds through and kills legibility. The shadow floats it, not blur. Glass is only
  for tiny transient chrome you don't read against. (Founder-flagged 2026-06-27; the warm-calm glass
  aesthetic is for marketing surfaces, not this operating tool.)
- **Icons** — `lucide-react`. Hard ban: the **Sparkles** icon (use Lightbulb / neutral instead).
- **Brand glyphs** (`ui/src/lib/brandGlyph.ts` + `components/BrandGlyph.tsx`) — external service logos
  (Notion, Gmail…) for `mcp` nodes, from `simple-icons` resolved by server id. **Monochrome ink at
  rest** (holds the calm canvas), **brand-color on focus** (`brand` flag → the service's official hex);
  unknown service → `lucide` Plug fallback. A brand logo is never full-color at rest — color stays for
  meaning.
- **Semantic controls** — a button is `<button>`, a link `<a>`, an input `<input>`. Exception
  documented in code: React Flow canvas nodes (`GraphCanvas`, `ProgramCanvas`) use `div`+handler
  deliberately because they nest interactive controls, where a `<button>` wrapper is invalid HTML.

## Surfaces (per-surface specs live alongside this file)

- **Node cards** (`docs/design/node-cards.md`) — the canvas step cards. Carry external MCP capability
  logos (brand glyph + read/write lane signal: proven-green "Runs free" / gap-amber "Behind your
  gate"), the agent persona monogram, or the category icon. Clicking the empty canvas dismisses any
  open overlay (`onPaneClick` → host `dismissOverlays`). Built 2026-06-27.
- **Connect a capability** (`docs/design/connect-capability.md`) — "the wall": a connected MCP
  server's tools split by a vertical seam into Runs free (proven green) / Behind your gate (gap
  amber), unknown defaults gated. The product's safety story as layout. Built 2026-06-27.

## How this compounds

Promote inline values to tokens and consolidate duplicate primitives only by genuine need —
grow by use, never a speculative library. Refresh this record (extract from current code) when
a token or primitive is added or consolidated.
