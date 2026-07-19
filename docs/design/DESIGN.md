---
status: canonical-current-code-record
refreshed: 2026-07-18
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
  - ../../ui/src/components/workspace/venture-workspace.css
  - ../../ui/src/components/workspace/workspace-index.css
  - ../../ui/src/components/workbench/workbench.css
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
consequence boundary create specificity. Agent machinery and decoration do not.

## Current-code boundary

This file records what the current UI can render; it does not turn product aspirations into proof. The
working tree has one `VentureWorkspace`: a resizable work index, `VentureHome`, a selected work stream beside
persistent registry-backed material, a docked scoped composer, and an explicitly summoned map. Removed
Now/immersive/legacy shells are not part of the current boundary.

Important incomplete capabilities remain: universal search across the canonical model, generalized
non-bet selection, synchronized saved live views and immutable snapshots, outcome-contract workflows, and
complete consequence execution. `docs/STATE.md` remains authoritative for the exact proof boundary.

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
two supported desktop sizes. The work index defaults to 256px and resizes from 208–420px. Selected exact
material is 360–540px; the narrative consumes the remaining field. Crew does not occupy a duplicate roster.

## Elevation and material

- `--shadow-card` is the resting content and composer level.
- `--shadow-pop` is the popover, outline, and transient-control level.
- `--shadow-modal` is reserved for a blocking decision surface.
- Conversation and review content are opaque. The composer alone may use restrained backdrop blur.
- Hairlines and spacing group related content before another container does.

The rail is separated by a hairline, not elevation. Do not create a speculative shadow catalog.

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
- **`VentureWorkspace`** — the sole founder shell; owns one selection, work/map mode, and composer scope.
- **`WorkspaceIndex`** — resizable persisted venture/work navigation, search, attention filter, active work,
  compact conversation context, and Settings.
- **`VentureHome`** — grouped return list for decisions, market returns, active work, and recent change.
- **`Workbench`** — selected narrative/material split, safe registry precedence, persistent material tabs,
  and the path to Map.
- **`WorkNarrative`** — the selected work's conversation projection, status, runtime receipts, and founder
  authority cue.
- **`NowComposer`** — whole-venture and selected-work scope, voice, busy/held/error states, and exact receipt.
- **Stage registry bodies** — consequence, exact product artifact, comparison, direction, and overview.
- **`VentureMaps` + `VentureSystemGraph`** — explicitly summoned generated operating graph with Whole system,
  Product, and Go-to-market views; route focus; pan/zoom; and explicit handoff back to real work.
- **`FirmFreshness`** — reconnect/offline honesty over the coherent workspace read model.

Feature primitives remain feature-local product behavior, not a request to extract a component package.
Legacy canvas node primitives are compatibility seams under the summoned map, not approved navigation or
product ontology.

## Current foundation state

### Real

- Dark-first neutral tokens in `ui/src/index.css` and their Tailwind aliases.
- One 52px chrome line, a persisted 208–420px work index, and one adaptive center.
- `VentureHome` at rest; selected work stream and 360–540px exact-material panel together.
- Persistent material tabs backed by the open stage registry and safe consequence precedence.
- A floating scoped composer aligned to the narrative rather than the material panel.
- 150–200ms entry, disclosure, focus, and active-work motion with a reduced-motion settlement.
- An explicitly summoned whole-system operating graph that keeps Product capacity, paths to market, market
  work, and returned evidence connected; route focus hands descent back to work.
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

The acceptance browser coverage includes the 1440×900 desktop, 100–150% dense-map zoom, keyboard focus,
workbench/graph descent, founder consequence, dense/empty states, stale/offline recovery, venture isolation,
errors, and long content. On 2026-07-18 the complete local command passed: Brain 787/787, UI 484/484,
token parity, firm browser 5/5, and Atlas browser 3/3. This remains a local browser-harness receipt, not a
packaged Electron end-to-end receipt or evidence of outside-founder comprehension.

Refresh this record only from current code and a current render. Promote inline values and
consolidate duplicates by observed reuse; do not build a speculative component library.
