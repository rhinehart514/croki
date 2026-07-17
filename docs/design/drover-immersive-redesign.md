# Drover — The Immersive Redesign (historical 2026-07-16 change-set)

> **Superseded design evidence — 2026-07-17.** The immersive shell, ambient conversation, permanent crew,
> automatic next-cycle behavior, and founder-never-drags doctrine are rejected. Preserve only edge-to-edge
> canvas craft, spatial focus, restrained motion, and exact founder-boundary inspection as historical input.

**Historical status:** on 2026-07-16 this was the decided shell direction and superseded the docked ADE
triptych. It was superseded on 2026-07-17 and is no longer authoritative or executable. Root `DESIGN.md` now
owns UI/UX direction; `docs/FIRM-SPEC.md` owns Product/build physics; `docs/STATE.md` owns current proof. The
remaining body preserves the original decision and imperative language as historical evidence only.

---

## 0 · Orientation — what changed, and why

Drover is the operating system for a one-person holding company: you drive a living venture by talking to it while a
permanent AI crew researches, drafts, and builds; product change and reaching the market are one act; everything that
would touch the world waits for your hand. `docs/design/ux-divergence-2026.html` committed the venture atlas to a
**docked ADE triptych** — a conversation rail, a center-stage canvas, and a right inspector — modeled on Letta /
LangSmith / Retool.

That shell got built (`FirmApp.tsx` composes a rail · atlas · inspector CSS grid; `VentureAtlas.tsx` is a d3-force
constellation with kinetic materialization). Founder verdict, 2026-07-16: **it reads as an interface, not an
inhabited place — competent but a generation behind, and not immersive.** The tell is structural: three fixed
rectangles framing a canvas means you look *at* the venture through IDE chrome instead of being *inside* it.

**The reframe:** dissolve the chrome. One continuous world you drive by talking, where activity is spatial, chrome is
small floating glass, and you **descend into** things rather than reading them in a side panel. This is not a visual
refresh; it is the experience architecture rebuilt around the outcomes below, with screens as a consequence.

---

## 1 · Outcomes — the North (every decision below serves these)

1. **See everything at a glance** — total situational awareness of the firm. Founder-stated 10/10: *"I can see
   everything."* Legibility wins over spectacle.
2. **Push new things by plain intent** — one ordinary sentence per campaign, artifact, or product change.
3. **Explore and choose approaches with confidence.**
4. **Run many things in parallel without losing control.**
5. **Decide only what touches the world;** trust the rest runs safely.
6. **Learn from the market and let it shape what's next.**
7. **Own your models and subscriptions — no cage.**
8. **Return after time away to a clear account, not a mess.**

"Immersive" is defined *against* outcome 1: it must make the firm **more** legible, not trade legibility for
cinematics. Any immersive move that hides what needs the founder is wrong.

---

## 2 · The determined change-set (From → To)

Each row is a decided change from the built triptych to the immersive system. Three rows were open taste forks,
resolved with the founder 2026-07-16 and marked **[fork → resolved]**.

| # | Layer | From (built today) | To (determined) | Serves |
|---|---|---|---|---|
| 1 | **Shell** | Fixed 3-column grid (rail 320 · stage · inspector 372) framing the canvas | **One edge-to-edge world**; the canvas is the full viewport | 1, immersion |
| 2 | **Chrome** | A workbench bar + docked panels | **Fully dissolved** — venture sigil, firm status, needs-you pulse, altimeter, and composer are small **floating glass** ephemera over the world **[fork → resolved: fully dissolved]** | 1, immersion |
| 3 | **Conversation** | Permanent 320px opaque rail | **Ambient** — agent work renders as **in-world generative objects** (nodes, drafts, checkpoint cards) where it lives; the linear transcript is a **summonable glass thread** (collapsed pill → translucent ribbon over the world), never a structural column **[fork → resolved: ambient; grounded in context7 — see §7]** | 1, 4 |
| 4 | **Inspect** | Select → 372px right panel swaps content | **Descend in place** — the node flies forward and **opens into its reading** (drafts · record · actions) via a shared-element morph; the world dims + blurs behind it, still present; **Escape rises** with the exact prior camera restored **[fork → resolved: descend in place]** | 3, 5; "never lose the map" |
| 5 | **Navigation** | Panels, keys, buttons | **Altitude + focus + teleport**: continuous semantic zoom (orbit → ground → inside), **⌘K** teleports the camera, **Escape** rises, camera history restores the map. No tabs, no altitude modes/switcher. | 1, 4 |
| 6 | **Composer** | Input inside the rail | The **single floating handle**, bottom-center, summonable (`/`). Empty venture: centered and inviting with suggested intents. Otherwise: the docked steer handle. | 2 |
| 7 | **Agent activity** | Chat-thread message bubbles | **Receipts** — flat icon+mono log rows (`Placed Map who Meridian is for`) and crew claims with faces — plus **checkpoint cards**. Never bubbles. | 5; trust watchable work |
| 8 | **Color / state** | Several accents | **Hard rationing**: green = living/connected only; **amber = needs-your-hand only** (the gate, the waiting effort, the pulse). Nothing else earns saturation, so "what needs you" reads across the whole surface at a glance. | 1, 5 |
| 9 | **Gate** | Panel / queue | **Ambient amber pulse**; **descend** into it to read the *exact staged payload* (the email as the recipient sees it, the spend, the diff). Release is dialogue — no accept/reject buttons; the firm remembers what you allowed. | 5 |
| 10 | **Signature moment** | Static draw of nodes | **Kinetic materialization**: one sentence → a **provisional working theory blooms node-by-node** with edges drawing, narrated by streaming receipts, sealed by a **First-theory checkpoint card**. Provisional reads visibly unsettled (dashed, faintly adrift); real work settles solid; one act surfaces at the gate needing a hand. | 2, 6 |
| 11 | **Approach fan** (next) | — | Selecting/asking for options blooms a **fan of 2–5 role-cast approaches** compared via a structured diff in the descended reading; **returned evidence forks the next round** ("explore from here"). From `drover-experience-system.md` Move C. | 3, 6 |

**What does NOT change:** the six founder-facing nouns (venture · conversation · effort · teammate · capability ·
record); the founder-language contract (no `bet/motion/fork/drifting/stage/work item` in copy); the warm-paper
identity; engine-owned placement (the founder never drags a node); the wall as the one world boundary with a
host-issued release capability; runs-on-your-own-subs, honestly metered.

---

## 3 · Experience architecture — the immersive model

**One living world, navigated by altitude, driven by talk, entered by descent.** Mental model, three words the
founder never reads: *Say it · Watch it · Release it* — then *learn, and say it again.*

- **The world is the product.** The venture atlas fills the viewport edge-to-edge. There is no shell framing it; the
  shell *is* the world plus floating glass ephemera.
- **Altitude is navigation (continuous, not modal).** Zoom re-details the same graph — no snap tiers, no switcher,
  no altitude chrome (this correction stands from `ux-divergence-2026.html` §7b):
  - **Orbit** (far): the whole venture as a living constellation — the vision→distribution spine and the operating
    picture (needs-you · live · building · returned) as glyphs and cluster labels. This altitude *is* outcome 1.
  - **Ground** (mid): full node cards, the crew moving, efforts and their drafts, the gate. Where you read the
    theory and direct work.
  - **Inside** (descend): one node opens into its reading; the world recedes behind into depth-of-field.
- **Conversation is ambient, in two channels** (see §7 for the grounding):
  - *In-world:* agent work is generative objects placed where it lives; transient receipts surface next to the node
    they concern.
  - *Summonable:* the linear transcript + checkpoint history is a glass thread you pull up and dismiss — collapsed to
    a pill showing the latest line + count, so it is always glanceable and never a structural column.
- **Selection is descent, not a panel.** You go *into* a thing; the map stays visible behind you; Escape rises.
- **The wall gates every world-touching act;** it is an ambient boundary you descend into to decide.

---

## 4 · Information architecture (unchanged nouns, dressed in the world)

**Objects, founder language:** the venture · who it helps · how value happens · ways to grow (approaches) · live
pushes · what the crew is doing · what they made · what the market said · the people on it and what each is doing.

**The spine** (the real architecture kernel in plain words): product vision → the durable machinery it's built on →
the ways it reaches people → the live pushes → the concrete acts that touch the world.

**Navigation = altitude + focus + teleport, never pages.** Focus (a lens) pulls one layer forward and dims the rest;
the whole world stays present. ⌘K jumps to any object/action/venture and flies the camera there. Escape rises one
altitude; a breadcrumb shows the descent path. Placement is engine-owned; deleting placement regenerates a
deterministic atlas.

---

## 5 · Interaction model

**The loop:** intent → materialize → compare/steer → commit → approve (wall) → return → re-ideate. Founder copy names
the act; the machine runs `diverge → prepare → founder decision → act → observe → adapt` underneath.

**Core gestures — all plain language or direct manipulation; no forms, no DAG wiring, no setup ceremony:**
- Type intent in the composer → a working theory (or an approach fan) blooms on the canvas, visibly provisional,
  narrated by receipts.
- **Double-click / click a node → descend** into its reading. Select two approaches → the reading shows a structured
  approach-diff (who each reaches, mechanism, cost, which roles, where weakest).
- Refine ("make B cheaper") edits in place; **"try another approach" branches a dashed sibling** — branching is the
  only structural op.
- Commit → the card solidifies (provisional → committed·running); siblings collapse to a quiet "other approaches (N)."
- At the wall: descend to read the exact staged act; **Release or Hold, in words.** One decision.
- **Escape** always rises / closes the descent; **⌘K** teleports; **`/`** summons the composer; **f** fits the venture.

---

## 6 · Visual hierarchy

- **Warm paper, near-monochrome.** Ground `#eae6df` / stage `#e9e6e0`; cards `#f4f1ea`→`#faf8f3`; ink
  `#23211d`/`#4e4b44`/`#615e56`. These are the live token layer in `ui/src/index.css` — the redesign reuses them, it
  does not re-palette.
- **Two rationed signals only.** Green (`#3f5c46`/`#587a5f`) = living/connected. Amber (`#9a6b2f`) = needs-your-hand.
  Nothing else is saturated. This rationing is what makes outcome 1 work: the eye finds what needs a hand instantly.
- **Type roles.** Serif voice (`Iowan Old Style`→Georgia) for titles and the venture name; system sans for body;
  **mono (`SF Mono`) for receipts, kickers, and instrument labels** — the instrument texture that reads as a current
  build rather than a chat app.
- **Glass marks what floats, elevation marks what's live.** Floating chrome and the summonable thread are translucent
  glass (backdrop-blur, hairline, soft warm shadow) so the world reads continuously behind them. The descended
  reading is the one lifted surface; the world blurs behind it.
- **Provisional vs durable is legible without a label.** Provisional = dashed, faintly desaturated, gently adrift;
  durable = solid. Every node handles: idle · hover · selected/focused · in-progress · blocked · has-drafts · at-gate
  · stale · enter/exit.

---

## 7 · Why conversation is ambient — the context7 grounding

The one open fork was *where the conversation lives.* Resolved to **ambient** on current tooling guidance, not
preference:

- **CopilotKit** (`/copilotkit/copilotkit`) ships docked `CopilotSidebar` / `CopilotPopup` / `CopilotChat`, but its
  headless-UI guidance is explicit: use headless (`useCopilotChat`) when you need to *"integrate agent chat into
  existing UI patterns"* or *"drop generative UI primitives into layouts that are **not strictly chat interfaces**."*
  Drover's primary surface is a canvas, not a chat window — so the docked column is the wrong default and headless is
  the right one.
- **assistant-ui** (`/assistant-ui/assistant-ui`) demonstrates the two ambient channels directly: `interactableTool`
  renders agent output as an **editable object in place** (their canonical example is a notepad of drafted text the
  user edits — precisely Drover's drafts/efforts as canvas objects), and `ReadonlyThreadProvider` /
  `ThreadPrimitive` render the **linear thread anywhere, on demand** rather than in a fixed panel.

Conclusion: for a canvas-primary product, agent work belongs **in the world as generative objects**, and the linear
transcript is a **thread you summon**. A permanent docked rail is the pattern for apps whose primary surface *is*
chat, which Drover is not.

---

## 8 · Implementation mapping (the immersive model rides current, real APIs)

Stack in `ui/`: React 19.2, `@xyflow/react` 12.11, `motion` 12.42, Base UI 1.6, Tailwind 4.3, d3-force 3. The
immersive interactions are not bespoke — they map to shipped APIs (verified via context7, 2026-07-16):

- **Camera / teleport / rise** — `@xyflow/react` `useReactFlow()`: `setCenter(x, y, { zoom, duration })` to fly to a
  node on descent; `fitView({ nodes, duration })` for orbit/fit; `setViewport(prev, { duration, interpolate:"smooth" })`
  to restore the map on Escape. Store camera history in a stack for the rise gesture.
- **Altitude / semantic zoom** — read the live zoom in custom nodes via `useStore((s) => s.transform.zoom)` (React
  Flow's Contextual-Zoom pattern) and re-detail the card per zoom band. No mode state.
- **Descend-in-place morph** — `motion` shared-element transition: matching `layoutId` between the node card and the
  opened reading so the node *becomes* the reading; `AnimatePresence` for the exit/rise; `layout` transition with an
  arc path for the fly-in. This is the descent, done as one morph rather than a panel swap.
- **Conversation** — headless composition (CopilotKit `useCopilotChat` / assistant-ui `ThreadPrimitive` +
  `ReadonlyThreadProvider`) so the transcript renders into the summonable glass ribbon, and agent tool-calls render as
  in-world receipts/objects (assistant-ui `interactableTool` pattern) rather than a docked chat.
- **Layout engine** — engine-owned collision-free placement stays (d3-force today; elkjs is the open Phase-2 spike per
  `ux-divergence-2026.html` §6). The founder never drags.
- **Materialization streaming** — React 19 `useTransition`/`useOptimistic`; Motion layout animation for node birth;
  reduced-motion removes camera travel and JS animation but keeps every state change.

---

## 9 · Build sequence

1. **Flow 1 end-to-end, immersive** — edge-to-edge world + dissolved chrome + the floating composer + kinetic
   materialization + receipts, on real venture data at 1920×1080. This is the signature slice and the whole gap
   `STATE.md` names. Judge with the design-critic.
2. **Descend-in-place** — the shared-element morph, world depth-of-field, Escape-rises with camera restore. Every
   node archetype opens into its reading (effort · drafts · record · teammate current-work · capability · gate payload).
3. **Ambient conversation** — in-world receipts + the summonable glass thread + the checkpoint history; headless
   composition per §8.
4. **Altitude/LOD polish** — the continuous dive; the whole thing must feel *inevitable*.
5. **Approach fan + outcome-forks** (`drover-experience-system.md` Move C), then the wall, then lenses.

---

## 10 · Unproven / risks

- **Ambient legibility.** The bet is that in-world receipts + a glanceable pill preserve outcome 1 better than a
  permanent rail. If real use shows the founder can't tell "what's happening" without a persistent thread, add a slim
  always-on strip (the resolved-against option) — a reversible fallback, not a redesign.
- **Descent vs. peripheral awareness.** Descend-in-place keeps the world blurred-but-present; if that reads as "lost
  the map" at real density, widen the reading's transparency or shrink it toward a floating detail.
- **Divergence at scale.** A generative, parallel machine floods; wide-but-quiet below the fold, amber-only for
  attention, and the keyboard outline retaining every item are the guards. Fatal mode to watch.
- **Layout engine choice** (elkjs vs d3-force) remains a Phase-2 spike, not a paper decision.
