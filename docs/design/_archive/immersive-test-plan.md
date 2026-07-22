# Drover Immersive Shell — Tester Checklist

> **Obsolete acceptance checklist — 2026-07-17.** The immersive shell is no longer approved product
> direction. These checks are historical regression evidence only and must not define release readiness.
> Remove or relocate this checklist after equivalent unified canvas/conversation coverage lands.

**Historical tester receipt.** Status keys: **✓** verified in the dated pass · **○** built, not then eyes-on · **⚠** known defect/gap · **◇** intentional divergence. To inspect the still-present historical immersive surface, run the browser harness and open `?shell=world`; the current default is Now and `?shell=legacy` opens the older triptych. Venture **Buffalo Projects** was the richest fixture; a fresh venture exercised the empty state. 1920×1080. This is not current acceptance doctrine.

**Drive-through verification 2026-07-16:** every item below was checked against a real render (a live browser over an isolated copy of the store at 1920×1080) and the deterministic `test/browser/immersive-shell-journey.mjs` (now green end-to-end, all 4 phases). Evidence: `docs/design/evidence/ade-run/verify-round1/*.png`. The two prior craft ⚠ (altimeter lag, descend kicker/header) are resolved; the polling-error ⚠ did not reproduce (all poll endpoints 200).

## 1 · Entry & venture switching
- ✓ Land → the venture list ("Continue a venture") shows every real venture with its product repo.
- ✓ Click a venture → you drop straight into its edge-to-edge world (no triptych rail/inspector frame anywhere).
- ⚠ *Intended but not built:* land directly in your last venture (the redesign wanted no picker step).
- ✓ Switch ventures; one venture fills the session (no cross-venture bleed). *(Buffalo → DenialShield loads entirely its own sigil, theory, teammate (Iris, not Mara/Sable), and gate — no bleed.)*

## 2 · The world & always-on chrome (the "I can see everything" bar)
- ✓ Venture sigil (name) top-left.
- ✓ Operating picture reads at a glance: `N live · N building · N returned`.
- ✓ `N need you` amber pulse top-right; amber is the ONLY saturated color for attention.
- ✓ The central hub shows the current working theory ("NOW DRIVING … a working theory").
- ✓ Nodes for every founder-facing object: efforts/approaches, channels, teammates (face + status), capabilities (Gmail etc. with connected/not-connected), the gate ("Needs your hand · N acts").
- ✓ Floating composer docked bottom-center (venture-specific placeholder, e.g. "What should change for …").
- ✓ Conversation pill bottom (latest line + count).
- ✓ Altimeter bottom-right (Orbit/Ground/Inside readout).
- ✓ Zoom/fit toolbar bottom-left.
- ✓ Color rationing holds: green = living/connected, amber = needs-you, everything else ink-on-paper.
- ✓ No permanent conversation column (ambient, not docked).

## 3 · Navigation & altitude
- ✓ Zoom in/out via the toolbar buttons; % updates.
- ○ Zoom via trackpad scroll / pinch (verify on real hardware).
- ✓ Fit-the-venture button reframes the whole atlas.
- ✓ Pan by dragging empty canvas.
- ✓ As you zoom in, cards re-detail (glyph → card → detail): titles, then draft chips + state + message preview + faces. (Full detail band seen at 137%.)
- ✓ Altimeter label tracks the node-detail band (reads INSIDE at 137% where cards show full anatomy — the prior lag ⚠ is resolved; band and altitude share the same zoom cutpoints).
- ✓ ⌘K → teleport palette opens; pick an object → the palette closes and the camera flies to it.
- ✓ Click a node → descend into it (see §5).
- ✓ Escape → rise back out of the descent.

## 4 · The signature moment — materialization
- ✓ Type a plain intent in the composer ("help this venture grow") → submit hits the real drive endpoint.
- ✓ A working theory blooms as nodes appear (visible-node count rises monotonically across frames, not one snap; a branch fork blooms a sibling the same way).
- ✓ New nodes read provisional (lighter/dashed) until work settles them solid.
- ✓ A checkpoint / first-theory card seals the bloom in the conversation ("FIRST THEORY — sealed a working theory").
- ✓ Acts that would touch the world surface at the gate needing your hand (amber "Needs your hand · N acts").

## 5 · Descend-in-place (the reading for each archetype)
- ✓ Click a node → world dims/blurs behind (still present, map not lost); the reading lifts forward (layoutId shared-element morph); ✕ + Escape rise.
- ✓ **Effort/approach** reading → full statement, state ("Blocked on your read"), and its **drafts named by content** (real draft text + code refs, e.g. `w/share/actions.ts#L19-25`), plus `ON IT · <teammate>` and the steer field (§7).
- ✓ **Teammate** reading → `TEAMMATE · CURRENT WORK`, name + Working state, "ON RIGHT NOW", and "You don't assign work — <name> claims a direction in the conversation and says why" (current work + claims, not a profile).
- ✓ **Capability** reading → `CAPABILITY`, name + connected/not-connected, what it reaches, and "anything it would send to the world still waits for your hand at the gate".
- ✓ **Campaign / channel** reading → the approach statement + its staged messages named by content (real draft copy, not a status number).
- ○ **Record** reading → built and routed (kind `outcome` → RecordReading), but the Buffalo/DenialShield fixtures count "1 returned" without surfacing it as a descendable node, so there was nothing to click this pass. *(Gap to note: returned records should materialize as nodes — see §9.)*
- ✓ Craft: the mono kicker names the real archetype ("NEEDS YOUR READ" / "THE GATE"), not a constant "VENTURE"; the header no longer duplicates the statement. *(Prior kicker/header ⚠ resolved.)*
- ✓ The reading **grows out of the clicked node** (true node→reading morph): the card springs from the node's on-screen position and settles centered. *(Verified numerically — a card clicked at node-center (971,193) mounts with transform offset (+11,−167)px = exactly node-center minus viewport-center, then springs to rest. The prior centered-modal ◇ is resolved.)*

## 6 · The gate / world-boundary
- ✓ Gate pulse → open it → descend into the **exact staged payload** (EXACT ACT / DESTINATION / CONSEQUENCE — the email as the recipient sees it / the spend / the diff).
- ✓ A **deploy** effect requires TWO acts: authorize-deploy, THEN release (Release stays disabled until authorized — invariant asserted).
- ✓ "Nothing needs you yet" reads as a thin clear edge (the pulse carries no amber count), not an alarm.
- ✓ Release/hold is **dialogue, not buttons** — a single words field ("Tell the firm — 'send it' or 'hold it'…"); code (not a model) reads the words into release / hold / authorize. Negation ("don't send", "not yet") reads as hold, never release; ambiguous input is refused with a nudge and fires nothing. *(Verified live: the field renders, buttons are gone, an ambiguous submit was refused with no decision; the deterministic parser is unit-tested — `gateWords.test.ts`, 5 cases green.)*
- ○ Releasing fires the real wall decision and it persists as a receipt. *(Verified up to the release control + the deterministic mapping; the actual release was NOT fired, to avoid a real outward act during verification.)*

## 7 · Steering & branching (the fork)
- ✓ In an effort reading, "steer" ("make it cheaper") → the `STEER THIS, IN WORDS` field accepts the direction and `Send this direction` scopes a drive to that effort (internal — safe; only the gate fires outward). *(Field verified accepting input on Buffalo.)*
- ✓ "Try another approach" → **deterministically forks** a distinct sibling (the `branchFrom` verb, scoped to the parent); a lighter/provisional sibling appears on the next poll. *(Live fork seen on Buffalo; verb covered by `brain/test/firm/drive-branch.test.mjs`.)*
- ✓ Branching is the only structural op — no DAG wiring, no forms.

## 8 · Conversation (ambient)
- ✓ Agent activity renders as **receipts** (terse icon+mono log rows), never chat bubbles.
- ✓ Receipts are anchored/summarized in-world (clamped — never a canvas-covering panel).
- ✓ `/` or click the pill → the **summonable glass thread** slides over the world; dismiss returns full-bleed.
- ✓ A working-theory/handoff message renders as an in-world **checkpoint card**, not a bubble.
- ✓ A blocked effort reads "Blocked on your read" on BOTH the node and its reading (they agree). ○ The conversational side (the effort asking for what it needs in the thread) was not exercised this pass.

## 9 · Return-after-away & situational awareness
- ✓ The operating picture answers "where does everything stand" in one sweep (Needs you · Live · Building · Returned) on open.
- ○ A full away→return cycle with fresh returned evidence (zero/negative/conflicting outcomes shown honestly, in the market's words) was not exercised this pass.
- ○ Unresolved gate work is never silently cleared. *(Gate persists across reloads; not stress-tested.)*

## 10 · States & the off-happy-path (what demos skip)
- ✓ Provisional vs durable is legible without a label (lighter/adrift vs solid).
- ✓ Empty venture → calm world + composer + the first-run hint ("One sentence draws the whole venture …"), no error styling.
- ✓ Polling is clean — every shell poll endpoint (lens, projection, conversation, wall, drives, heat) returns 200; the prior intermittent 400/503 ⚠ did not reproduce.
- ○ Agent working → live step list + pulse; done → quiet receipt (runtime · model · cost). *(Agent runtime disabled in the verify environment — verify with a real drive.)*
- ○ Loading / stale → last verified view retained; no broken flash. *(Not forced this pass.)*
- ○ Send failure → honest unavailable state; Budget exhausted → drive pauses/resumes. *(Not exercised.)*

## 11 · Accessibility & input
- ✓ Escape rises/closes; ⌘K and `/` reach the teleport and thread by keyboard.
- ○ Full Tab path reaches every control with a visible focus ring. *(Not walked end-to-end this pass.)*
- ○ Icon-only controls have accessible names; color never the sole signal; live regions announce activity/altitude. *(aria-labels present in source; not audited live.)*

## 12 · Cross-cutting
- Historical pass: `?shell=legacy` loaded the old triptych while immersive was then the default. Current routing instead opens immersive with `?shell=world` and Now with no flag.
- Historical pass: no legacy `.firm-app-rail` / `.firm-app-inspector` selectors appeared in the then-default immersive DOM.
- ✓ `prefers-reduced-motion` → the world and every node-state band survive the emulation (state preserved; motion dropped).
- ○ Resolution: recomposes cleanly 1280 → 5K (fit reserves the docked chrome band). *(1920 verified; extremes not tested.)*

---
**Historically verified in that pass (✓):** the whole world + then-current chrome, color rationing, zoom/fit/pan, detail-band re-detailing, ⌘K teleport, descend-in-place, gate payload, materialization, receipts, summonable thread, empty-venture state, polling, then-default immersive routing, legacy fallback, and reduced-motion survival. This receipt does not verify current routing or the approved unified workspace.

**Open (○):** cross-venture switch, per-archetype reading content beyond effort, the steer control, the blocked→conversation ask, a full away/return cycle with fresh evidence, live agent step-lists (needs a real drive), send-failure/budget/loading states, the full keyboard/a11y audit, and extreme resolutions.

**Design calls (◇) — both resolved this pass:** the descend now grows out of the clicked node (true morph, verified numerically), and the gate release is now pure words-not-buttons (deterministic interpreter, unit-tested). Neither is an open call anymore.

**Historical note on the instrument:** `immersive-shell-journey.mjs` was repaired in the 2026-07-16 pass to exercise the then-shipped immersive default. Product code was not touched. The journey is now historical coverage and must not define current release readiness.
