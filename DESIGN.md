# DESIGN.md — Drover token rationing doctrine

The visual system that keeps Drover off the generic-AI-wrapper mean. Tokens live in
`ui/src/index.css` (`:root`). This file is the *rationing doctrine* — the rules for when each
token is allowed — so the system stays a system instead of drifting back to decoration. The
anti-generic critic (`design-critic`) grades the running surface against this file.

The lens: a workflow-builder IDE in the Retool / ElevenLabs / Linear register. Clean light
canvas, monochrome ink, color earns its place by carrying meaning. Geist (vibe-coder-native,
Vercel/v0). Dark is the primary action, not a theme.

## Color is rationed, not decorated

- **Ink is the default.** Text, icons, the primary button, the `agent` kind — all draw from the
  monochrome zinc ramp (`--ink` → `--ink-2` → `--muted` → `--faint` → `--ghost`). If something
  is just "a thing on screen," it is ink, never a hue.
- **Blue (`--link`) is interactive-only.** A link, an fx-style affordance, a focused field.
  Never a heading color, never a decorative accent, never a fill for something you can't click.
- **Semantic hues carry status and nothing else.** `--proven` (green = healthy/success),
  `--gap` (amber = waiting/attention), `--danger` (red = failure), `--blind` (gray = no signal).
  These appear on status dots, edge pills, gate badges, node health — places where the color
  *is* the information. A semantic hue used for mood is a bug.
- **No decorative purple, no gradient candy.** The one allowed ambient gradient is the app-shell
  wash; everything else is flat surface + hairline.
- All color is OKLCH so the ramp steps are perceptually even and any derived/dark variant stays
  honest. Values match the prior zinc/Tailwind hexes 1:1 — OKLCH is the format, not a recolor.

## Type is a scale, not ad-hoc px

Use the `--text-*` ramp (`xs 11` · `sm 13` · `base 14` · `md 16` · `lg 17` · `xl 21` · `2xl 26`),
never a raw font-size. Body is `--text-base`. Labels/secondary are `--text-sm`. Meta and badges
are `--text-xs`. Card titles `--text-lg`, section headers `--text-xl`, the page title `--text-2xl`.
Large text takes `--tracking-tight`; line-height is `--leading-tight` for headings, `--leading-normal`
for body. Weight does the emphasis work before size does — prefer 500/600 over jumping a step.

## Spacing is one rhythm

Use the `--space-*` ramp (4px base: `1 4` · `2 8` · `3 12` · `4 16` · `5 20` · `6 24` · `8 32` ·
`12 48`), never a raw px gap or pad. One rhythm across every panel keeps density legible. When two
gaps want to be "about the same," they must be the *same* token.

## Elevation is a register with meaning

Each level is a statement about how far a surface floats:

- `--shadow-xs` / `--shadow-sm` — inline chips, hover lift. Barely off the page.
- `--shadow-card` — a node card, a panel at rest. The default resting elevation.
- `--shadow-pop` — a popover, a menu, the approvals panel. Floats above the canvas.
- `--shadow-modal` — a modal that commands the screen. Highest, used sparingly.

Prefer **bands and hairlines over stacked cards.** A card inside a card inside a card is the
generic-dashboard tell. Group with a hairline (`--line` / `--line-2`) and whitespace first; reach
for `--shadow-card` only when a thing genuinely lifts off the surface.

## Motion is restraint

`--ease` / `--ease-out` with `--dur-fast` (120ms) for state flips and `--dur-base` (200ms) for
enter/exit. Motion clarifies a change; it never decorates. No looping ambient animation.

## Crew identity is one character system

`CrewFace` is the only teammate portrait door. It renders the deterministic illustrated `CrewAvatar`
generated from the teammate's stable ref, so one teammate keeps the same recognizable face in the canvas,
left rail, conversation, crew room, creation flow, and profile. Initials are a render-failure fallback only,
never an alternate compact style. Family tint identifies the teammate's working family without turning the
character into decorative color. Working motion stays subtle, transform-only, and disabled for reduced
motion.

## The substitutability test

Before shipping a surface: would it be mistaken for any other AI tool? If yes, it fails. The
escape is specificity — the GTM node diagram, the founder gate as a real wall, the cited grounding
— rendered with this system's restraint, not a generic card grid in someone else's blue.

---
Last updated 2026-07-10 alongside the terrain-first and persistent crew-character pass. When the token
layer in `ui/src/index.css` changes, update this doctrine in the same breath. Tokens without rationing
drift.
