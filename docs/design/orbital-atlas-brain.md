# Orbital Atlas — brain build spec (2026-07-15)

Execute this to close the five brain gaps recorded at the bottom of `docs/design/orbital-atlas-build.md`
("Gaps" section) — the honest holes where the Orbital Atlas UI already renders a fallback because the
brain can only project what exists. This file adds the data-model design, route surface, and acceptance
criteria for each. It extends the build spec's program; read that file and `docs/design/orbital-atlas.md`
first for the direction and the hand. The UI half is done and waiting: each package names the exact
`ui/src/components/atlas/` consumer and the honest-gap fallback it retires.

## Read before writing code

- `docs/FIRM-SPEC.md` — the object model and, decisively, the anti-cage doctrine ("Fatal modes" #5
  "Machinery creep"; "New anti-cage guards"). Every package here walks a line the guards patrol.
- `brain/test/firm/anti-cage.test.mjs` — the guards are executable. Guard B forbids `kind`/`status`/`stage`
  on a bet; Guard D forbids `placement`/`health`/`score`/`stage`/`status` in current architecture truth and
  forbids any executable-verb edge taxonomy; Guard E forbids `count`/`score`/`rate`/`total`/`aggregate` keys
  on outcomes and wall items. **A package that adds a forbidden field fails these before it fails review.**
  The design below routes around them deliberately; where it cannot, the package says so and stops.
- The owning code, per package: `venture-store.mjs` (collections, revisioning, export/import),
  `architecture.mjs` + `architecture-proposals.mjs` + `architecture-campaign.mjs` (semantic kernel, proposal
  seam, the one campaign-activation orchestration), `architecture-projection.mjs` (the read-only join the
  atlas consumes), `bet.mjs` (the envelope), `work-loop.mjs` + `work-loop-tools.mjs` (the drive and its
  tools), `active-drives.mjs` (the process-local drive registry), `wall.mjs` (park/decide), `product-change.mjs`
  + `effect-executors.mjs` + `message-send.mjs` (the effect supply side).

## Invariants (hold across every package)

- **Durable records carry receipts (FIRM-SPEC "The one loop", "the consequential records").** Anything
  new that a founder can later read back is written through the venture store's revisioned CAS with a
  receipt, exactly as `applyArchitectureMutations` stamps `revisions[]` and `wall.decide` stamps its
  resolution. No parallel store, no second write path racing an existing one.
- **Positive, negative, and zero outcomes are equally first-class.** Nothing here may introduce a
  success-shaped field, a health/score, or a progression that reads a zero outcome as failure. A stage that
  "expected a signal" and got silence is as real as one that returned a reply.
- **Nothing outward without the founder's hand (rail #1, #3).** No package mints outward capability, and
  none stages a real bet, campaign, or send as a side effect of assembly. Proposal → founder acceptance is
  the only path from ghost to real.
- **Brain services stay under 500 LOC, split by domain.** `architecture.mjs` is already dense; new
  behavior lands in a sibling (a new `*-stages.mjs`, `*-assembly.mjs`) rather than growing the kernel.
  Guard "Smallness" fails a new store or operational role until FIRM-SPEC is amended.
- **Tests mirror `brain/test/firm/` patterns.** Injectable `{ root }` options, `createVenture` fixtures,
  serial execution. Each package adds its tests beside the file it changes.
- **Never fabricate data the executor/drive did not produce.** Every field the UI renders traces to a real
  write. Absence is rendered as absence (the gate inspector's "Gaps" list is the reference pattern), never
  as an invented count, timing, or reasoning step.

---

## Package B1 — a canonical workflow projection per bet

**Gap (verbatim):** "The venture store has no canonical workflow-stage graph, planned stage counts,
expected signal dates, or per-stage run cost/duration. Orbit machinery and Dive can project only real
staged artifacts, bet events, wall items, and outcomes; they must not reproduce the mockups' richer
stage/count copy as if it were durable truth."

**The conflict this package resolves, stated plainly.** The mockups want "typed stages, counts, expected
signal dates, per-stage cost/duration" as durable per-bet truth. FIRM-SPEC forbids exactly that: a bet has
"no host-owned substantive schema, kind, or stage" (Guard B literally greps `bet.mjs` for `stage:`), and
architecture truth "stores no placement, health, score, **stage**, or generic status" (Guard D). A durable
`stages[]` collection with typed stages and counts **is** the stage cage this rebuild deleted
(`object-funnel.mjs`, `step-runners.mjs` — see the deletion ledger). Do not add it. Blending the mockup's
richer copy into a durable store is the machinery-creep fatal mode.

**What is real, and therefore projectable.** The workflow of a bet is already fully recorded, just not as a
"stage graph": `bet.events[]` (the bounded event log — `bet_forked`, `staged`, `stage_outward_classified`,
`parked`, `asked`, `speak`, `tool_started`), `bet.staged[]` (each artifact with `stagedAt`/`updatedAt`,
`ownerRefs`, `configurationRevision`), the venture's `decisions[]` wall items joined by `betId`/`workRef`,
and `outcomes[]`. `atlasWorkflowProjection.ts` already derives an ordered stage list from exactly these.
The gap is not missing data — it is that the derivation lives only in the UI, so Dive and the machinery
glyph each re-derive it slightly differently and neither can cite per-stage cost/duration the drive already
knows.

**Design: promote the derivation to the brain as a pure projection, and let the drive record the real
per-step machinery it already measures.** Two moves, no new store:

1. **A `workflow-projection.mjs` sibling** (new file, under 200 LOC) exporting
   `projectBetWorkflow(bet, { wallItems, outcomes })` and `machineryCountsForBet(...)` — the brain-side
   twin of `atlasWorkflowProjection.ts`, returning `{ stages: [{ id, label, kind, state, teammateRef,
   at, cost, durationMs, workRef }], counts }`. `kind` is a derived, open descriptor (`"opened"`,
   `"staged"`, `"gate"`, `"outcome"`, `"settled"`) computed from the record type — **never persisted onto
   the bet**, so Guard B stays green. `state` is `done`/`gate`/`queued` derived exactly as the UI does today.
   This is a read model, like `architecture-projection.mjs`; it owns nothing.

2. **Enrich `bet.events[]` at the source so per-stage cost/duration is real, not invented.** `work-loop.mjs`
   already tracks `stepCount` and `spentUsd` on `currentWork` and calls `appendEvent` on every tool start
   and text beat. Extend `appendEvent`'s event payload (in `work-loop-tools.mjs`) to carry the *already-known*
   `stepIndex` and, when the adapter reports cost (`selection.adapter.costReporting === "usd"`), the
   incremental `costUsd` and wall-clock `durationMs` for that beat. These are receipts of what the drive
   actually did — the same discipline as `runtimeReceipt`. Where the adapter does not report usd cost, the
   field is **absent**, and the projection surfaces absence (the UI already renders `machineryCountsForBet`
   as `.filter(count > 0)`; extend that honesty to cost/duration).

   "Expected signal dates" and "planned stage counts" are **not** produced by this package — they are a
   forecast, not a receipt, and FIRM-SPEC's market "speaks in language or it is silent — no aggregate
   numbers." If a founder-authored expected-return window is wanted later, it belongs on the campaign's
   existing `measurement.window` (already a real field on the campaign element), joined by the projection —
   not minted per stage. This package projects `measurement.window` through when the bet is a campaign's
   governing bet, and otherwise renders no expected date.

**Revisioning.** None is added. The projection is derived on read from records that already revision
(events are appended under the bet's own CAS write in `setVentureDoc`; the bet document is the revisioned
unit). Export/import already round-trips `bets` including `events`/`staged` (`VENTURE_COLLECTIONS`), so the
workflow travels with the venture for free — verify a round-trip test asserts it.

**Route surface.** No new route. The lens/atlas projection endpoint that already serves bets to the UI
attaches `workflow` and `machineryCounts` per bet by calling `projectBetWorkflow`. (Confirm the exact
projection route in `lens-routes.mjs`/`architecture-projection.mjs` and enrich there; do not add a
per-bet workflow endpoint the UI would have to poll separately.)

**Acceptance.** `npm --prefix brain test` green, including: a new `workflow-projection.test.mjs` asserting
(a) a forked→staged→parked→released→outcome bet projects the ordered stages with `state` transitions
matching `atlasWorkflowProjection.ts`; (b) a beat whose adapter reported usd cost carries `costUsd`/`durationMs`
and one whose adapter did not carries neither (absence, not zero); (c) `bet.mjs` still writes no
`kind`/`status`/`stage` key (anti-cage Guard B unchanged). The UI can now truthfully render the machinery
glyph counts and the Dive stage chain from a single brain projection instead of two divergent client
derivations; the fallback in `atlasWorkflowProjection.ts` / `AtlasMachineryGlyph.tsx` that reconstructs
stages client-side is retired in favor of consuming `bet.workflow`, and Dive gains real per-stage cost/duration
where the adapter supplied it (`AtlasBetWorkflow.tsx` stage `<small>` shows the receipt, or nothing).

---

## Package B2 — the drive→stage causal join

**Gap (verbatim):** "Active drives identify the teammate and bet, not the exact workflow stage. Dive cannot
place a teammate presence tag on a specific running stage until that causal join exists."

**What exists.** `active-drives.mjs` holds a process-local registry keyed by `driveId`, each entry carrying
`{ ventureId, teammateRef, betId, runtime, startedAt, architectureRevision }` — teammate + bet, exactly as
the gap says. `listActiveDrives(ventureId)` is the public read. The drive's own progress lives in
`work-loop.mjs`'s `currentWork` (`stepCount`, the last `appendEvent` beat) and on the bet's `events[]`.

**Design: publish the drive's current beat, joined to the projected stage — process-local, never durable.**
The running stage is a *live* fact about a process, not a durable venture record; it must not become a
persisted field on the bet (that would be a status machine — Guard B). So:

1. Add `currentStage` (open string) and `lastBeatAt` to the `active-drives.mjs` entry, plus a
   `noteDriveBeat(driveId, { stage, at })` the work loop calls from its `onToolStart`/`onText` seam
   (where it already calls `appendEvent`). `stage` is the same derived `kind`/`label` `projectBetWorkflow`
   produces for the beat that just landed — computed from the event, not stored on the bet. `publicDrive`
   exposes `currentStage`/`lastBeatAt`.

2. The atlas/lens projection joins `listActiveDrives(ventureId)` onto the projected workflow by
   `(betId, currentStage)`: a stage whose id matches an active drive's current beat carries
   `runningTeammateRef` and `since`. When no active drive matches (the common case — drives are
   process-local and lapse on restart), the stage carries neither, and the UI renders no presence tag.
   This is the same honesty as the gate inspector: present when supplied, absent otherwise.

**Invariant watch.** The join is derived on read from a volatile registry; nothing about "which stage is
running" is ever written to the venture store. A brain restart correctly loses the presence tag (the drive
is gone) without losing any durable stage/receipt — matching `active-drives.mjs`'s existing doctrine ("a
provider drive cannot survive a brain restart").

**Acceptance.** `npm --prefix brain test` green, including a `active-drives.test.mjs` case asserting a
beat noted on a live drive surfaces `currentStage`/`runningTeammateRef` in the projection, and that
`finish()` / a fresh process drops it (no durable residue on the bet). The UI can now place the "teammate
here now" tag on the specific running stage in Dive (`AtlasBetWorkflow.tsx` / `DiveSurface.tsx`),
retiring the fallback that could only show the teammate on the bet as a whole.

---

## Package B3 — proposal atomicity for whole multi-motion systems

**Gap (verbatim):** "Architecture proposals can safely stage intent, systems, motions, concepts, and
descriptive connections. A new campaign currently requires an already-existing governing bet, so one
proposal cannot atomically stage the mockup's five new campaigns without either creating real bets before
acceptance or adding a compensated founder-accept orchestration. Neither is fabricated in this build."

**The real constraint.** `architecture.mjs`'s `validateElement` requires every `campaign` element to name
an existing `governingBetId` (`sets.betIds.has(...)`). `startArchitectureCampaign` is today's only path
that satisfies this — it mints a real bet *then* creates the campaign element, compensating on failure.
That is per-motion and imperative; it cannot ride inside a single agent proposal, because a proposal is a
list of `ARCHITECTURE_OPERATIONS` validated with `validateArchitectureProposalOperations` (no bet
creation). So the signature "3 motions · 5 campaigns" ask cannot be one staged, gated ghost today.

**Design: a founder-acceptance orchestration that creates governing bets in dependency order, atomically,
with one receipt — the plural of `startArchitectureCampaign`, not a new store.** Add
`architecture-system-assembly.mjs` (new file, under 300 LOC):

1. **Proposal shape.** The proposer stages the system as ordinary semantic operations
   (`create-element` for systems, motions, and campaigns; `create-connection` for the compound wires),
   **but campaign elements carry a `governingBetSeed` (open-text intent) instead of a `governingBetId`.**
   Extend `validateArchitectureProposalOperations` alone (not the founder mutation kernel) to accept a
   campaign whose `governingBetId` is absent *when* a `governingBetSeed` is present — proposals are ghosts,
   and a ghost campaign legitimately has no real bet yet. The founder-facing mutation kernel's invariant
   (`governingBetId` must resolve) is untouched, so nothing real is ever half-built.

2. **Atomic acceptance.** `acceptSystemProposal({ ventureId, proposalId, actor }, options)`:
   - Founder-only (`actor.authority === "founder"`), CAS-guarded on the current architecture revision,
     exactly like `decideArchitectureProposal`.
   - In dependency order (systems → motions → campaigns), for each campaign it mints its governing bet via
     `createBet`/`fork` (reusing `startArchitectureCampaign`'s bet-creation logic), then rewrites that
     campaign operation's `governingBetSeed` into a real `governingBetId`.
   - Applies the whole rewritten operation list through **one** `applyArchitectureMutations` call — one
     revision, one receipt, `source: "proposal-system-acceptance"`, `proposalId` stamped. Because it is one
     mutation, `validateArchitecture` runs once over the final document: either the entire system validates
     and lands, or it throws and **every minted bet is compensated** (deleted, as `startArchitectureCampaign`
     already deletes its one bet on failure). Nothing real survives a rejected acceptance.
   - Stamps the proposal `accepted`/`appliedRevision` exactly as `decideArchitectureProposal` does.

3. **Nothing runs.** The minted bets are governing bets with no staged work and no drive — they are the
   real anchors the campaigns govern, not outward acts. Outward still stops at the wall. This is the same
   posture `startArchitectureCampaign` already ships; this package only makes it plural and atomic.

**Route surface.** Extend `architecture-routes.mjs`: `POST /api/ventures/:id/architecture/proposals/:id/accept-system`
(founder-gated) → `acceptSystemProposal`, returning `{ architecture, revision, receipt, bets, campaigns }`.
The agent proposal path (`POST .../proposals`) already exists; system proposals go through it unchanged
(the only difference is `governingBetSeed` in the operations, now accepted by the preview validator).

**Acceptance.** `npm --prefix brain test` green, including an `architecture-system-assembly.test.mjs`
asserting: (a) an agent can propose 3 motions + 5 campaigns in one call and the proposal stays `pending`
with zero real bets created; (b) founder acceptance creates exactly five governing bets and one architecture
revision/receipt, campaigns resolve to real `governingBetId`s, and `validateArchitecture` passes; (c) a
proposal whose Nth campaign is malformed compensates all previously minted bets and leaves architecture at
its base revision (atomicity); (d) the anti-cage guards are unchanged (no campaign lifecycle/status store).
The UI (`useArchitectureProposals.ts` + `architectureProposalProjection.ts` driving Package 4's propose
moment) can now stage and accept the mockup's whole multi-motion system through one real proposal, retiring
the Gaps note that "one proposal cannot atomically stage the mockup's five new campaigns."

---

## Package B4 — a structured proposal-assembly progress stream

**Gap (verbatim):** "The work loop has no structured proposal-assembly progress stream. The founder ask and
teammate response remain real conversation records while proposal state comes from the architecture proposal
endpoint; the UI may show validated operations as they arrive, but not invented reasoning steps or timings."

**What exists.** During a propose drive, the teammate calls `read_venture_architecture` then
`propose_architecture_change` (`architecture-work-loop-tools.mjs`). The founder ask and the teammate's
narration are real `conversation` records (`appendConversationMessage`). But the *assembly itself* — each
semantic operation validated and staged — arrives only as the final proposal blob at the endpoint. The
UI's step-tracker (the 2026 "live step-tracker" pattern; DESIGN-TASTE.md) has nothing real to render
between "ask sent" and "proposal ready", so it must either spin (banned) or invent steps (banned).

**Design: emit a typed assembly event per validated operation as it lands, on the real record that already
streams.** The proposal is validated as a whole by `validateArchitectureProposalOperations` before it is
written. Move the per-operation typing to the point of validation:

1. In `architecture-proposals.mjs`, have `validateArchitectureProposalOperations` (or a thin wrapper the
   propose tool calls) return, alongside its boolean, a list of `assemblyEvents`: one per operation, typed
   `{ op, role?, elementId?, label, validated: true, at }` — a *receipt that this operation validated
   against current truth*, not a reasoning step and not a timing the model made up. `at` is the real
   wall-clock stamp of validation.

2. `propose_architecture_change` (in `architecture-work-loop-tools.mjs`) appends these as a single
   `kind: "proposal-assembly"` conversation message (or a small ordered field on the teammate message it
   already writes), so they ride the conversation stream the UI already polls — no new store, no new
   endpoint. The founder ask and teammate response stay exactly as they are; this adds the middle the
   step-tracker needs, and every entry is a validated operation, never invented prose.

**Invariant watch.** Respect what the conversation already records (the gap's own instruction): the ask and
the response are untouched real records; assembly events are appended, not substituted, and each is a
provable validation receipt. No timing the executor did not measure; `at` is the validator's own stamp.

**Acceptance.** `npm --prefix brain test` green, including an assertion in the architecture-proposals /
work-loop-tools tests that a propose call emits one validated assembly event per operation, in order, each
tied to a real operation, with a real `at`, and that a proposal with an invalid operation emits no
"validated" event for it (absence). The UI's propose step-tracker (`useArchitectureProposals.ts` and the
Package 4 propose surface) renders real validated-operation progress as clusters materialize, retiring the
Gaps note that the UI "may show validated operations as they arrive, but not invented reasoning steps."

---

## Package B5 — outward-effect consequence metadata (the supply side)

**Gap (verbatim):** "A held wall effect does not guarantee from-address, cost, or reversibility metadata.
The gate inspector shows those fields only when the real effect supplies them and otherwise names the
missing consequence detail."

**What exists — and it is the whole contract.** `DiveGateInspector.tsx`'s `missingConsequenceDetails`
already reads `effect.from`/`fromAddress`/`sender`, `effect.cost`/`costUsd`, and
`effect.reversible`/`reversibility`, renders each when present, and lists the rest under "Gaps." The UI
side is done and correct. This package is purely the **supply side**: have each real effect executor stamp
the fields it genuinely knows onto the effect *at park time*, so the inspector has real data to show — and
never stamp a field the executor cannot honestly supply.

**Design: enrich the effect where it is staged, from what the transport already knows.** Per executor:

1. **Message/send** (`stage_outward` → `wall.park`; executed by `effect-executors.mjs`/`message-send.mjs`).
   `message-send.mjs` already reads `effect.from` and knows the connected Gmail account, and a send is
   not reversible. When `stage_outward` parks a message effect, stamp:
   - `fromAddress`: the connected account's address when a Gmail credential is banked (resolvable via the
     same `getCredential` path `resolveSendTokenSync` uses); **absent** when no account is connected — the
     inspector then correctly shows "From address was not supplied."
   - `reversible: false` with `reversibility: "A sent message cannot be unsent."` — this is a true property
     of the send, safe to assert.
   - `costUsd`: **absent.** A Gmail send has no per-send dollar cost the transport measures; do not invent
     one. Absence is the honest answer and the inspector renders it as a gap.

2. **Product-change / deploy** (`product-change.mjs` → `park`; executed via `applyProductBetChange`).
   Stamp onto the parked effect:
   - `destination`: the `branch` + `baseCommit` the effect already carries (the real target of the apply),
     surfaced as the inspector's from/destination line.
   - `reversible: true` with `reversibility: "Applied as a reviewable diff on <branch>; revertable."` for a
     product-change apply; a `kind: "deploy"` effect is `reversible: false` (a deploy is the heavier act the
     wall already double-authorizes). These are true of the respective effects.
   - `costUsd`: **absent** unless a real build/deploy cost is measured; do not fabricate.

**Invariant watch.** Every stamped field is a property the executor can actually supply from a real
transport fact (the connected account, the target branch, the irreversibility of a send). No field is
guessed. The rule the gap states — "shows those fields only when the real effect supplies them and
otherwise names the missing consequence detail" — is honored by *supplying only the true ones and leaving
the rest absent*, which the UI already handles.

**Acceptance.** `npm --prefix brain test` green, including cases in `effect-executors-message.test.mjs` /
`product-change.test.mjs` / `wall.test.mjs` asserting: a parked message effect with a connected account
carries `fromAddress` and `reversible: false` and **no** invented `costUsd`; the same effect with no
connected account carries no `fromAddress` (absence); a parked product-change effect carries `destination`
and `reversible: true`; a `deploy` effect carries `reversible: false`. The gate inspector
(`DiveGateInspector.tsx`) now renders real from-address/destination and reversibility for the common
effects and honestly lists only the genuinely-missing detail, retiring the Gaps note that "a held wall
effect does not guarantee from-address, cost, or reversibility metadata."

---

## Cross-package acceptance

`npm --prefix brain test` green across all five (target: the existing ~520 brain tests plus the new cases,
no regressions). No new venture-store collection, no new operational role, no bet/architecture status or
stage or score field — `brain/test/firm/anti-cage.test.mjs` passes unchanged. Then the UI packages (build
spec Packages 2–4) consume the new projections and the retired fallbacks come out, surface by surface, as
each package's acceptance line names.
