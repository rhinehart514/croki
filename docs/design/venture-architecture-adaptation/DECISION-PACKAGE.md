# Drover venture-architecture adaptation

> **Selected-decision receipt — 2026-07-15.** The repository audit and alternatives are preserved;
> present-tense implementation absences and line citations describe the pre-Atlas tree. The selected
> contract is [`LIVING-VENTURE-ATLAS-SPEC.md`](LIVING-VENTURE-ATLAS-SPEC.md), while current proof
> lives in [`../../STATE.md`](../../STATE.md).

> **Decision update — 2026-07-15:** Jacob selected the composed Living Venture Atlas approach after comparative UX research. [`LIVING-VENTURE-ATLAS-SPEC.md`](LIVING-VENTURE-ATLAS-SPEC.md) supersedes this package's stricter ontology and UX recommendation where they differ. This package remains authoritative for the repository audit, conflict receipt, alternatives, retained product physics, and cited implementation evidence.

**Decision date:** 2026-07-15  
**Founder:** Jacob  
**Status:** recommendation and reversible UX proof; no production rewrite  
**Observed authority cutoff:** the dirty worktree inspected on 2026-07-15

## Decision

Adapt Drover around one durable **venture architecture document** per venture. It contains independently addressable product loops, reusable GTM systems, repeatable motions, bounded campaigns, and evidence annotations. Existing bets remain the uncertain claims, existing staged work and wall receipts remain releases, and existing outcomes remain returned reality. The document is revisioned through the existing local venture persistence seam, projected on the existing canvas, included in teammate context, and exported with the venture.

This is the smallest model that makes the venture legible before its agent machinery while still changing execution. It is intentionally one document, not four new stores; four founder-predictable records, not an open generic graph; and one projection, not a parallel canvas authority.

The current “three nouns only” doctrine was a successful local correction against a compiled workflow/object-graph cage. Its enduring rails survive. Its blanket ban on durable venture structure does not: live founder direction requires structure that bets cannot truthfully supply.

## 1. Current truth

### Built and connected

- **One local, venture-scoped persistence seam exists.** The store names venture collections in one allowlist and routes reads/writes through a venture-specific directory (`brain/src/firm/venture-store.mjs:42-68`, `brain/src/firm/venture-store.mjs:128-155`). The manifest binds a venture to a real repository (`brain/src/firm/venture-store.mjs:74-91`).
- **The transferable venture already includes every allowed collection.** Export scans `VENTURE_COLLECTIONS`; import restores each document and known singleton (`brain/src/firm/venture-store.mjs:188-229`). Transfer strips machine state, validates collection names and venture scope, and requires destination-repository rebinding (`brain/src/firm/venture-transfer.mjs:88-117`, `brain/src/firm/venture-transfer.mjs:124-183`, `brain/src/firm/venture-transfer.mjs:185-238`).
- **Bets are durable, open, and minimal.** Their stored envelope is identity, venture, intent, lineage, participant/configuration provenance, open refs/evidence/staged work, join key, dates, and founder-ending receipt (`brain/src/firm/bet.mjs:67-90`). Position is derived from ending and wall state (`brain/src/firm/bet.mjs:125-138`).
- **Exact work is stable and addressable.** Staging revises an existing work identity or appends a new one, preserving attribution and configuration revision (`brain/src/firm/work-loop-tools.mjs:202-257`). Outward work uses an explicit work reference when possible and refuses to infer lineage from chronology when multiple origins exist (`brain/src/firm/work-loop-tools.mjs:263-330`).
- **The wall is a real authority boundary.** A parked item carries venture, bet, exact work, purpose, configuration revision, effect, and decision fields (`brain/src/firm/wall.mjs:89-135`). Only the founder request boundary can decide; release requires presence, and deploy requires a second founder act (`brain/src/firm/wall.mjs:166-236`). The outward capability exists only during execution (`brain/src/firm/wall.mjs:239-264`).
- **Outcomes are first-class durable records with honest attribution.** Provider identity deduplicates returns, join keys link only to a bet, and unmatched reality stays unattributed (`brain/src/firm/market.mjs:39-78`, `brain/src/firm/market.mjs:86-110`). Recording an outcome appends a reference to the bet and parks a non-blocking review item; it does not claim causality (`brain/src/firm/market.mjs:113-173`).
- **Repository truth and runtime work are coupled to the bound venture.** The first direction requires exact repository grounding and the runtime working directory is the venture repository (`brain/src/firm/work-loop.mjs:166-188`, `brain/src/firm/work-loop.mjs:270-281`).
- **Selection already changes execution.** Direction can target participants, a bet, or exact work; routes validate venture ownership before dispatch (`brain/src/firm/work-routes.mjs:97-156`). The runtime brief explicitly tells the teammate about the selected bet/work context (`brain/src/firm/work-loop.mjs:131-188`). Conversation persists the same targets (`brain/src/firm/conversation.mjs:29-34`, `brain/src/firm/conversation.mjs:49-110`).
- **The lens is a true projection.** It reads configuration, crew, bets, outcomes, wall items, and placement; only placement is written (`brain/src/firm/lens.mjs:32-90`, `brain/src/firm/lens.mjs:93-123`).
- **The current UI is one continuous desktop workbench.** `FirmApp` composes conversation and canvas without a route change and keeps one selection across both (`ui/src/FirmApp.tsx:50-66`, `ui/src/FirmApp.tsx:183-274`). Selection reaches participant, bet, or exact work (`ui/src/components/firm/directionTarget.ts:1-42`).
- **Semantic zoom, focus, wall, outline, and stale behavior exist.** The lens supplies far/middle/near representations, focus scenes, deterministic Escape broadening, the outline, and stale write holds (`ui/src/components/lens/FirmLens.tsx:98-205`, `ui/src/components/lens/FirmLens.tsx:215-296`; `ui/src/components/lens/lensScene.ts:1-7`).
- **Return briefing is derived, not a second authority.** It prioritizes wall items, new outcomes, changed bets, and configuration receipts, and labels a joined outcome without claiming causality (`ui/src/lib/return-brief.ts:42-143`).

### Built but hidden behind the current primary model

- Firm configuration already shapes participant presentation, organization, runtime, context, memory, coordination, activation, evaluation, budget, and authority (`ui/src/types.ts:12-59`; `docs/STATE.md:17-49`).
- Provider drives, costs, configuration revision, contributor attribution, worktrees, product diffs, staged artifacts, exact wall items, and decision receipts are durable and inspectable but subordinate to teammate/bet projection (`docs/STATE.md:62-71`, `docs/STATE.md:92-127`).
- Product truth and host-backed capabilities can be placed on the canvas, but placement creates no durable architecture meaning (`docs/STATE.md:100-109`; `ui/src/components/lens/firmLensGraph.ts:56-68`).
- The UI can project arbitrary attached work into readable workpieces, even though it lacks architecture semantics (`ui/src/components/lens/workyardProjection.ts:144-251`).

### Documented but unbuilt or not proven

- The portfolio transfer surface exists behind an outside-founder proof gate; cross-machine rebinding is not proven (`docs/STATE.md:128-131`, `docs/STATE.md:171-180`).
- Multi-participant coordination is mechanically covered but has not completed a real provider-selected second-participant pass (`docs/STATE.md:173-176`).
- Always-on work has not been left on a real venture and returned a useful bounded founder queue (`docs/STATE.md:177`).
- No outside founder has completed the loop without intervention, and no real attributable market outcome has yet changed the next bet (`docs/STATE.md:179-181`).
- Product/GTM architecture, reusable systems, repeatable motions, and campaigns are not current durable records or current lens projections. This is observed absence, not a claim that historical files never modeled similar nouns.

### Historical and superseded

- `docs/OPEN-CANVAS-SPEC.md` and `docs/EXPERIMENT-MACHINE-SPEC.md` are explicitly superseded (`docs/FIRM-SPEC.md:8-14`; `docs/STATE.md:5-9`).
- The retired object graph, executable graph, session machine, woven projection, boards/plans, goal stores, and storage sprawl are explicitly on the deletion ledger (`docs/FIRM-SPEC.md:206-236`).
- `docs/design/one-canvas.md`, `docs/design/gtm-engine-canvas.md`, `docs/design/emergent-motion-engine.md`, `docs/design/ide-done-right-ia.md`, `docs/gtm-graph/`, and `docs/production-direction/` are evidence of failure modes and prior mechanisms, not authority.
- The capability-density causal canvas proved that evidence, explanations, real artifacts, and returns can share one spatial model, but it used generic nodes, a permanent inspector, confident “produces/tested by” edges, and tiny card content (`docs/design/capability-density/01-causal-canvas.html:14-49`). Those are useful warnings, not a schema.

### Prohibited by current authority

- Founder-facing language is restricted to teammate, bet, outcome, fork, the loop, the canvas, and the harness (`docs/FIRM-SPEC.md:38-45`).
- A bet may not gain a substantive schema, kind, or stage (`docs/FIRM-SPEC.md:55-70`).
- The canvas is currently defined as a projection of participants, bets, capabilities, wall, and outcomes; placement is its only authority (`docs/FIRM-SPEC.md:110-118`).
- Host structure for bet meaning, signals, substantive vocabulary, and aggregate market measures is called a regression (`docs/FIRM-SPEC.md:165-185`).
- Any new work noun, required bet field, stage, taxonomy, or fragmented configuration surface is currently classified as machinery creep (`docs/FIRM-SPEC.md:187-198`).
- Current static guards forbid bet kind/status/stage and scoreboard-shaped outcome fields, and enforce a source-file ceiling (`brain/test/firm/anti-cage.test.mjs:99-140`, `brain/test/firm/anti-cage.test.mjs:181-237`, `brain/test/firm/anti-cage.test.mjs:239-287`).

### Newly requested by live founder direction

This prompt is the current founder authority. It requires product architecture, GTM systems, motions, campaigns, campaign bets, releases, outcomes, pressure, and founder judgment to become legible and operational before teammate machinery. It also explicitly authorizes reconsidering the three-noun doctrine and anti-cage tests while preserving the wall, venture isolation, local-first transfer, truth boundaries, exact work, taste, runtime neutrality, outcome lineage, placement-only canvas authority, product-agnostic language, desktop scope, accessibility, and honest freshness.

### Unproven

- Whether founders can predict “system,” “motion,” and “campaign” without explanation.
- Whether the proposed architecture context materially improves teammate work rather than adding prompt bulk.
- Whether a real outcome can change the founder’s architecture judgment without encouraging false causal stories.
- Whether the default composition reaches three-second comprehension outside Jacob.
- Whether one document remains usable at dense multi-motion scale.
- Whether repeated use accumulates better decisions than Miro + agents. Deterministic tests and this prototype do not prove those claims.

### Dirty-worktree overlap

The worktree already modifies `docs/FIRM-SPEC.md`, `docs/STATE.md`, `PRODUCT.md`, `DESIGN.md`, `docs/design/DESIGN.md`, the venture store, bet, lens, work loop, wall, market, MCP, routes, UI root, UI types, lens projection/components, composer, return brief, CSS, and related tests. Those are exactly the production files the adaptation would change. No production edit is safe in this pass. The only new work is isolated under `docs/design/venture-architecture-adaptation/`.

## 2. Strategic conflict receipt

### `docs/FIRM-SPEC.md`

The conflict is direct:

1. The spec says zero new founder-facing nouns and allows supporting records only when they do not compete as work nouns (`docs/FIRM-SPEC.md:40-43`). Live direction requires system, motion, and campaign to be founder-predictable and operational.
2. The spec makes a bet the unstructured unit for an ICP, channel push, message, price, page, or product diff (`docs/FIRM-SPEC.md:55-64`). Live direction distinguishes a persistent reusable system, a repeatable actor-to-value motion, a bounded campaign, and the uncertain bet inside that campaign. Collapsing them into “bet” destroys those distinctions.
3. The spec defines product and GTM unity as the absence of two systems (`docs/FIRM-SPEC.md:62-64`). Live direction requires coupled product and GTM architecture, not their absence.
4. The lens is specified as teammate/bet-first (`docs/FIRM-SPEC.md:112-118`). Live direction explicitly removes teammates from the far-view center.
5. “No new noun/store” is a static guard (`docs/FIRM-SPEC.md:345-360`). The recommendation must amend this guard before implementation.

What endures is the reason beneath the prohibition: no lifecycle cage, exhaustive taxonomy, compiled workflow, parallel store, or host-owned strategy. The prohibition itself was local; the rails are durable.

### `PRODUCT.md`

- The product language section names venture, teammate, bet, outcome, fork, and wall only (`PRODUCT.md:20-37`). It must add system, motion, and campaign, and define product loop as a canvas structure rather than a universal work noun.
- The core experience currently says far view shows who is working and bets in motion (`PRODUCT.md:39-51`). The default must instead show venture intent, product value loop, active motions, campaigns applying pressure, wall-held releases, and returned reality.
- The open-domain invariant forbids closed values that classify bets or market speech (`PRODUCT.md:63-68`). The recommendation preserves that invariant: architecture record kinds are few product concepts, not bet kinds; evidence basis is a safety grammar, not market classification.

### `DESIGN.md`

- Current doctrine correctly says Drover does not win by showing agents or activity (`DESIGN.md:52-72`), but the current broad canvas still centers teammate presence and bets (`DESIGN.md:123-145`). Live direction changes the far and middle representations.
- Current attention states are return, bet, teammate, wall, and broad canvas (`DESIGN.md:74-128`). Architecture, motion, and campaign focus must join these as semantic altitudes on the same surface.
- Current language explicitly prohibits goal and parallel product models (`DESIGN.md:267-275`). A desired venture change and campaign observation contract now need narrow, truthful representation. They must not become scoreboards or workflow stages.
- The strongest design rails remain intact: return-first comprehension, selection as supervision, proof near the claim, semantic zoom, no permanent inspector, visible epistemic grammar, opaque surfaces, settling motion, stale honesty, and keyboard outline (`DESIGN.md:31-50`, `DESIGN.md:129-170`, `DESIGN.md:195-265`, `DESIGN.md:299-334`).

### Anti-cage tests

- Keep the guard against bet kind/status/stage (`brain/test/firm/anti-cage.test.mjs:99-140`). Architecture does not change a bet’s required envelope.
- Keep the no-scoreboard guard but narrow it to founder-facing universal scoring; campaign observation contracts may contain founder-chosen quantities without turning outcomes into sentiment or health (`brain/test/firm/anti-cage.test.mjs:181-237`).
- Replace “adding a noun/store fails” with structural limits: at most one architecture collection, one singleton current document, no campaign status/stage, no generic edge registry, no architecture import into wall authority, and no second projection store. The source-file ceiling remains but must be deliberately rebaselined if one domain and one route file are added (`brain/test/firm/anti-cage.test.mjs:239-287`).
- Keep the founder-register guards against fixed journey skeletons and machinery language (`brain/test/anti-cage-founder-register.test.mjs:57-68`). Add allowed product language only after product authority changes.

### Current persistence and lens

- `VENTURE_COLLECTIONS` has no architecture collection and rejects unknown collections (`brain/src/firm/venture-store.mjs:42-52`, `brain/src/firm/venture-store.mjs:132-154`). Transfer also rejects unknown collections (`brain/src/firm/venture-transfer.mjs:124-145`). A production slice must change both deliberately.
- Lens projection reads no architecture and creates only crew, bet, and capability nodes (`brain/src/firm/lens.mjs:70-90`; `ui/src/components/lens/firmLensGraph.ts:11-69`).
- Edges represent configured participant relationships, participant-to-bet contribution, and forks only (`ui/src/components/lens/firmLensGraph.ts:72-114`). Architecture requires a new projection grammar without making the edge layer durable.
- Selection, conversation, and runtime context have no architecture target (`ui/src/components/firm/directionTarget.ts:1-42`; `brain/src/firm/conversation.mjs:29-34`; `brain/src/firm/work-routes.mjs:124-156`). A diagram-only implementation would therefore fail the product test.

## 3. Alternatives

### A. Enrich existing bets and open refs

**Founder experience.** Systems, motions, and campaigns appear as inferred regions around bets. The founder sees familiar Workyard territory and little migration.

**Data model.** Keep only bets. Use `bet.refs` open strings such as `system:builder-intake`, `motion:graduate-project-drop`, and `campaign:first-twenty` plus attached architecture prose.

**Effect on physics.** Minimal backend change. The canvas groups and labels bets; teammate context receives selected refs.

**Migration burden.** Low. Existing bets remain valid; architecture can be proposed as refs.

**Commodity risk.** Very high. The architecture is a drawing over tags. Shared systems have no identity, campaign contracts cannot be addressed, and architecture history is accidental.

**Failure modes.** Every system becomes a bet; every campaign becomes a bet family; a motion is indistinguishable from a region label; deleting the last bet deletes architecture meaning; typoed refs fork identity; no stable object can receive founder direction.

**Preserves.** Current noun doctrine, bet store, lens mechanics, work loop.

**Deletes.** The requested distinction between persistent capability, repeatable path, bounded activation, and uncertain claim.

**Seven-day test.** Model Buffalo and DenialShield only with bet refs, then ask Jacob to retarget one shared system and explain what persists when all campaigns end.

**Kill condition.** If either venture needs duplicate pseudo-system bets or Jacob cannot target a system without naming a bet, kill immediately.

### B. One venture architecture document with addressable records — chosen

**Founder experience.** The venture opens on intent, product loop, reusable systems, active motions, bounded campaigns, wall-held releases, and reality. Selecting any architecture record scopes the same composer and traces to existing bets/work/outcomes.

**Data model.** One revisioned singleton document inside one new `architecture` venture collection. It owns product loops, systems, motions, campaigns, and evidence annotations by stable ID. Bets and outcomes stay in current collections. Releases are derived.

**Effect on physics.** Adds an architecture context layer above the existing diverge → stage → wall → outcome loop. It changes runtime briefs and return prioritization but does not create execution stages or authority.

**Migration burden.** Moderate and bounded. Empty document for existing ventures; founder-reviewed proposals can populate it. No bet rewrite or new database.

**Commodity risk.** Medium. The model becomes non-commodity only when selection changes runtime context, exact releases trace through it, and outcomes accumulate evidence history.

**Failure modes.** The singleton becomes an oversized JSON schema; architecture editing becomes a form; inferred architecture is silently accepted; the lens reads the document as a generic diagram; revisions churn on trivial placement.

**Preserves.** Wall, bet minimality, outcome truth, venture isolation, transfer, placement-only lens authority, provider neutrality, exact work, taste, local readability.

**Deletes.** Teammate-first far view; the blanket “no new nouns” rule; the assumption that all venture structure belongs in bet prose.

**Seven-day test.** Hand-author one Buffalo architecture and one DenialShield architecture, link one real/fixture bet and exact work, target every record through the composer, then return one joined outcome. Observe whether next-work context and return ordering change.

**Kill condition.** Kill if the architecture can be removed with no change in teammate context or return brief; if Jacob cannot distinguish system/motion/campaign before opening details; or if the document needs lifecycle status fields to remain coherent.

### C. First-class collection per entity

**Founder experience.** Rich independent navigation, querying, history, and permissions for systems, motions, and campaigns.

**Data model.** `systems`, `motions`, `campaigns`, `productArchitecture`, `relationships`, and possibly `architectureEvents` collections with separate services and routes.

**Effect on physics.** Architecture becomes a parallel operating subsystem beside bets, wall, and outcomes.

**Migration burden.** High. Referential integrity, cross-store transactions, transfer versioning, deletion semantics, MCP expansion, multiple routes, and projection reconciliation.

**Commodity risk.** High in a different way: it becomes a structured campaign/architecture manager that Miro, Notion, and CRMs can imitate.

**Failure modes.** Storage sprawl returns; graph consistency becomes the product; stage/status fields follow; product and GTM split into separate modules; agents spend time administering records.

**Preserves.** Stable identity and addressability.

**Deletes.** Small readable core and one-document portability.

**Seven-day test.** Implement only schemas and referential transactions for Buffalo. Measure code and ceremony before any UX proof.

**Kill condition.** Kill if more than one new collection or one cross-record transaction coordinator is needed for the first slice. That threshold is already exceeded, so this alternative is rejected now.

### D. Event-inferred architecture with no current document

**Founder experience.** Drover continuously draws architecture from repository truth, conversation, bets, wall acts, and outcomes. The founder confirms or corrects interpretations in place.

**Data model.** No architecture state; only existing events plus cached projection.

**Effect on physics.** Maximum emergence. Architecture is a probabilistic read model.

**Migration burden.** Low persistence burden, high inference/projection burden.

**Commodity risk.** High. It is an AI-generated map that cannot reliably preserve founder intent, stable names, or longitudinal architecture decisions.

**Failure modes.** The map changes between runs; selected identities drift; founder corrections have nowhere durable to live; the cache becomes a hidden second database; transfer cannot preserve the founder model.

**Preserves.** Open bet semantics and low setup ceremony.

**Deletes.** Founder-authored architecture, deterministic targeting, and deletion/export guarantees.

**Seven-day test.** Generate Buffalo twice from the same repo/conversation and compare identity stability and founder correction retention.

**Kill condition.** Any identity drift or correction loss. This alternative is rejected because those failures are structural, not implementation quality.

## 4. Recommended product contract

### Product center

Drover is the operating system where a founder shapes how a venture creates value and reaches the market, then directs persistent teammates through that architecture. The canvas shows the venture before it shows the machinery. Bets test uncertain claims; exact work crosses the founder wall; returned reality changes what the venture understands. Every claim remains traceable to repository truth, founder judgment, or attributable market evidence.

### Smallest durable ontology

#### Venture — existing

- **Why:** isolation, repository binding, transfer, and portfolio selection already require it.
- **Founder-facing:** yes.
- **Stored/derived:** stored manifest.
- **Minimum fields:** existing `id`, `name`, `repository`, timestamps.
- **Relationships:** owns one current architecture document and current venture records.
- **Mutation authority:** founder for create/import/rebind/delete.
- **Evidence:** repository path must exist and be unique to the venture.
- **Execution effect:** repository truth and worktrees resolve from it.
- **Deletion:** existing venture deletion rules apply; architecture leaves with the venture.
- **Why string/ref is insufficient:** it is the isolation boundary.
- **Cage avoidance:** no portfolio-wide venture data merge.

#### Venture intent — a field, not an entity

- **Why:** the founder must see what the venture is trying to make true.
- **Founder-facing:** yes.
- **Stored/derived:** stored open text on the architecture document.
- **Minimum fields:** `statement`; optional `constraints` open strings.
- **Relationships:** frames all architecture; no edge required.
- **Mutation authority:** founder direct edit or founder-applied proposal.
- **Evidence:** none required because it is desired change, never returned reality.
- **Execution effect:** included in every architecture-aware runtime brief.
- **Deletion:** returns the venture to an explicit “intent not yet named” state.
- **Why string is sufficient:** it is direction, not an independently reusable object.
- **Cage avoidance:** no goal hierarchy, status, metric, or plan.

#### Product loop

- **Why:** the product’s actor-to-value mechanism must be inspectable, addressable, and able to receive evidence or founder direction.
- **Founder-facing:** yes; presented as “how value happens,” with “product loop” available at inspection depth.
- **Stored/derived:** stored in the architecture document.
- **Minimum fields:** `id`, `name`, `actor`, `entry`, ordered open-text `steps`, `value`, optional `intendedChange`, repository evidence refs.
- **Allowed relationships:** may name product capability refs; may be supported or challenged by evidence annotations; motions may cite a loop step/capability as the value they expose.
- **Mutation authority:** founder direct edit; teammates propose.
- **Evidence:** product claims require repository citation or `inference`; desired changes require no proof label.
- **Execution effect:** provides product truth/context for bets and exposes missing product capability when a motion cannot deliver value.
- **Deletion:** rejected if referenced by an active motion unless the same atomic revision removes the reference; historical receipts retain the old loop.
- **Why open string/ref is insufficient:** a paragraph cannot preserve ordered value creation, stable targeting, shared evidence, or architecture history.
- **Cage avoidance:** steps are venture-authored open language, not host stages; no universal actor/need/offering taxonomy.

#### System

- **Why:** a reusable operating capability must persist across campaigns and be shared by multiple motions without duplication.
- **Founder-facing:** yes.
- **Stored/derived:** stored.
- **Minimum fields:** `id`, `name`, `does` (one open-text capability statement), optional `productCapabilityRefs`, evidence annotations by reference.
- **Allowed relationships:** powers zero or more motions; may support one or more product-loop steps.
- **Mutation authority:** founder direct edit; teammates propose.
- **Evidence:** repository citations for product-backed capability; receipts/outcomes for operational capability; otherwise visibly inferred.
- **Execution effect:** selected system context tells teammates what capability exists, what evidence supports it, and which motions depend on it.
- **Deletion:** fails on inbound motion references unless the same revision rewires/removes them; campaigns and bets are never cascaded.
- **Why open string/ref is insufficient:** shared identity is the reason the concept exists; duplicated labels cannot prove reuse or pressure.
- **Cage avoidance:** no system kind, maturity, owner, health score, stage, or universal capability catalog.

#### Motion

- **Why:** a founder needs a predictable repeatable actor-to-value path distinct from the systems it composes.
- **Founder-facing:** yes.
- **Stored/derived:** stored.
- **Minimum fields:** `id`, `name`, `actor`, `entry`, `value`, ordered `systemIds`, optional product-loop/capability refs, and one open-text `repeatabilityClaim`.
- **Allowed relationships:** powered by one or more systems; activated by campaigns; informed by evidence annotations.
- **Mutation authority:** founder direct edit; teammates propose.
- **Evidence:** none required to name a proposed motion; the UI labels observed support, inference, and absence separately.
- **Execution effect:** scopes campaign creation, teammate context, return prioritization, and derived pressure reasons.
- **Deletion:** requires simultaneous campaign reparenting/removal; bets and outcomes survive and become uncontextualized only through an explicit founder revision.
- **Why open string/ref is insufficient:** ordering and shared-system composition are the predictive difference between a motion and a label.
- **Cage avoidance:** no fixed channel enum, stage machine, owner, status, or health score.

#### Campaign

- **Why:** a bounded activation needs stable audience/objective/attribution context that is not the uncertain claim itself.
- **Founder-facing:** yes.
- **Stored/derived:** stored.
- **Minimum fields:** `id`, `name`, `audience`, `objective`, `primaryMotionId`, optional additional `motionIds`, `governingBetId`, optional `supportingBetIds`, `measurement.observation`, optional bounded dates.
- **Allowed relationships:** activates one primary motion and optionally touches others; tests through one governing bet and supporting bets; inherits exact releases and outcomes from those bet/work joins.
- **Mutation authority:** founder direct edit; teammates propose. Teammates may create/fork bets under an existing campaign when directed, not silently create the campaign contract.
- **Evidence:** a measurement contract states what would be observed; it is not an outcome. Attribution to outcomes remains derived and qualified by exact join evidence.
- **Execution effect:** campaign context enters the teammate brief, governs which claim is primary, and shapes return ordering.
- **Deletion:** never deletes bets, releases, or outcomes; it removes current activation context and leaves a revision receipt.
- **Why open string/ref is insufficient:** audience, objective, primary motion, and governing bet are the minimum needed to prevent “campaign” from meaning a tag or task list.
- **Cage avoidance:** no campaign stage, status, task list, owner, budget schema, funnel, or lifecycle enum.

#### Bet — existing, clarified

- **Why:** uncertain claims need their own fork/end/outcome lineage.
- **Founder-facing:** yes.
- **Stored/derived:** stored as today.
- **Minimum fields:** unchanged (`brain/src/firm/bet.mjs:67-90`).
- **Allowed relationships:** a campaign document may name it governing/supporting; bet `refs` may retain a compatibility pointer but are not architecture authority.
- **Mutation authority:** teammates may fork; only founder ends.
- **Evidence:** existing evidence/outcome rules.
- **Execution effect:** current work loop unchanged, now with architecture context.
- **Deletion:** bets are not hard-deleted by architecture operations.
- **Why campaign cannot be an open ref on bet:** the campaign must survive bet ending and may govern multiple bets.
- **Cage avoidance:** no new required bet schema, kind, or stage.

#### Release — deliberately derived

- **Why it does not become durable:** the exact staged artifact, wall effect, decision receipt, execution result, work reference, and outcome already form a more truthful record (`brain/src/firm/wall.mjs:97-135`, `brain/src/firm/wall.mjs:239-264`). A second release record would duplicate authority and risk drift.
- **Founder-facing:** yes, as a semantic projection at motion/campaign altitude.
- **Derived shape:** `{workRef, betId, campaignId?, effect, wallItemId, decision, releasedAt, executionResult}`.
- **Relationships:** campaign/bet association derives from governing/supporting bet and exact work lineage.
- **Mutation authority:** teammates stage; founder decides at wall.
- **Evidence:** wall receipt and exact work are required.
- **Deletion:** deleting placement loses its position; deleting a campaign does not delete the receipt; existing durable wall/work retention applies.

#### Outcome — existing, architecture-aware projection only

- **Why:** returned reality already needs durable identity and provider dedupe.
- **Founder-facing:** yes.
- **Stored/derived:** stored today; architecture context derived through exact bet/work and campaign references.
- **Minimum fields:** unchanged (`brain/src/firm/market.mjs:86-110`).
- **Allowed relationships:** evidence annotation may support/challenge an architecture entity only with an explicit basis; unattributed outcomes receive no architecture edge.
- **Mutation authority:** connectors/founder can record; no architecture auto-rewrite.
- **Evidence:** existing join rules.
- **Execution effect:** return brief and architecture pressure surface the joined trace; teammate interpretation becomes a proposal.
- **Deletion:** current outcome retention rules; never cascaded from architecture.
- **Why not embed:** avoids duplicate reality and causal overclaim.

#### Evidence annotation — finite epistemic grammar

- **Why:** an outcome must be able to challenge architecture without a generic relationship taxonomy or silent causality.
- **Founder-facing:** its words are; the technical envelope is not.
- **Stored/derived:** stored in the architecture document only when founder-applied; inherited context traces are derived and labeled.
- **Minimum fields:** `id`, `subjectRef`, `evidenceRef`, `stance: supports|challenges`, `basis: repository-citation|captured-join|founder-confirmed`, optional `note`, timestamps.
- **Allowed relationships:** architecture subject to repository evidence, exact work, decision receipt, or outcome.
- **Mutation authority:** founder; teammate proposes.
- **Evidence:** referenced evidence must exist in the same venture; captured join does not mean causation.
- **Execution effect:** changes pressure reasons and the next runtime brief.
- **Deletion:** removes the current assertion, never its source evidence; history retains the receipt.
- **Why open string is insufficient:** epistemic basis must be machine-checkable to prevent a fluent causal claim from masquerading as a receipt.
- **Cage avoidance:** only two stances and three proof bases, justified as truth/safety mechanics—not a universal edge taxonomy.

### Relationship grammar

Do not store a generic edge list for normal structure.

- `systemIds` on motion project as **powers**.
- `primaryMotionId`/`motionIds` on campaign project as **activates**.
- `governingBetId`/`supportingBetIds` project as **tests**.
- Exact staged work + wall receipt project as **release**; no stored “produces” edge.
- Outcome-to-architecture context is derived through bet/campaign and labeled **joined through**, never “caused” or automatically “updates.”
- Founder-applied evidence annotations project as **supports** or **challenges** with their proof basis.

This is smaller and more honest than `powers/activates/tests/produces/updates` as a universal edge enum. Structure lives where referential integrity belongs; epistemic claims carry explicit evidence.

### Stored versus derived state

**Store:** architecture identity/content, stable references, revision, evidence annotations, founder mutation receipts.  
**Derive:** active campaigns (bounded dates plus unresolved work, presented as a reason not a status), wall pressure, released/held acts, returned outcome traces, missing evidence, unsupported systems, shared-system use, contradictions, inactive areas, and selection scenes.  
**Never store:** campaign status/stage, motion health, architecture score, release status duplicate, canvas nodes/edges, or generated focus layouts.

### Concepts rejected from the durable model

Actor records, need records, promise records, offering records, surface records, feature records, release records, metric records, target records, task records, milestones, plans, funnels, lifecycle stages, campaign status, motion status, maturity, health, confidence score, owner, universal edge records, dependency kinds, architecture regions, canvas nodes, agent roles, and workflow definitions.

Actors/needs/promises/offerings/surfaces remain meaningful open language inside product-loop steps and repository-grounded content until stable cross-record behavior proves independent identity is necessary.

## 5. UX architecture

### Default opening composition

One canvas opens at venture altitude:

1. A terse return band answers what changed, what needs Jacob, what reality returned, and which architecture area is under pressure. It exposes “Show the whole venture.”
2. A venture-intent statement anchors the spatial world.
3. Product value appears as one readable actor-to-value loop, not miniature cards.
4. Reusable systems sit as stable landforms between product and market.
5. Active motions appear as paths through those systems. Shared systems visibly carry more than one path.
6. Campaign pressure appears as bounded activation marks on a motion.
7. The wall is the fixed world boundary; approaching releases and returned reality touch opposite sides of it.
8. Teammates are absent until contribution is inspected.

### Semantic altitudes

- **Venture:** intent, primary product loop, active motions, campaign pressure, wall-held releases, recent returns, founder judgment.
- **Architecture:** product-loop steps, systems, motion composition, shared dependencies, missing support, contradiction reasons.
- **Motion:** actor, entry, ordered systems, value, active campaigns, releases, joined evidence.
- **Campaign:** audience, objective, primary motion, governing/supporting bets, measurement observation, exact releases, returns, decisions.
- **Bet/work:** current Workyard territory, exact staged artifacts/diffs, fork lineage, contributors, wall effects, decisions, outcomes.
- **Machinery depth:** runtime, teammate coordination, configuration revision, tools, worktrees, cost, logs.

These are representations in one camera world, not tabs or routes. The prototype’s named altitude controls are evaluation scaffolding; production should let zoom and selection lead, with the outline naming the same levels for deterministic access.

### Selection and focus

- Click/Enter selects. The composer immediately inherits the stable target and explains the consequence.
- Selection creates a temporary evidence-backed scene: selected entity, necessary upstream/downstream context, exact proof, wall dependency, and omission boundary.
- Escape broadens exact work → bet → campaign → motion → venture.
- Shift/Command selection compares architecture entities only when comparison is meaningful; it never creates an edge by accident.
- “Show the whole venture” restores authored placement. Focus layout is ephemeral.

### Creation and editing

- Empty or selected-space composer accepts “Our university relationship work should be a reusable system” or “This campaign primarily activates the graduate motion.”
- Teammates return a compact architecture proposal with semantic before/after and proof labels. Jacob applies it as a revision.
- Direct manipulation handles cheap truths: move for presentation, attach campaign to a motion, reorder systems within a motion, set primary motion. Every semantic drag previews exact meaning and writes the architecture document only after the founder completes it.
- Placement drag remains presentation-only. Semantic handles are distinct and keyboard-accessible.
- No multi-field form is the default. Structured fields appear only when an ambiguous edit cannot be made safely.

### Campaign within motion

A campaign is drawn as a bracketed activation around part of a motion, not a child card in a tree. Its primary motion stays visually continuous through the campaign. Additional touched motions appear as quiet references, not duplicate campaign copies. Opening the campaign expands its governing bet, supporting bets, exact releases, returns, held effects, and decision implications in the same space.

### Return behavior

- A joined outcome lands on the exact release/bet trace.
- Campaign and motion context appear as inherited context: “joined to exact work → governing bet → campaign,” not causal edges.
- Drover may propose “this challenges the intake-first explanation,” but the architecture changes only after Jacob applies the evidence annotation or edits the architecture.
- Unattributed signals enter a detached return margin with no line to architecture.

### Wall behavior

- The wall remains a spatial boundary, not a campaign action.
- A release approaching it displays exact effect, destination, work diff/artifact, campaign/bet context, and required founder verb.
- Release, reject, answer, acknowledge, keep/end, and deploy authorization remain purpose-correct.
- Architecture edits never mint outward authority.

### Empty venture

Show repository binding and one prompt: “What change should this venture make true?” Drover then proposes a repository-grounded product loop and possible systems/motions as inference. Nothing is silently accepted. The canvas explains the causal runway: intent → product value → motion → bet → wall → reality.

### Dense venture

- Far view uses named regions, paths, pressure marks, and only meaningful counts.
- Shared systems appear once. Motion paths bundle visually until focused.
- Campaigns collapse into activation notches; only primary labels remain.
- The return composition is selective and declares omissions.
- Virtualization applies after the first stable far frame, following the current lens policy (`ui/src/components/lens/FirmLensCanvas.tsx:49-71`).

### Stale/offline

Keep the last verified architecture visible with age. Disable semantic edits, direction, and wall decisions until freshness returns. Placement may remain local only if the product can reconcile it honestly; otherwise hold it too. Never infer new pressure from stale records. This extends the current stale behavior (`ui/src/FirmApp.tsx:58-66`; `ui/src/components/lens/FirmLens.tsx:215-225`).

### Keyboard and accessibility

- Outline groups Intent, Product loops, Systems, Motions, Campaigns, Bets/work, Wall, Outcomes, and Machinery receipts.
- Arrow/Home/End traversal and Enter focus match the existing outline contract (`ui/src/components/lens/FirmLensOutline.tsx:39-67`).
- Escape broadens one semantic level.
- All pressure and truth states use shape/text/pattern, not color alone.
- Browser zoom never removes outline/composer access.
- Reduced motion removes camera travel but preserves settled context.

### Machinery reveal

“How it runs” appears only for a selected entity or exact work. It reveals contributor identity, runtime/model, active drive, configuration revision, worktree, tools, cost, and authority receipt. Teammates can also appear as small attribution marks near contributed work. Machinery never becomes the far-view topology.

### Founder sessions, second by second

#### 1. Jacob opens Buffalo Projects after a day away

- **0–1s:** Venture name, freshness, intent, product loop, three motion paths, and wall boundary settle.
- **1–2s:** Return band states one held release, one returned reality, and one unsupported area.
- **2–3s:** Jacob can answer what Buffalo is trying to make true, how value works, which motions are active, what needs him, and what returned.
- **3–6s:** He clicks the returned sentence; the exact release → bet → campaign → motion trace focuses.
- **6–10s:** “Joined, not caused” and the evidence basis are readable without machinery.

#### 2. Jacob inspects the entire product-and-GTM architecture

- **0–2s:** Zoom to architecture altitude; return emphasis recedes, value loop and systems sharpen.
- **2–5s:** Two motion paths visibly share Work record + proof.
- **5–9s:** Missing product capability and unsupported event motion appear as named reasons, not scores.
- **9–14s:** Outline traversal confirms nothing was omitted by spatial composition.

#### 3. Jacob creates or revises a motion

- **0–2s:** Selects the graduate motion; composer reads “Directing Graduate → project drop…”
- **2–8s:** Types “Referral should depend on a shareable builder outcome, not cohort completion.”
- **8–12s:** Teammate returns an architecture proposal: revised value step, affected system dependency, two campaigns impacted, evidence still inferred.
- **12–16s:** Jacob applies; architecture revision advances. Existing bets do not mutate.
- **16–20s:** Active future drives receive the new revision; running drives remain pinned and become visibly stale-to-context when they return.

#### 4. Jacob starts a campaign within that motion

- **0–3s:** Selects the motion and says “Start the first twenty project drops for recent graduates; observe whether qualified work appears before identity.”
- **3–8s:** Proposal shows audience, objective, primary motion, observation contract, and one governing bet suggestion.
- **8–12s:** Jacob applies the campaign contract.
- **12–16s:** The campaign appears as a bounded activation on the motion; no stage board appears.

#### 5. Drover forks bets and stages releases

- **0–4s:** Architecture-aware drive receives venture intent, product-loop slice, selected motion, campaign contract, taste, and repository truth.
- **4–10s:** Teammate forks the governing bet and supporting variants using the current fork tool.
- **10–18s:** Exact project-drop product work and outreach artifact stage under those bets.
- **18–22s:** Campaign view gains exact work marks; the motion itself does not become “in progress.”

#### 6. Jacob reviews a consequential release at the wall

- **0–2s:** Clicks the wall-held mark from campaign or return band.
- **2–6s:** Focus preserves motion/campaign/bet context while exact diff, effect, destination, evidence, and consequence become readable.
- **6–12s:** Jacob revises or rejects, or supplies deploy authorization then releases.
- **12–15s:** Decision receipt lands; architecture remains unchanged unless the decision implies a separate founder edit.

#### 7. A real outcome returns and changes the architecture

- **0–3s:** Outcome lands through provider identity on exact release/work and bet.
- **3–7s:** Return band states the words and join basis; campaign/motion association is labeled inherited context.
- **7–12s:** Drover proposes “supports intake-before-identity” or “challenges cohort as required value step,” citing the outcome.
- **12–16s:** Jacob applies or rejects the evidence annotation.
- **16–20s:** Pressure reasons and next runtime briefs change; no health score moves.

#### 8. Jacob compares pressure across multiple motions

- **0–3s:** Broadens to architecture altitude.
- **3–7s:** Graduate motion shows held release + joined evidence; intelligence motion shows inference + institutional dependency; event motion shows no campaign/release/evidence.
- **7–12s:** Selecting two motions produces a compact reason comparison, not normalized scores.
- **12–16s:** Jacob directs one motion or shared system from the same composer.

#### 9. Jacob switches to an unrelated venture

- **0–2s:** Venture picker opens; he selects DenialShield.
- **2–5s:** Entire canvas changes to claim intake, payer intelligence, consultant-led and outbound motions, prevention pilot, held eligibility release, and returned coding evidence.
- **5–8s:** No Buffalo actor, campaign, or signal remains. Shared product grammar persists; venture data does not.

## 6. Visual grammar

| Meaning | Primary non-color signal | Near detail |
|---|---|---|
| Product architecture | A grounded actor-to-value sequence embedded in a broad product landform | Ordered steps, repository citations, intended change, missing capability |
| System | Stable asymmetrical “infrastructure” shape with a double-rule glyph | What it repeatedly does, motions using it, evidence basis |
| Motion | Continuous path/ribbon passing through system anchors | Actor, entry, ordered systems, value, campaigns, returns |
| Campaign | Bracketed bounded activation around part of a motion | Audience, objective, primary motion, observation contract, bets |
| Bet | Existing territory/claim form, circular claim marker inside campaign trace | Fork lineage, exact work, evidence, founder ending |
| Release | Artifact slab touching the wall, with a double boundary line | Exact effect, destination, work diff, decision receipt |
| Outcome | Returning speech/observation shape with an inward arrow | Exact words, provider identity, join basis, attribution boundary |
| Evidence-supported relationship | Solid line with a citation notch and explicit basis label | Source opens in one gesture |
| Inference | Dashed line with open endpoint and “inference” text | Editable teammate explanation |
| Unattributed signal | Detached return at world margin; no connector | Source and words only |
| Founder-held authority | The wall’s dashed physical boundary plus lock/hand language | Purpose-correct founder action |
| Teammate contribution | Small face/initial-free `CrewFace` mark attached to exact work | Runtime/configuration/cost receipts behind “How it runs” |

Color remains secondary: forest for selection, amber for wall/held authority, red only for destructive/failure. Outcomes receive no positive/negative color. Hairlines, space, containment, path continuity, and typography carry most meaning, matching current tokens (`ui/src/index.css:19-75`) and doctrine (`DESIGN.md:220-265`).

Sophistication comes from three things only: shared systems are visibly reused; every consequential claim traces to exact proof; and founder actions visibly change future execution. At rest, labels and topology dominate. Details, controls, contributor identity, and receipts appear only under selection.

## 7. Technical architecture

### Persistence shape

Add `architecture` to `VENTURE_COLLECTIONS`. Store one current singleton at key `venture`, plus proposal/change receipts in the same collection using IDs. This mirrors configuration without importing its participant-specific schema.

```text
ventures/<ventureId>/architecture/venture.json       # current CAS document
ventures/<ventureId>/architecture/proposal-*.json    # unapplied proposals
ventures/<ventureId>/architecture/change-*.json      # applied receipts with before/after
```

No SQLite, cache, graph store, canvas store, or remote authority is added.

### Read and write paths

- `GET /api/ventures/:id/architecture` returns current document and derived pressure reasons.
- `POST /api/ventures/:id/architecture/proposals` lets an agent/founder create a validated unapplied proposal; no semantic write.
- `POST /api/ventures/:id/architecture/proposals/:proposalId/apply` is founder-authorized and CAS-protected.
- `PUT /api/ventures/:id/architecture` is a founder-authorized direct manipulation write with `expectedRevision` and the same validation/diff receipt.
- Lens GET joins the architecture read into its projection; placement PUT stays unchanged.

### Projection strategy

`buildLens` reads architecture beside existing records and passes raw canonical records plus a small derived summary. UI-local projection builds semantic nodes/regions/paths. Structural edges derive from fields; evidence lines derive from annotations; release and outcome traces derive from existing wall/work/bet joins. No projected node/edge is persisted.

### API changes

- Add architecture routes above.
- Extend lens response with `architecture`, `architecturePressure`, and `architectureRevision`.
- Extend drive body and conversation target with `architectureRef: { kind, id } | null`.
- Validate every selected architecture reference against the current venture document.
- Do not add CRUD routes per noun in the first slice.

### MCP changes

- Add `get_venture_architecture` (read-only).
- Add `propose_venture_architecture_change` (unapplied only).
- Extend `drive_teammate` with optional `architectureRef`.
- Do not expose apply/delete/wall decisions to MCP. Current MCP already separates read/stage from founder decision (`brain/src/firm/mcp-tools.mjs:18-57`, `brain/src/firm/mcp-tools.mjs:99-123`).

### Selection-target changes

```ts
type DirectionTarget = {
  architectureRef: { kind: "product-loop" | "system" | "motion" | "campaign"; id: string } | null;
  betId: string | null;
  workRef: string | null;
  teammateRefs: string[];
};
```

Architecture and bet/work may coexist only when the trace validates (for example campaign + its governing bet). A selected system alone is valid. Exact work still requires its bet. Target normalization remains deterministic.

### Conversation context

Persist `architectureRef` on founder/model messages. Conversation projections include turns whose explicit target or bet trace intersects the selected architecture entity. They do not repeat the full global architecture. Messages record the architecture revision used.

### Runtime context

- Whole-venture direction receives intent, primary product loop, active campaign summaries, named pressure reasons, and architecture revision.
- Selected architecture direction receives the exact entity, immediate structural neighbors, evidence annotations, relevant bets/work/wall/outcomes, and an omission boundary.
- Bet/work direction receives its campaign/motion/system/product context when a supported trace exists.
- A drive pins the starting architecture revision just as it pins configuration revision. Later changes do not mutate the running prompt; the return receipt can state that newer context exists.

### Return brief

Add architecture targets to return records. Priority is consequence-based:

1. founder decisions/held releases;
2. returned outcomes with exact joins;
3. founder-applied architecture changes and contradictions;
4. newly unsupported dependencies;
5. routine bet movement.

The omission boundary stays. Architecture pressure is a list of exact reasons, never a score.

### Outcome joins

Keep `recordOutcome` unchanged for authoritative join behavior. Derive an `architectureTrace` at read time:

```text
outcome -> exact work/bet (captured join)
bet -> campaign (governing/supporting reference)
campaign -> primary motion (stored structure)
motion -> systems/product loop (stored structure)
```

Only the first arrow is an evidence-supported outcome join. Later arrows are current architecture context. The UI labels the distinction. A teammate can propose a stored supports/challenges annotation; only the founder applies it.

### Architecture inference and proposal

Repository scan and founder conversation may propose a complete document with every claim labeled `repository-citation` or `inference`. Proposal identity remains stable while Jacob edits. Apply is explicit. Subsequent scans create diffs; they never overwrite the founder model.

### Architecture mutation effects

- New directions immediately use the new revision.
- Running drives retain the old revision and return with a context-drift receipt.
- Bets remain unchanged unless Jacob or a teammate explicitly forks/refines them.
- Campaign references are validated atomically; dangling links fail.
- Return brief reprioritizes affected held work/evidence.
- Teammate souls learn only from founder decisions/outcomes as today; architecture text itself does not become cross-venture memory.

### Venture transfer and migration

- Export includes the new collection automatically through `VENTURE_COLLECTIONS`.
- Bump transfer format to v2; accept v1 imports with no architecture document and initialize an empty current document only on first founder-approved write.
- Validate nested `ventureId` and every internal reference before writing.
- Repository evidence refs keep logical paths/line snapshots; machine paths still strip/rebind.
- Existing ventures render the current Workyard until architecture exists. No automatic migration invents a venture model.
- Existing bets can be linked through founder-reviewed campaign proposals; no bulk rewrite.

### Compatibility

- No architecture document: current API/lens/composer behavior remains.
- Architecture document with no campaigns: product/system/motion canvas works; existing bets remain in a lower uncontextualized area.
- Missing referenced bet due legacy corruption: fail the architecture write; reads show an explicit broken reference without guessing.
- Old transfers: import as architecture-empty.

### Security and founder authority

- Architecture direct apply/delete is founder-authorized below the renderer, like configuration/placement writes.
- Agents and MCP can only propose.
- Architecture content cannot grant runtime tools, expand authority, release effects, spend, import a venture, or end a bet.
- Wall and deploy checks remain unchanged.
- Cross-venture reference validation fails closed before write/import.

### Modules extended

`venture-store.mjs`, `venture-transfer.mjs`, `lens.mjs`, `work-loop.mjs`, `conversation.mjs`, `work-routes.mjs`, `mcp-tools.mjs`, lens/UI types, selection/composer, return brief, and existing route registration.

### Genuinely necessary new modules

- `brain/src/firm/architecture.mjs` — normalization, validation, CAS current document, proposal/apply receipts, derived pressure reasons. Keep under 500 LOC.
- `brain/src/firm/architecture-routes.mjs` — thin HTTP surface.
- `ui/src/components/lens/architectureProjection.ts` — semantic projection; no business truth.
- Small stable-domain UI components: `VentureIntentMark`, `ProductLoopRegion`, `SystemLandmark`, `MotionPath`, `CampaignActivation`, `ArchitectureTrace` (each under 300 LOC).

### Code to delete or simplify

- Replace teammate/bet-only assumptions in `firmLensGraph.ts` rather than layering a second graph builder.
- Generalize `CanvasSelection` and outline rows; do not add parallel architecture selection state.
- Remove far-view teammate dominance and header “crew/live bets” summary once the architecture opening composition proves itself (`ui/src/FirmApp.tsx:193-196`).
- Keep `BetTerritory` and workyard projection at bet/work altitude; do not rename them into architecture components.
- Do not delete wall, market, work-loop, or product-change modules.

### Placement remains presentation-only

Architecture entity coordinates use existing placement keys such as `architecture:system:<id>`. Deleting placement recomputes a deterministic layout and loses no architecture, references, evidence, campaign, bet, release, or outcome. Semantic drag writes the architecture document only through an explicit relationship affordance, never by interpreting ordinary movement.

### Concrete example JSON

```json
{
  "architecture": {
    "id": "venture",
    "ventureId": "venture-buffalo-projects",
    "schemaVersion": 1,
    "revision": 12,
    "intent": {
      "statement": "Talented builders find the right people through credible work—not polished profiles.",
      "constraints": ["Recent graduates are the first wedge; the product is not university-limited."]
    },
    "productLoops": [
      {
        "id": "loop-builder-proof",
        "name": "Work becomes credible proof",
        "actor": "Recent graduate with something to build",
        "entry": "Describes what they are trying to build",
        "steps": [
          { "id": "step-project", "label": "Expresses the project before creating a profile", "evidence": [{ "path": "src/project-drop.tsx", "lines": "41-118" }] },
          { "id": "step-cohort", "label": "Enters a deliberately composed cohort", "evidence": [{ "kind": "inference", "note": "Cohort composition is founder direction, not yet repository-proven." }] },
          { "id": "step-work", "label": "Performs real work and accumulates work entries" },
          { "id": "step-proof", "label": "Leaves credible proof that attracts collaborators or institutions" }
        ],
        "value": "Finds collaborators or institutional opportunity through visible work",
        "intendedChange": "More qualified builders reach credible proof before needing social proof."
      }
    ],
    "systems": [
      {
        "id": "system-work-proof",
        "name": "Work record and proof",
        "does": "Turns atomic work entries into a credible builder record.",
        "productCapabilityRefs": ["loop-builder-proof:step-work", "loop-builder-proof:step-proof"]
      }
    ],
    "motions": [
      {
        "id": "motion-graduate-cohort",
        "name": "Graduate to cohort proof",
        "actor": "Recent graduate",
        "entry": "Project drop",
        "systemIds": ["system-builder-intake", "system-cohort-operation", "system-work-proof"],
        "value": "Credible proof and referral",
        "repeatabilityClaim": "A useful project expression can repeatedly lead to matched work and proof."
      },
      {
        "id": "motion-intelligence-institution",
        "name": "Intelligence to sponsored cohort",
        "actor": "Institutional partner",
        "entry": "Builder intelligence artifact",
        "systemIds": ["system-intelligence", "system-institutional-relationships", "system-work-proof"],
        "value": "Visible builder outcomes and a reason to sponsor the next cohort",
        "repeatabilityClaim": "Credible local intelligence can repeatedly open institutional participation."
      }
    ],
    "campaigns": [
      {
        "id": "campaign-first-twenty-drops",
        "name": "First twenty project drops",
        "audience": "Recent graduates trying to build something real",
        "objective": "Produce qualified project expressions before profile creation",
        "primaryMotionId": "motion-graduate-cohort",
        "motionIds": ["motion-graduate-cohort"],
        "governingBetId": "bet-project-drop-before-profile",
        "supportingBetIds": ["bet-free-qualified-demand"],
        "measurement": {
          "observation": "Whether a qualified project is described before identity setup",
          "window": "First twenty attributable project-drop sessions"
        }
      }
    ],
    "evidenceAnnotations": [
      {
        "id": "evidence-drop-006",
        "subjectRef": { "kind": "motion", "id": "motion-graduate-cohort" },
        "evidenceRef": { "kind": "outcome", "id": "outcome-drop-006" },
        "stance": "supports",
        "basis": "captured-join",
        "note": "Supports intake-before-identity; does not prove the release caused the behavior.",
        "appliedBy": "founder",
        "appliedAt": "2026-07-15T13:42:00.000Z"
      }
    ]
  },
  "bet": {
    "id": "bet-project-drop-before-profile",
    "ventureId": "venture-buffalo-projects",
    "intent": "Project drop converts better than profile creation.",
    "forkedFrom": "bet-intake-shape",
    "teammateRef": "sable",
    "configurationRevision": 12,
    "refs": [],
    "evidence": [{ "type": "outcome", "id": "outcome-drop-006" }],
    "staged": [{ "id": "work-project-drop-v3", "title": "Project-drop experience", "content": { "diff": "+ ask what are you trying to build\n- require profile before project" }, "ownerRefs": ["sable"], "contributorRefs": ["rowan"], "configurationRevision": 12 }],
    "joinKey": "join-project-drop",
    "createdAt": "2026-07-14T18:00:00.000Z",
    "updatedAt": "2026-07-15T13:42:00.000Z",
    "endedAt": null,
    "endedBy": null,
    "learning": null
  },
  "releaseWallEffect": {
    "id": "wall-project-drop-v3",
    "ventureId": "venture-buffalo-projects",
    "betId": "bet-project-drop-before-profile",
    "workRef": "work-project-drop-v3",
    "purpose": "release",
    "blocksBet": true,
    "effect": {
      "kind": "deploy",
      "destination": "Buffalo Projects production product",
      "summary": "Make project drop the first product action",
      "joinKey": "join-project-drop"
    },
    "parkedAt": "2026-07-15T12:55:00.000Z",
    "decision": null,
    "releasedAt": null
  },
  "outcome": {
    "type": "outcome",
    "id": "outcome-drop-006",
    "ventureId": "venture-buffalo-projects",
    "betId": "bet-project-drop-before-profile",
    "workRef": "work-project-drop-v3",
    "configurationRevision": 12,
    "joinKey": "join-project-drop",
    "outcomeKind": "qualified-project-described",
    "from": "builder-session-006",
    "body": "I would rather show what I am trying to build before making another profile.",
    "source": "product-event",
    "providerEventId": "drop-006",
    "observedAt": "2026-07-15T13:40:00.000Z",
    "attribution": "joined",
    "joined": true
  },
  "derivedTrace": {
    "evidenceSupported": ["outcome-drop-006 -> work-project-drop-v3 -> bet-project-drop-before-profile"],
    "structuralContext": ["bet-project-drop-before-profile -> campaign-first-twenty-drops -> motion-graduate-cohort", "motion-graduate-cohort -> system-work-proof", "motion-intelligence-institution -> system-work-proof"],
    "causalityClaimed": false
  }
}
```

## 8. File-level implementation map

### Product authority documents

- `docs/FIRM-SPEC.md` — amend product center, ontology, canvas, open/closed doctrine, fatal modes, anti-cage rules, and delivery sequence.
- `docs/STATE.md` — record only what the slice actually builds and keep outside-founder/real-outcome proof unproven.
- `PRODUCT.md` — add founder-predictable system/motion/campaign language and revised default experience.
- `DESIGN.md` — add venture/architecture/motion/campaign altitudes and new visual grammar.
- `docs/design/DESIGN.md` — update only after production code renders; record new component/token reality, not this prototype.
- `AGENTS.md` — update founder-facing language only through `/agents-md`, never automatically.

### Backend domain

- New `brain/src/firm/architecture.mjs` — current document, validation, proposals, receipts, pressure derivation.
- `brain/src/firm/work-loop.mjs` — architecture-aware brief and pinned revision.
- `brain/src/firm/work-loop-tools.mjs` — optional campaign context when forking/staging; no new workflow tools.
- `brain/src/firm/conversation.mjs` — architecture target/revision.
- `brain/src/firm/market.mjs` — ideally unchanged; add no architecture causality write.
- `brain/src/firm/wall.mjs` — unchanged authority; release projection reads it.
- `brain/src/firm/taste.mjs`, `truth.mjs`, product-change modules — unchanged contracts.

### Persistence

- `brain/src/firm/venture-store.mjs` — add one collection and singleton import key.
- `brain/src/firm/venture-transfer.mjs` — v2 export/import compatibility and architecture validation.

### Routes

- New `brain/src/firm/architecture-routes.mjs` — read/propose/apply/direct founder write.
- `brain/src/firm/lens-routes.mjs` — response shape only through `buildLens`.
- `brain/src/firm/work-routes.mjs` — target validation.
- `brain/src/server.mjs` — register one route group.

### MCP

- `brain/src/firm/mcp-tools.mjs` — read/propose architecture and pass architecture target; never apply.

### UI types

- `ui/src/types.ts` — architecture document, pressure reason, lens, message target.
- `ui/src/api.ts` — architecture endpoints and drive body.

### Canvas projection

- `brain/src/firm/lens.mjs` — include architecture canonical read and derived summaries.
- `ui/src/components/lens/firmLensGraph.ts` — generalize or split stable architecture projection; do not create a second root graph builder.
- New `ui/src/components/lens/architectureProjection.ts` — presentation mapping only.
- `ui/src/components/lens/lensScene.ts` and camera hooks — semantic altitude/focus chain.
- `ui/src/lib/lensLayout.ts` — architecture anchor keys and deterministic layout.
- `ui/src/components/lens/useCanvasPlacement.ts` — placement keys only.

### Canvas components

- `ui/src/components/lens/FirmLens.tsx` — architecture selection/focus composition.
- `ui/src/components/lens/FirmLensCanvas.tsx` — architecture aria label and node types.
- New components split by stable meaning: `VentureIntentMark.tsx`, `ProductLoopRegion.tsx`, `SystemLandmark.tsx`, `MotionPath.tsx`, `CampaignActivation.tsx`, `ArchitectureTrace.tsx`.
- `BetTerritory.tsx`, `WorkCard.tsx`, `FirmLensWall.tsx` — preserve at near altitude; add context hooks only.
- `FirmLensOutline.tsx`/`lensOutline.ts` — deterministic architecture hierarchy without mirroring collections.
- Existing token/CSS sources — extend current files or one feature-local `venture-architecture.css`; no second token system.

### Conversation and targeting

- `ui/src/components/firm/directionTarget.ts` and tests — architecture ref normalization/equality.
- `ui/src/components/firm/goalComposerTarget.ts` — labels and consequences.
- `ui/src/components/firm/DirectionTargetChips.tsx` — architecture target display.
- `ui/src/components/firm/GoalComposer.tsx` — drive body.
- `ui/src/components/firm/conversationProjection.ts` — architecture-scoped messages.
- `ui/src/components/firm/ConversationFeed.tsx` — context labels; machinery remains secondary.

### Return brief

- `ui/src/lib/return-brief.ts` — architecture targets, pressure reasons, trace labels.
- `ui/src/components/firm/returnBriefProjection.ts` — target union.
- `ui/src/components/firm/ReturnBrief.tsx` — architecture focus handler.

### Tests

- Revise `brain/test/firm/anti-cage.test.mjs` as described; keep bet and score guards.
- Add `brain/test/firm/architecture.test.mjs` for invariants/proposals/revisions/deletion.
- Extend `venture-transfer`, `lens`, `work-loop`, `conversation`, `security-matrix`, `market`, and route tests.
- Extend UI tests for graph projection, selection, outline, return brief, stale state, and portability.

### Browser fixtures

- Add one architecture fixture factory with Buffalo and one unrelated venture.
- Extend `test/browser/firm-journey.mjs` for first useful architecture.
- Extend `dense-journey.mjs` for shared systems/many motions.
- Extend `return-journey.mjs` for joined outcome → architecture context without causal claim.
- Extend `wall-journey.mjs` for architecture-preserving release decisions.

### Design evidence

- New production captures only after implementation under a clearly named evidence directory.
- Keep this reversible prototype and its evidence under `docs/design/venture-architecture-adaptation/`.

## 9. Smallest vertical slice

### In scope

1. One current architecture document with venture intent, one product loop, two systems, two motions sharing one system, one campaign, and evidence annotations.
2. Founder-authorized direct write plus agent proposal/apply receipt.
3. Architecture-aware lens projection at venture, motion, campaign, and existing bet/work altitude.
4. One campaign references one existing governing bet and exact staged work.
5. Same composer targets product loop, system, motion, campaign, bet, or work.
6. Work-loop brief receives the selected architecture slice and revision.
7. One existing joined outcome appears on the trace and can generate a founder-reviewed supports/challenges proposal.
8. Wall authority, venture isolation, placement-only canvas state, transfer, stale behavior, outline, and reduced motion remain.
9. Buffalo fixture plus DenialShield portability fixture.

### Deliberately excluded

Automatic architecture generation on first open; multiple product loops in the UI; generic relationship editing; campaign dates UI; metrics dashboards; campaign status/stages; budgets; ownership; tasks; scheduling; arbitrary architecture node kinds; collaboration; cross-venture architecture; aggregate scores; new connectors; release records; real outbound actions beyond existing wall executors; mobile.

### Seven-day behavioral test

- **Day 1:** Jacob names Buffalo intent and corrects a repository-grounded product-loop proposal.
- **Day 2:** He defines two systems and two motions sharing Work record + proof; another person can predict the distinction from the far view.
- **Day 3:** He starts First twenty project drops inside the graduate motion and accepts/forks a governing bet.
- **Day 4:** A real or explicitly synthetic local fixture stages exact product work and parks it at the wall; Jacob traces architecture → exact diff without a route change.
- **Day 5:** A returned fixture outcome joins exact work/bet; Drover shows inherited campaign/motion context and proposes—not applies—an architecture annotation.
- **Day 6:** Jacob changes a system/motion; the next runtime brief and return ordering demonstrably differ while old bet/outcome records remain.
- **Day 7:** Repeat on DenialShield without schema/code changes; export/import both documents locally.

Measure behavior, not preference: time to identify intent/value/motions/release/judgment/return; successful targeting; whether Jacob uses architecture context to change next work; whether any manual duplicate system appears; whether any outcome edge is misread as causality.

### Slice kill conditions

- Removing the architecture document does not change runtime context or return prioritization.
- Jacob cannot predict system versus motion versus campaign before opening details.
- Shared systems require duplication.
- A campaign requires a status/stage machine to feel usable.
- A returned outcome appears causally attached beyond its supported join.
- The first slice needs more than one new collection or a second canvas authority.
- DenialShield requires new schema fields.
- Three-second comprehension fails repeatedly even after copy/layout correction.

## 10. Verification

### Domain invariants

- Architecture IDs are unique within the venture document.
- Motion `systemIds`, campaign motion/bet refs, product refs, and evidence refs resolve in the same venture.
- At least one primary motion for every campaign; additional motions are optional.
- Campaign governing bet differs semantically from supporting bets but creates no bet kind.
- No campaign/motion/system status, stage, maturity, owner, or score fields.
- Deletion with inbound refs fails unless one atomic revision removes them.
- Evidence basis validates; captured join never serializes a causality claim.
- Release projection always resolves to durable work/wall receipt and is never independently stored.

### Venture isolation

- Cross-venture architecture reads/writes return 404.
- Cross-venture nested refs fail before persistence.
- MCP/agent proposals cannot name another venture’s bet/outcome/work.
- Souls receive only founder-blessed patterns, never architecture documents.

### Transfer/export

- v2 round-trip preserves current document, proposals/receipts, stable IDs, evidence annotations, and architecture revision.
- v1 import yields no invented architecture.
- Repository paths strip/rebind; logical repository citations remain readable.
- Placement deletion/omission loses only coordinates.
- Corrupt/dangling/cross-venture refs reject atomically.

### Wall authority

- Architecture writes never mint `OUTWARD_RELEASE`.
- Model/MCP/browser-forged apply/release/end fail.
- Away holds releases.
- Deploy keeps second authorization.
- Campaign deletion cannot delete or decide a wall item.

### Evidence and attribution truth

- Joined outcome shows exact join basis.
- Campaign/motion/system trace is labeled structural context.
- Unattributed outcome has no architecture connector.
- Inference is editable and visually distinct.
- Founder-applied supports/challenges annotation cites existing evidence.
- Administrative receipts cannot become outcomes.

### Architecture projection

- Shared system renders once with two motion paths.
- Product loop and GTM remain in one connected scene.
- Deleting placement preserves document/projection meaning after deterministic relayout.
- Focus scenes declare omissions and restore authored layout.
- Dense fixture bundles paths without hiding outline access.

### Selection targeting

- Every architecture kind scopes composer, conversation, and runtime brief.
- Exact work still requires bet.
- Mixed campaign+bet/work target validates the trace.
- Draft target locks while typing, matching current behavior.
- Escape broadens deterministically.

### Semantic zoom

- Far view uses marks/paths/regions, not miniature cards.
- Architecture view exposes shared systems and pressure reasons.
- Motion view exposes actor-to-value path and campaigns.
- Campaign view exposes contract, bets, exact releases, outcomes.
- Bet/work view preserves current evidence/worktree/wall detail.

### Dense fixtures

At minimum: 4 product loops, 20 systems, 30 motions, 40 campaigns, 120 bets, 30 outcomes, 20 wall items, 12 teammates. Assert first stable frame, virtualization after framing, no full-card miniaturization, outline completeness, and bounded focus.

### Stale/offline

- Last verified architecture remains visible with age.
- Architecture writes, direction, and wall decisions disable.
- No derived “new pressure” appears while stale.
- Reconnection restores selection/draft/camera and revalidates revision.

### Keyboard/accessibility

- All entities reachable through outline; Arrow/Home/End/Enter/Escape work.
- Semantic drag has keyboard equivalent.
- Visible focus, accessible names, headings, and live regions.
- Truth/pressure/authority remain distinguishable in monochrome.
- WCAG 2.2 AA contrast at both sizes and browser zoom.

### Reduced motion

- Camera and architecture-change travel become immediate.
- Final selected/returned/released state remains equally legible.
- No ambient work animation exists.

### Viewports and browser zoom

- Full journey at 1440×900 and 1280×800, normal and reduced motion.
- 125% browser zoom at effective 1024×640 CSS viewport.
- Composer, wall action, omission boundary, outline, and focused trace remain reachable.
- No desktop content relies on phone/tablet reflow.

### Unrelated-venture portability

DenialShield must express claim intake, payer intelligence, consultant-led and outbound motions sharing denial evidence, a bounded prevention pilot, uncertain product/self-serve bets, exact product/market releases, and attributable/unattributed outcomes without schema changes or Buffalo words.

Deterministic tests prove mechanics, isolation, truth grammar, and layout bounds. They do not prove founder comprehension, market value, or outside-founder success.

## 11. Prototype evidence

The self-contained prototype is `docs/design/venture-architecture-adaptation/index.html`. It uses current warm mineral tokens, contains no dependency or production route, and includes Buffalo Projects and DenialShield fixtures.

The local Chrome DevTools harness rendered and interacted with:

- Buffalo venture opening at 1440×900.
- Shared system used by two motions.
- Campaign focus and campaign → bet → release → return trace.
- Exact wall-held release and “nothing crossed” statement.
- Returned outcome with “joined, not caused” grammar.
- Hidden and revealed machinery.
- Keyboard-opened outline and Escape close.
- Venture switch with isolated content.
- DenialShield at 1280×800 with reduced motion.

Evidence files:

- `evidence/buffalo-venture-1440x900.png`
- `evidence/buffalo-campaign-trace-1440x900.png`
- `evidence/buffalo-outcome-trace-1440x900.png`
- `evidence/buffalo-machinery-revealed-1440x900.png`
- `evidence/denialshield-venture-1280x800-reduced-motion.png`
- `evidence.json`

`verify.mjs` is repeatable while a local server runs on port 4178. Its browser assertions cover viewport bounds, control naming, required opening truth, shared-system semantics, campaign/release/outcome interactions, machinery, keyboard outline, venture portability, and reduced motion.

Visual inspection found the default compositions coherent at both sizes after moving the architecture bands below the intent block. The final campaign capture uses the later settled viewport frame to avoid a transient headless-compositor tile seen during the first capture. The prototype is a decision artifact, not user proof.

## 12. Risks and kill conditions

### Principal risks

1. **Architecture administration replaces venture operation.** Mitigation: natural-language proposals, direct manipulation, four record kinds, no status/stage/forms by default.
2. **The document becomes a disguised object graph.** Mitigation: structural fields, no generic edge list, explicit rejected concepts, one collection.
3. **False causality enters through attractive traces.** Mitigation: exact join vs structural context vs inference are separate grammar and tests.
4. **Agent prompts become bloated.** Mitigation: selection slices, omission boundaries, pinned revisions, and measured context budgets.
5. **The far view becomes an architecture diagram.** Mitigation: return-first composition, actor/value language, active consequence, wall, and real outcomes.
6. **Product architecture becomes subordinate to GTM.** Mitigation: product loop is an independent durable architecture record; motions can expose or challenge product capabilities.
7. **Singleton contention.** Mitigation: CAS revisions are acceptable for a solo founder alpha; reconsider only after observed collaboration contention.
8. **Current dirty work is overwritten.** Mitigation: this pass changes no production file.

### Global kill conditions

Stop the adaptation if repeated real use shows the architecture is consulted as documentation but does not change next work; if founders prefer direct bet operation and ignore the architecture; if causal truth cannot be understood without training; if the singleton repeatedly blocks safe edits; or if the model requires generic nodes, lifecycle stages, multiple stores, or a compiler to function.

## 13. Unresolved decisions requiring Jacob

No decision blocks the proposed seven-day slice. Two choices should be made after interacting with the prototype, before production authority is amended:

1. **Founder-facing product-loop name.** Recommendation: show “How value happens” at venture altitude and reveal “Product loop” at architecture depth. “Product architecture” remains the region label, not a record type the founder must administer.
2. **Direct semantic drag versus proposal-only architecture changes in slice one.** Recommendation: allow direct reorder/attach for unambiguous relationships with an immediate revision receipt; route natural-language or multi-record changes through proposals.

Everything else is decided enough to test: one architecture document, durable product loop/system/motion/campaign, no durable release, existing bet/outcome physics, evidence-qualified traces, founder-applied architecture changes, and machinery behind inspection.
