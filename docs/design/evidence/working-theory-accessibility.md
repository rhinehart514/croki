# Working-theory accessibility receipt

**Date:** 2026-07-15  
**Primary viewport:** 1920×1080  
**Command:** `npm run test:atlas:a11y-browser`

## Automated gate

- 3/3 deterministic browser journeys pass.
- Axe reports zero critical violations on the venture picker, working-theory Orbit, correction composer,
  Dive, returned Orbit, and exact consequence inspector.
- Keyboard order is chrome direction control → provisional theory subjects → exact work. Canvas edges are
  inert and every canvas object has one focus owner.
- Enter unfolds exact work; the named nested action enters Dive; the held consequence opens only through
  its named action. Escape closes one layer at a time.
- The consequence inspector focuses its first action, wraps Tab and Shift+Tab, restores the exact trigger,
  and returning from Dive restores the originating work.
- Reduced motion settles immediately in Orbit, correction, Dive, and consequence contexts.

## Manual contract checks encoded by the journey

- Focus visibility: every traversed target has a visible focus indicator.
- Contrast: amber body text uses `#72510f`, measuring 7.12:1 on `#fffdf8` and 6.43:1 on `#f5f1e8`.
- Non-color meaning: provisional theory is dashed and labeled `Provisional`; exact work carries its document
  treatment and label; evidence is named and icon-backed; a held consequence uses the shield icon plus
  `Needs your hand`.
- No pointer-only or keyboard dead-end path remains in the required journey.

This receipt proves the deterministic ship gate. It is not outside-founder proof.
