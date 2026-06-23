# Design direction — workflow-builder native

Decided 2026-06-22. Arc: Refinement (cross-layer). Scope: design system + the core
four surfaces (shell/toolbar, canvas/nodes, co-pilot dock, gate/detail panel). Lens:
**user-native for a vibe coder, value-prop forward.**

## The pick

Founder supplied two references: **Retool** and **ElevenLabs** workflow builders (via
Mobbin). Direction extracted from what they share:

- **Node = clean white card** — leading icon in a soft container, bold title, muted
  technical sub-label, header actions. Subtle 1px border, soft shadow. No dashboard
  top-bar stripe.
- **Monochrome + semantic-only color** — ink ramp (zinc) for everything; color reserved
  for meaning (green = healthy/success, amber = attention/the gate, red = failure).
  **Zero decorative purple.**
- **Dark = primary** — ink pill for the primary action (Run loop), like Deploy/Publish.
- **Near-white canvas, dot grid; restrained chrome; mono for technical identifiers.**

## What it claims

The look sells the value prop instead of decorating: the **mono refs** (`gtm-find`)
make the code-grounding legible; the **amber gate** makes the wall visible; the **clean
agent cards** read as real steps a vibe coder composes — it belongs next to their editor,
not in a marketing dashboard.

## System (tokens — `ui/src/index.css` `:root`)

- **Type:** Geist Variable (UI) + Geist Mono (refs, file paths, code) — the vibe-coder-
  native font (Vercel/v0). Replaced Inter (the named slop tell).
- **Color:** monochrome zinc ink ramp (`--ink` #18181b → `--faint` #a1a1aa); surfaces
  white/`#f4f4f5`/`#fafafa`; primary = ink; semantic `--proven` #16a34a, `--gap` #d97706,
  `--danger` #dc2626; one restrained `--link` #2563eb. All decorative purple removed
  (55 rgba tints + ~25 hexes converted to ink).
- **Radius/elevation/motion:** `--r-sm..xl`, `--shadow-card`/`--shadow-pop`, `--ease`.

## Surfaces redesigned

- **Canvas/nodes** — reference-grade cards; icon tinted by kind (agent=ink, skill=amber,
  code=blue, gate=amber); ref in mono; ink selection ring; removed the empty MiniMap.
- **Shell/toolbar** — monochrome "Claude" status chip (was purple), dark Run-loop pill.
- **Co-pilot dock** + **detail/gate panel** — inherit the system; clean, monochrome.

## Not done (next pass — `polish.md`, separate run)

Edge styling refinement, the empty/loading/error states audited per surface, the
channels-home and simulation drawer (inherit the system but not bespoke), motion pass.
