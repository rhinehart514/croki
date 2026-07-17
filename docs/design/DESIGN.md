---
status: canonical-current-code-record
refreshed: 2026-07-17
experience_direction: ../../DESIGN.md
token_source: ../../ui/src/index.css
feature_styles:
  - ../../ui/src/styles/firm-app.css
  - ../../ui/src/styles/firm-lens.css
  - ../../ui/src/styles/firm-lens-outline.css
  - ../../ui/src/styles/freshness.css
  - ../../ui/src/styles/firm-settings.css
  - ../../ui/src/styles/portfolio-frontier.css
  - ../../ui/src/styles/venture-atlas.css
  - ../../ui/src/styles/workyard.css
tokens:
  colors:
    ink: { value: "#23211d", ref: "ui/src/index.css:18" }
    ink_2: { value: "#4e4b44", ref: "ui/src/index.css:20" }
    ink_3: { value: "#615e56", ref: "ui/src/index.css:21" }
    muted: { value: "#615e56", ref: "ui/src/index.css:22" }
    faint: { value: "#aba598", ref: "ui/src/index.css:23" }
    ghost: { value: "#c6c1b6", ref: "ui/src/index.css:24" }
    line: { value: "#d3cfc6", ref: "ui/src/index.css:25" }
    surface: { value: "#f4f2ee", ref: "ui/src/index.css:27" }
    surface_2: { value: "#dcd8d0", ref: "ui/src/index.css:29" }
    canvas: { value: "#e9e6e0", ref: "ui/src/index.css:30" }
    room: { value: "#e3e0da", ref: "ui/src/index.css:31" }
    link: { value: "#1e5245", ref: "ui/src/index.css:35" }
    gap: { value: "#a9791a", ref: "ui/src/index.css:36" }
    danger: { value: "#b4443a", ref: "ui/src/index.css:37" }
    blind: { value: "#aba598", ref: "ui/src/index.css:38" }
  type:
    text_xs: { value: "0.6875rem", ref: "ui/src/index.css:40" }
    text_meta: { value: "0.75rem", ref: "ui/src/index.css:41" }
    text_sm: { value: "0.8125rem", ref: "ui/src/index.css:42" }
    text_base: { value: "0.875rem", ref: "ui/src/index.css:43" }
    text_md: { value: "1rem", ref: "ui/src/index.css:44" }
    text_lg: { value: "1.0625rem", ref: "ui/src/index.css:45" }
    text_xl: { value: "1.3125rem", ref: "ui/src/index.css:46" }
    text_2xl: { value: "1.625rem", ref: "ui/src/index.css:47" }
    text_display: { value: "2.75rem", ref: "ui/src/index.css:48" }
    leading_tight: { value: "1.25", ref: "ui/src/index.css:48" }
    leading_normal: { value: "1.5", ref: "ui/src/index.css:49" }
  spacing:
    space_1: "0.25rem"
    space_2: "0.5rem"
    space_3: "0.75rem"
    space_4: "1rem"
    space_5: "1.25rem"
    space_6: "1.5rem"
    space_8: "2rem"
    space_12: "3rem"
    ref: "ui/src/index.css:51"
  radius:
    sm: "6px"
    md: "9px"
    lg: "12px"
    ref: "ui/src/index.css:60"
  motion:
    ease: "cubic-bezier(0.22, 1, 0.36, 1)"
    ease_out: "var(--ease)"
    fast: "120ms"
    base: "200ms"
    ref: "ui/src/index.css:71"
---

# Drover design system record

This is the canonical design-system record extracted from the live UI. The root
[`DESIGN.md`](../../DESIGN.md) owns experience direction; this file records what the current code can
actually render, where reuse is real, and where the foundation is drifting.

The older white/zinc, blue-link, proven-green, and glass-palette description is retired. The current
Firm shell ships a warm mineral palette, opaque operating surfaces, a forest interaction color, and
no production glass skin.

## Creative north star

**The canvas holds the venture. Conversation directs and interrogates it.** The visual system is a quiet
warm room for one canonical Product and go-to-market model. Direct manipulation, exact differences,
evidence, interpretation, runtime provenance, and the founder-held consequence boundary create
specificity. Agent machinery and decoration do not.

## Current-code boundary

This file records what the current UI can render; it does not bless the current product composition. The
working tree still contains Now, immersive, and legacy shells, closed Atlas roles, a teammate-oriented
configuration model, a non-draggable resting Atlas, and heat/always-on controls. Those are migration debt
under root `DESIGN.md` and `docs/FIRM-SPEC.md`, not approved information architecture.

The approved missing capabilities are: one canvas-first founder workspace, one venture conversation with
persistent branches, open Product/go-to-market objects and relationships, reversible Understand / Design /
Execute / Learn lenses, direct canvas manipulation, disposable/live/snapshot view semantics, founder-started
runs, outcome-contract workflows, and complete consequence execution. Until code and acceptance receipts
exist, none may be listed as current foundation truth.

## Stack

- **Application:** React 19.2 + TypeScript 6, built by Vite 8.
- **Styling:** Tailwind CSS 4 token aliases plus feature-local CSS. There is no Tailwind config file;
  `ui/src/index.css` supplies `@theme inline` aliases.
- **Primitive layer:** Base UI 1.6 under local shadcn-style source components in
  `ui/src/components/ui/`; Class Variance Authority composes `Button` variants.
- **Canvas:** `@xyflow/react` 12.11.
- **Motion:** Motion supplies topology/layout transitions where the atlas changes meaning; CSS and
  React Flow handle direct interaction and camera travel. All use the shared motion contract.
- **Icons:** `lucide-react` 1.21.
- **Rich model text:** `streamdown` 2.5.
- **Identity:** DiceBear-backed illustrated avatars behind `CrewFace`.
- **Type assets:** Geist Variable and Geist Mono are installed and imported. The rendered body stack
  is the system sans; Geist Mono is used for machine text; Geist is reserved for rare return/focus
  headings through `--font-heading`.
- **Platform:** desktop web shell embedded by Electron; 960px minimum, judged at 1440x900 and
  1280x800.

The standalone `design-system/` package is a compatibility projection named
`@gtm-ide/design-system`. The production UI does not import it, and it is not an alternate source of
truth. Its shared tokens resolve identically to `ui/src/index.css`; its 34 explicitly registered
extensions serve package-only historical components.

## Color roles

### Neutral room

- `--room` `#e3e0da` is the outer workbench.
- `--canvas` `#e9e6e0` is the infinite spatial ground.
- `--surface` `#f4f2ee` is the readable lifted plane for conversation, nodes, controls, and review.
- `--surface-2` `#dcd8d0` is an inset or quiet selected plane.
- `--ink` `#23211d` through `--ghost` `#c6c1b6` forms the warm umber content and line ramp.

### Semantic color

- `--link` `#1e5245` marks interaction, focus, and presence. It is not an ambient brand wash.
- `--gap` `#a9791a` marks held founder attention and the wall.
- `--danger` `#b4443a` marks destructive or failed states.
- `--blind` `#aba598` marks missing signal.

The UI has no production `--proven` token. Do not reintroduce positive/negative outcome color or
inherit the standalone package's green status vocabulary. Outcomes remain language and evidence.

`--muted` is the readable metadata ink: 5.20:1 on canvas and 5.79:1 on surface. `--faint` remains a
decorative line/disabled role and must not carry essential meaning.

## Type hierarchy and voice

The tokenized scale is 11px, 12px, 13px, 14px, 16px, 17px, 21px, 26px, and a rare 44px display role. `--text-meta` is the minimum
operating metadata role; production feature CSS has no remaining raw 9-10px text.

The intended roles are:

- Geist Variable for rare display and major focus headings.
- System sans for body, controls, and high-frequency reading.
- Geist Mono for code, repository paths, revisions, identifiers, and exact diffs.

Geist's rare display role remains intentionally narrow; do not describe it as the body face.
Founder-facing prose is plain, concrete, and consequence-led; machine vocabulary belongs only in
receipts and disclosures.

## Spacing, radius, and density

The spacing scale is 4, 8, 12, 16, 20, 24, 32, and 48px. The radius scale is 6, 9, and 12px, plus a
24px panel radius alias and full circles where identity or a focal marker requires them.

Dense does not mean microscopic. Metadata can be quieter than body copy but must stay readable at the
two supported desktop sizes. Crew does not occupy a duplicate conversation roster. The conversation
panel has a durable 360–680px width and can collapse; the canvas tray stays compact until requested
and its expanded inventory remains scrollable inside the viewport.

## Elevation and material

- `--shadow-card` is the resting node and content-card level.
- `--shadow-pop` is the popover, outline, and transient-control level.
- `--shadow-modal` is reserved for a blocking decision surface.
- Conversation and review content are opaque. The dotted canvas may never bleed through text.
- Hairlines and spacing group related content before another container does.

The rail and avatar use the earned `--shadow-rail` and `--avatar-inset` roles. Do not create a
speculative shadow catalog.

## Current legacy Atlas grammar

The current Atlas implementation is an infinite React Flow canvas. These treatments are reusable spatial
and craft evidence, but their closed role set is not the approved canonical model:

- **Open concept:** a plain fragment or label with an incomplete edge; no role glyph.
- **Named area:** a quiet irregular territorial boundary with its title embedded in the boundary.
- **Product loop:** ordered beats through product terrain with a visible return curve.
- **System:** a stable layered landmark with one compact capability statement.
- **Motion:** a route crossing systems with actor and value endpoints.
- **Campaign:** a temporary bracket or pressure envelope around part of a route.
- **Bet/work:** the existing Workyard claim and exact-work territory at near depth.
- **Release:** exact work oriented toward the founder wall.
- **Outcome:** an inbound impression carrying source and join identity.
- **Founder authority:** the wall boundary and explicit decision seal.

These materials must remain distinguishable in monochrome. Uniform rectangular cards, generic graph
ports, arrow spaghetti, and a permanent property inspector fail the grammar. Canvas placement, route
bends, camera, z-order, and decorative strokes are presentation; semantic architecture lives in the
venture document.

## Motion

The shared motion contract is `--dur-fast` at 120ms and `--dur-base` at 200ms with
`cubic-bezier(0.22, 1, 0.36, 1)`. Atlas focus may use `--dur-focus` at 360ms with the same settling
curve; topology changes may use a critically damped spring only through the installed Motion runtime.
Shared controls name the properties they transition and consume shared timing. Working identity
settles into a static forest ring; it never loops to simulate work.

Purposeful sequences are camera focus/restore, concept promotion, route reflow, fork, exact release
to the wall, evidence-supported return, and founder-accepted architecture change. Each plays once,
remains interruptible, and ends in the complete information state. React Flow camera movement uses
the same contract and becomes immediate when `prefers-reduced-motion` is active. The direction is strict:

- explicit transform/opacity or named state properties only;
- no loop that simulates productivity;
- no `transition: all`;
- no parallax, ambient drift, pulsing work decoration, or animation used as status;
- reduced motion preserves information in the settled frame.

## Real primitive inventory

### Reused primitives

- **`Button`** — Base UI + CVA. Variants: `default`, `outline`, `secondary`, `ghost`, `destructive`,
  `link`. Sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. Used by the
  composer, heat, configuration actions, product-change review, and wall review.
- **`Input`** — Base UI input with default, focus, disabled, and invalid states. Used by venture setup
  and heat/spend control.
- **`Textarea`** — semantic textarea with the same state vocabulary. Used by the direction composer
  and wall notes.
- **`CrewFace`** — one participant-identity door. States: `idle`, `working`; monogram exists only as
  an error fallback. Reused across roster, canvas, composer, and conversation.

### Feature primitives carrying current or migration behavior

- **`VenturePicker`** — existing venture, create another venture, repository selection, loading,
  empty, busy, and error.
- **`TeammateRail`** — scoped conversation, composer, collapse control, and wall-open state.
- **`GoalComposer`** — whole-firm, teammate, and bet scope; runtime readiness; busy, suggestion,
  blocked-at-wall, error, and send states.
- **`ConversationFeed`** — founder/model messages, configuration proposal/receipt, handoff, activity,
  empty guidance, and working state.
- **`ReturnBrief`** — presentation-only `Since you left` groups with canonical receipt/bet/wall
  navigation and an explicit wider-firm omission boundary.
- **`FirmFreshness`** — last verified update, reconnect/backoff, offline, and desktop-host-required
  states over the coherent shell read model.
- **`ActiveWorkReceipt`** — durable progress, elapsed time, runtime/configuration/cost provenance, and
  provider-supported stop without ending the bet.
- **`ConfigurationMessage` + `ConfigurationDiff`** — proposal, applied receipt, stale proposal, apply,
  undo, and raw field disclosure.
- **`ConversationHandoff`** — new-bet and wall handoff attached to the originating conversation.
- **`FirmLens`** — React Flow projection, authored placement, ephemeral evidence focus scenes, camera
  history, semantic altitude, relationship edges, outline, wall band, loading, error, and empty firm.
- **`CanvasTray`** — draggable and keyboard-placeable existing crew plus host-backed repository and
  connected-account capabilities; it writes placement only.
- **`CrewNode`** — selected participant plus capability-proposal toolbar.
- **`CapabilityNode`** — a placed real source/action with read-only or founder-wall authority shown
  explicitly and a placement-only remove action.
- **`BetNode`** — `live`, `at-wall`, and `ended` position; fork marker; staged count; latest joined
  market return.
- **`FirmLensOutline`** — keyboard-accessible crew/bet index with open/closed, active row, group,
  empty, Home/End/arrow/Escape behavior.
- **`FirmWallReview`** — clear wall and purpose-specific pending items; exact artifact/consequence;
  release, answer, outcome review, product-change review, deploy authorization, keep, and end actions.
- **`FirmHeatControl`** — heat, daily spend, dirty, saving, saved, and error.

Feature primitives are not a request to extract a component package. `TeammateRail`, `CrewNode`,
`BetNode`, `FirmHeatControl`, Workyard, and the current closed-role Atlas are legacy/migration primitives,
not approved navigation or ontology. Their useful mechanics should be folded into the unified workspace;
the old components should be deleted after parity rather than preserved as a second surface.

## Current foundation state

### Real

- Warm mineral tokens in `ui/src/index.css` and their Tailwind aliases.
- One venture-wide header, a persistent 360–680px conversation width, independent conversation
  collapse, and a canvas that takes the released space at supported desktop sizes.
- A compact canvas tray for repositioning existing crew and placing repository/Gmail capability
  truth without granting authority or duplicating domain state.
- Shared Base UI button/input primitives in high-consequence forms.
- Stable `CrewFace` identity across four surfaces.
- Card/popover/modal elevation roles.
- Purpose-specific wall actions and configuration receipts.
- Keyboard outline and visible focus styling.
- Coherent freshness/read-only presentation, evidence-linked return briefing, and durable active-work
  control.
- Measured-node viewport fitting, temporary bet-family focus arrangement, camera restoration, and
  reduced-motion-aware camera travel.

### Duplicated

- Venture, tray, thread, handoff, starter, and outline buttons each own feature-local state styling.
  Some are semantically distinct; compact control styling is repeated.
- `design-system/src/components` contains a second button/input/textarea/card vocabulary not consumed
  by the production UI.
- `design-system/styles.css` duplicates the canonical values as a checked compatibility projection;
  production imports remain prohibited.

### Inline

- Raw 999px pill radius and scattered 1-3px gaps/padding.
- Raw fixed control and node dimensions where a semantic density role would be clearer.

### Missing by approved direction

- One unified workspace frame, persistent venture/branch conversation, unified composer, canonical canvas,
  contextual workbench, and contextual founder gate.
- Direct canvas manipulation, hybrid semantic interpretation, undo/restore, semantic zoom, and complete
  epistemic grammar.
- Product/go-to-market territories, reversible operating lens, generated/live/snapshot views, and full
  search across model, evidence, conversation, views, and work.
- Visible multi-agent scope/provenance without roster or org-chart primacy.

These remain feature-local product behavior rather than generic design-system primitives.

## Foundation ledger

Closed in the 2026-07-14 foundation pass:

- Undefined production variables and a false-positive parity command.
- Unreadable 9-10px metadata and sub-AA muted text.
- Fixed roster cards that clipped without an explicit scroll affordance.
- Looping avatar/activity animation and `transition: all`.
- Raw rail/avatar shadows and `CrewNode`'s parallel compact controls.
- Disconnected heading type, silent stale state, schema-first configuration review, full-card
  miniaturization, selected-thread contamination, and empty-wall modal theater.
- Offscreen first-frame canvas nodes, non-spatial bet focus, raw return timestamps, animated
  reduced-motion camera travel, and low-contrast active wall text.

Remaining foundation debt includes the historical package component duplicate, incidental raw geometry,
the oversized shared vendor chunk, and current token-parity failures in immersive, Now, firm-app, and Atlas
CSS. On 2026-07-17 `npm run test:acceptance` stopped at token parity before browser journeys; see
`docs/STATE.md`. Do not convert historical receipts into current proof or speculative primitives.

## Local rules

Checkable rules for this repository:

- Add or change production tokens only in `ui/src/index.css`; update the YAML values here in the same
  change.
- Never treat `design-system/styles.css` as canonical. If the package is maintained, its parity check
  must fail the process on drift, not merely print "failed" with exit code zero.
- Extend `ui/src/components/ui` before hand-rolling a repeated control state. Keep product-specific
  semantics in feature components.
- While legacy participant portraits remain, use `CrewFace`; do not create another identity system or make portraits approved navigation.
- The wall owns amber. Interaction owns forest. Outcomes own neither.
- Readable operating surfaces are opaque; no glass over the canvas.
- Mono is for machine material only.
- No raw font size below the decided metadata token; no essential text below AA contrast.
- No full-card far view. Semantic zoom changes the representation.
- No connection failure may leave a "Live" claim without a visible freshness qualifier.
- No generic approval verb may cross wall purposes.
- Product-owned copy names concrete work and consequences; it never exposes `bet`, `motion`, `fork`,
  `outcome`, `the wall`, `pipeline`, `stage`, or `work item`. Historical component, route, storage,
  and test identifiers remain until an intentional migration.
- No mobile breakpoint or phone/tablet design work.

## Verification

Run after code changes that touch this record:

```sh
npm --prefix design-system run verify:tokens
npm --prefix ui run test:unit
npm --prefix ui run lint
npm --prefix ui run build
npm run test:acceptance
```

The token parity command reads all production CSS, rejects undefined production variables, compares
all 78 canonical tokens with the compatibility projection, validates the extension registry, and
exits nonzero on any drift.

The intended acceptance browser coverage includes 1440x900 and 1280x800, 80–200% browser zoom, keyboard
focus, reduced motion, canonical canvas/branch/workbench behavior, founder consequence, dense/empty states,
stale/offline recovery, errors, and long content. The current 2026-07-17 readiness run did not reach browser
journeys because token parity failed; no acceptance coverage is claimed current until the complete command
passes.

Refresh this record only from current code and a current render. Promote inline values and
consolidate duplicates by observed reuse; do not build a speculative component library.
