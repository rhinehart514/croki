---
status: canonical-current-code-record
refreshed: 2026-07-20
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
  - ../../ui/src/components/workspace/workspace-shell.css
  - ../../ui/src/components/thread/thread-shell.css
  - ../../ui/src/components/maps/venture-maps.css
tokens:
  colors:
    ink: { value: "#f5f5f5", ref: "ui/src/index.css" }
    ink_2: { value: "#d4d4d4", ref: "ui/src/index.css" }
    ink_3: { value: "#a3a3a3", ref: "ui/src/index.css" }
    muted: { value: "#a3a3a3", ref: "ui/src/index.css" }
    faint: { value: "#737373", ref: "ui/src/index.css" }
    ghost: { value: "#525252", ref: "ui/src/index.css" }
    line: { value: "white / 6%", ref: "ui/src/index.css" }
    surface: { value: "#1c1c1c", ref: "ui/src/index.css" }
    surface_2: { value: "white / 4%", ref: "ui/src/index.css" }
    canvas: { value: "#171717", ref: "ui/src/index.css" }
    room: { value: "#171717", ref: "ui/src/index.css" }
    link: { value: "#75a7ff", ref: "ui/src/index.css" }
    gap: { value: "#f59e0b", ref: "ui/src/index.css" }
    danger: { value: "#f87171", ref: "ui/src/index.css" }
    blind: { value: "#737373", ref: "ui/src/index.css" }
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
    md: "10px"
    lg: "14px"
    ref: "ui/src/index.css"
  motion:
    ease: "cubic-bezier(0.4, 0, 0.2, 1)"
    ease_out: "var(--ease)"
    fast: "150ms"
    base: "180ms"
    focus: "200ms"
    ref: "ui/src/index.css"
---

# Drover design system record

This is the canonical design-system record extracted from the live UI. The root
[`DESIGN.md`](../../DESIGN.md) owns experience direction; this file records what the current code can
actually render, where reuse is real, and where the foundation is drifting.

The older warm-mineral and light Now-shell descriptions are retired. The current founder shell is a
dark-first neutral work environment with compact chrome, persistent exact material, and restrained blur
only on the floating composer.

## Creative north star

**Work is the primary object. Conversation carries its intent; exact material proves its consequence.**
The visual system is a quiet, near-black founder IDE for one canonical Product and go-to-market model.
Direct manipulation, exact differences, evidence, interpretation, runtime provenance, and the founder-held
consequence boundary create specificity. Founder-created agents are compact operating instruments in the
Work rail; decorative agent machinery does not belong on the canvas.

## Current-code boundary

This file records what the current UI can render; it does not turn product aspirations into proof. The
working tree has one founder entry backed by `WorkspaceShell`: a resizable Work/Product-GTM/Releases rail,
one shared context, mounted conversation, optional Work visual, controlled system graph, and semantic release
workspace. `ThreadShell` remains source compatibility during migration but is not mounted by the entry.

Non-HTML visual artifacts now expose section-level steering in both the mounted `WorkspaceShell` and the
compatibility `ThreadShell`. `VisualMemo` emits an exact artifact/section target; the existing composer keeps the
same Thread and durable work reference, and `conversation/reply` carries that target separately from the founder's
verbatim message. The work-loop prompt constrains the participant to an in-place local revision rather than a sibling
artifact. Selection, focus, clear, sending, and sent states are visible and keyboard reachable.

Compatibility-owned architecture edits continue through the architecture adapter; founder-authored open
objects and relationships use the semantic mutation adapter. The v5 venture session persists graph camera
changes alongside mode, selection, and conversation state; v4/v3 migration preserves founder context while
clearing only the obsolete map camera. Saved live views and snapshots have a reachable list, reopen, and
delete lifecycle. `docs/STATE.md` remains authoritative for the exact proof boundary.

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
- **Type assets:** DM Sans Variable and JetBrains Mono Variable are installed and imported. DM Sans owns
  operating text; the native SF Mono stack followed by JetBrains Mono owns machine text and exact diffs.
- **Platform:** desktop web shell embedded by Electron; 960px minimum, judged at 1440x900 and
  1280x800.

The standalone `design-system/` package is a compatibility projection named
`@gtm-ide/design-system`. The production UI does not import it, and it is not an alternate source of
truth. Its shared tokens resolve identically to `ui/src/index.css`; its 34 explicitly registered
extensions serve package-only historical components.

## Color roles

### Neutral room

- `--room` and `--n-app` `#171717` are the application ground.
- `--n-rail` `#191919` and `--n-panel` `#1c1c1c` separate chrome and exact material.
- White at 4–10% forms inset, hover, selected, and hairline roles.
- `--n-ink` `#f5f5f5` through `--n-ink-4` `#737373` forms the operating text ramp.

### Semantic color

- `--primary` `#4f86f7` and `--link` `#75a7ff` mark action and focus, never ambient brand wash.
- `--gap` / amber marks held founder attention and the wall.
- `--green-2` marks verified active work.
- `--danger` marks destructive or failed states.
- `--blind` marks missing signal.
- `--agent-spectrum-*` is the cyan-to-amber spectrum reserved for the in-chat authority switch between
  direct Claude/Codex and Product / GTM agents. It may edge the participant switch and active composer;
  a slow continuous drift may signal active agent participation, with a static reduced-motion fallback. It is
  not an ambient background or general accent system.
- The Work participant switch moves one shared selection indicator rather than swapping independent button fills.
  Sending a prompt gives the exact text one short directional departure into the transcript; Code uses its neutral
  primary color while Product / GTM uses the agent spectrum. Network latency never controls this motion's duration.

The UI has no production `--proven` token. Do not reintroduce positive/negative outcome color or
inherit the standalone package's green status vocabulary. Outcomes remain language and evidence.

Metadata uses `--n-ink-3`; disabled and placeholder roles use `--n-ink-4`. Essential meaning is never
carried by the faint role or color alone.

## Type hierarchy and voice

The tokenized scale is 11px, 12px, 13px, 14px, 16px, 17px, 21px, 26px, and a rare 44px display role. `--text-meta` is the minimum
operating metadata role; production feature CSS has no remaining raw 9-10px text.

The intended roles are:

- DM Sans Variable for display, body, controls, and high-frequency reading.
- SF Mono / JetBrains Mono for code, repository paths, revisions, identifiers, and exact diffs.

Founder-facing prose is plain, concrete, and consequence-led; machine vocabulary belongs only in
receipts and disclosures.

## Spacing, radius, and density

The spacing scale is 4, 8, 12, 16, 20, 24, 32, and 48px. The working radius scale is 6, 8, 10, 14,
16, and 20px; 20px is reserved for the composer and full circles for status or identity.

Dense does not mean microscopic. Metadata can be quieter than body copy but must stay readable at the
two supported desktop sizes. The work index defaults to 272px and resizes from 272–360px. Selected exact
material is 360–540px; the narrative consumes the remaining field. Work's SDK participant controls share
the anchored composer measure; they do not create a second organization surface.

## Elevation and material

- `--shadow-card` is the resting content and composer level.
- `--shadow-pop` is the popover, outline, and transient-control level.
- `--shadow-modal` is reserved for a blocking decision surface.
- Conversation and review content are opaque. The composer alone may use restrained backdrop blur.
- Hairlines and spacing group related content before another container does.

The rail is separated by a hairline, not elevation. Work has no agent operator or character roster; ready,
working, stopping, interrupted, and needs-you remain explicit in the owning Thread and transcript. Do not
create a speculative shadow catalog.

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

The shared motion contract is `--dur-fast` at 150ms, `--dur-base` at 180ms, and `--dur-focus` at 200ms
with `cubic-bezier(0.4, 0, 0.2, 1)`. Atlas topology changes may use a critically damped spring only through
the installed Motion runtime. Shared controls name the properties they transition and consume shared timing.
An active-work dot may pulse and an active-work glyph may rotate only while work is actually running.

Purposeful sequences include workbench/map entry, composer arrival/focus, work-group disclosure, selected
work and material settlement, active-work state, camera focus/restore, route reflow, exact release to the
wall, evidence-supported return, and founder-accepted architecture change. Each arrival plays once,
remains interruptible, and ends in the complete information state. React Flow camera movement uses
the same contract and becomes immediate when `prefers-reduced-motion` is active. The direction is strict:

- explicit transform/opacity or named state properties only;
- no loop that simulates productivity; loops require a truthful active-work state;
- no `transition: all`;
- no parallax, ambient drift, decorative pulse, or animation as the sole carrier of status;
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

### Feature primitives carrying current behavior

- **`VenturePicker`** — existing venture, create another venture, repository selection, loading, empty,
  busy, and error.
- **`VentureWorkspace` + `WorkspaceShell`** — sole founder entry and state owner for mode, shared context,
  v5 restoration, Work conversation/visual, Product / GTM scope, Release selection, and contextual drawer.
- **`WorkspaceRail` + `WorkspaceModeNav`** — venture navigation, 272–360px resize, `⌘1`–`⌘2`, surface-scoped
  `⌘K`, Settings, and mode-specific index bodies.
- **`ThreadList`** — optional Pinned, Active, Needs review, Recent, and older history without a separate
  participant roster.
- **`SystemWorkspace`** — controlled graph/attention projection plus founder creation and editing through
  the open semantic adapter or existing architecture compatibility adapter.
- **`ReleaseWorkspace`** — the current release read model and transition seam toward a release-scoped canvas:
  contextual unsaved draft, editable object/work joins, exact founder gates, concrete gaps, derived lifecycle,
  and reversible end/reopen without deletion or percentage readiness. The intended surface uses the same
  spatial node/edge grammar as Product / GTM rather than retaining the current stacked path composition.
- **`ThreadConversation`** — continuously mounted direction/review surface with contextual first-message
  `subjectRefs`; Product / GTM workflow Threads pin their latest staged graph immediately above the composer.
- **`WorkGraphSketch` + `workflowSketch`** — typed provisional graph projection, exact staged-work identity,
  collapsed/current/changed states, full-graph review, and the founder adoption boundary.
- **`NowComposer`** — whole-venture and selected-work scope, voice, busy/held/error states, and exact receipt.
- **Stage registry bodies** — consequence, exact product artifact, comparison, direction, and overview.
- **Thread rich items** — compact artifact, comparison, evidence, and consequence projections. The title and
  truthful open action share one header; the produced material owns the body; only recorded provenance gets
  a receipt row. Missing evidence stays visible as a quiet unavailable-source state rather than fake content.
- **`VentureMaps` + `VentureAgentWorkflow`** — one advanced Product / GTM conditional-logic canvas with Product
  truth, go-to-market action, branches, loops, founder gates, returned evidence, in-place expansion, explicit
  creation, reversible agent/capability composition, spatial workflow declaration, and handoff to scoped agent
  work. Its density and manipulability are the product; do not simplify it into a flow strip or form editor.
- **`VentureConditionalWorkflow` + `workflowAdoption`** — founder-adopted conditional graph projection and the
  feature-local mutation that creates or updates one canonical pipeline while retaining exact Work and Thread
  lineage. The projection does not advertise placement edits until those positions can be persisted.
- **`AgentPurposeDialog` + `CapabilityLogo`** — the Product / GTM composition vocabulary: provider-recognizable
  capability marks and a focused agent identity view exposing purpose, runtime, tools, authority, and exact workflow
  use before the founder begins scoped conversation.
- **`VenturePipelineLane`** — presentation-only projection of one reusable GTM pipeline through Signal,
  Pipeline, Campaign, and Outcome, including exact missing links and attached agent state.
- **`FirmFreshness`** — reconnect/offline honesty over the coherent workspace read model.

Feature primitives remain feature-local product behavior, not a request to extract a component package.
Legacy canvas node primitives are compatibility seams under the summoned map, not approved navigation or
product ontology.

## Current foundation state

### Real

- Dark-first neutral tokens in `ui/src/index.css` and their Tailwind aliases.
- A persisted 272–360px workspace rail and one adaptive center across three founder jobs.
- Work conversation with optional 420–520px visual; Product / GTM or Releases with an optional 420–520px
  contextual chat drawer.
- Venture-keyed v5 restoration with v4/v3 context migration and older selection migration.
- A docked scoped composer whose draft survives mode switching because conversation remains mounted.
- 150–200ms entry, disclosure, focus, and active-work motion with a reduced-motion settlement.
- A full Product / GTM operating graph that keeps supporting Product truth, founder-authored distribution
  motions, live market work, and returned evidence connected; shared context hands descent back to Work or
  Releases.
- Shared Base UI button/input primitives in high-consequence forms.
- Card/popover/modal elevation roles.
- Purpose-specific wall actions and configuration receipts.
- Keyboard outline and visible focus styling.
- Coherent freshness/read-only presentation, evidence-linked return briefing, and durable active-work
  control.

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

- Generalized non-bet canonical selection and full search across model, evidence, conversation, views, and work.
- Generated disposable/live/snapshot view semantics.
- Complete epistemic grammar and consequence execution across every registered work type.
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
the oversized shared vendor chunk, and warm/light compatibility styles below the dark founder shell. See
`docs/STATE.md` for the latest mechanical receipt. Do not convert historical receipts into current proof or
speculative primitives.

## Local rules

Checkable rules for this repository:

- Add or change production tokens only in `ui/src/index.css`; update the YAML values here in the same
  change.
- Never treat `design-system/styles.css` as canonical. If the package is maintained, its parity check
  must fail the process on drift, not merely print "failed" with exit code zero.
- Extend `ui/src/components/ui` before hand-rolling a repeated control state. Keep product-specific
  semantics in feature components.
- While legacy participant portraits remain, use `CrewFace`; do not create another identity system or make portraits approved navigation.
- The wall owns amber. Primary action and focus own blue. Verified active work owns green. Outcomes own none.
- Readable operating surfaces are opaque; no glass over the canvas.
- Mono is for machine material only.
- No raw font size below the decided metadata token; no essential text below AA contrast.
- No full-card far view. Semantic zoom changes the representation.
- No connection failure may leave a "Live" claim without a visible freshness qualifier.
- No generic approval verb may cross wall purposes.
- Product-owned copy names concrete work and consequences; it never exposes `bet`, `motion`, `fork`,
  `the wall`, `stage`, or `work item`. Pipeline, campaign, and outcome are approved GTM nouns. Historical component, route, storage,
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

The acceptance coverage includes 1440×900 and 1280×800 desktop layouts, 100–200% zoom, keyboard focus,
two-surface context resolution, graph descent, contextual chat, the nested release section, canonical release lifecycle and exact gates,
founder consequence, dense/empty states, stale/offline recovery, venture isolation, errors, and long content.
The complete current receipt is recorded in `docs/STATE.md`; it includes both deterministic browser journeys
and real Electron-host tests. It remains implementation proof, not evidence of outside-founder comprehension.

Refresh this record only from current code and a current render. Promote inline values and
consolidate duplicates by observed reuse; do not build a speculative component library.
