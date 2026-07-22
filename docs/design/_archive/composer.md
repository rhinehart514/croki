# Composer — Aurora Canvas direction

> **ARCHIVED DESIGN RECEIPT.** This command composer is superseded. Current conversation and
> composer UX is governed by [FIRM-SPEC.md](../FIRM-SPEC.md), [STATE.md](../STATE.md), and the root
> [DESIGN.md](../../DESIGN.md).

Status: built into `ui/src/components/ComposerDock.tsx` + `ui/src/index.css`, verified
live on the vite dev server (2026-06-28). The surface is the command composer — the panel
where the founder asks Claude to build, run, and change the GTM system.

## The decision

Ten directions were explored in a live showcase (`~/design-showcase/composer/index.html`):
Warm Paper, Frosted Control Room, Command Line, The Orb, Floating Pill, Editorial Split,
Bordered Spectrum, Inline Thread, Glass Dock Tray, Aurora Canvas. The founder picked
**Aurora Canvas** (the showpiece), then set the palette: **black, white, and rainbow** — the
product reads monochrome and tech, and the rainbow is the *only* color.

The build honors that as a rule: the composer is strictly monochrome at rest (a faint
graphite haze drifts behind the frosted input, no hue), and the **rainbow is reserved for one
state — voice**. Engaging the mic erupts the same field into a full-spectrum conic ring +
bloom with a rising waveform; the mic fills solid black while listening. Color earns its
place by meaning; it is never resting decoration. This keeps the product's monochrome system
intact and satisfies "one rationed accent" — here the accent is a *state*, not chrome.

## The hand

- **Color:** product tokens only — ink send (`--ink`), green live dot (`--proven`), amber
  reserved for the gate (`--gap`), graphite rest-haze. The spectrum is a 9-stop conic gradient
  used solely in the `.composer-box.voice` state.
- **Type:** Geist + Geist Mono (the faces the product already ships via
  `@fontsource-variable/geist`), so the composer reads as the same product.
- **Signature:** the voice-mode rainbow, built bespoke — a registered `@property --composer-ang`
  rotates the conic gradient on the compositor (no JS per frame). The MOTION.md "signature
  canvas moment on an otherwise-restrained UI" pattern; no animation library added.
- **Motion:** the global `prefers-reduced-motion` block (end of `index.css`) freezes every
  animation here, including the spectrum spin.

## What's wired

- `.composer-aurora` — monochrome graphite drift at rest; swells into rotating spectrum on voice.
- `.composer-box::after` — crisp spectrum ring (gradient border via mask), voice only.
- `.composer-wave` — 28-bar waveform, rises only while listening (Tolan register).
- `.composer-box-mic` — new mic button left of send; toggles the voice state and, where the
  browser supports it, dictates speech into the input via the Web Speech API (progressive
  enhancement — the visual mode stands alone when recognition is unavailable).

## Mobbin references (each cited for what it proves)

- Claude web composer — https://mobbin.com/screens/16cc5d91-2f00-4a92-9777-6dd57a63a6a4 — the
  canonical "+ menu, model pill, monochrome card" anatomy this composer keeps.
- Langdock — https://mobbin.com/screens/b66870ae-8d47-493d-b1b6-e6c01173ad96 — attachment chip +
  control-row density pole.
- ChatGPT — https://mobbin.com/screens/8c1a4963-55d8-4604-8bda-317c96ef83b3 — the minimal
  black-pill / circular-send pole.
- Tolan voice — https://mobbin.com/screens/f46de34a-05c9-4fd5-b28e-7b5775830c89 — glowing token +
  full-spectrum waveform; the closest shipped antecedent to the rainbow eruption.
- Meta AI voice — https://mobbin.com/screens/6474d2b9-3803-4bd3-90ee-143cf9dda044 — gradient ring
  voice state (calmer pole).
- Lindy / Replit — https://mobbin.com/screens/9f4affd5-f387-4149-860e-95c83f9bbba5 ,
  https://mobbin.com/screens/cf76137b-1033-4582-b6d5-0a28e4c0dfb5 — step receipts above a flush
  reply input, the register the existing dock already uses.

## Libraries pulled

None. The eruption is pure CSS (conic-gradient on a registered `@property`), per MOTION.md's
"product UIs move on Motion-or-CSS; the expensive hero moment is bespoke, not a 3D engine."

## Proof / follow-ups

- Verified live: rest state reads clean monochrome; the mic erupts the full spectrum + waveform
  and fills black. Screenshotted on the vite dev server against the real rodent-radar project.
- Open: the production build (`npm run build`) is currently red on **pre-existing** type errors
  in `App.tsx` / `ProgramCanvas.tsx` (the `people` / `mode` props from the in-progress
  object-model canvas work) — unrelated to this change. The built bundle on :4317 won't reflect
  the composer until those are resolved and the UI is rebuilt.
- Tune candidate: the voice bloom bleeds upward into the conversation; dial blur/opacity if it
  reads as too much over the transcript.
