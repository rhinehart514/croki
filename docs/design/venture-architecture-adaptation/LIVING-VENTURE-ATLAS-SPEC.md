# Living Venture Atlas

Status: selected and mechanically implemented design-level contract  
Decision date: 2026-07-15  
Founder: Jacob  
Authority: `../../FIRM-SPEC.md` governs product direction; `../../STATE.md` governs implementation proof

This specification supersedes the ontology and UX recommendation in `DECISION-PACKAGE.md` where they
conflict. The repository audit, conflict receipt, and retained product physics in that package remain
dated evidence. `AUTHORITY-CHANGESET.md` records the doctrine edits that made this direction
repository-wide authority; current production claims live only in `../../STATE.md`.

## 1. Decision

Drover becomes a living venture atlas: one continuous, spatial model of how a venture creates value, reaches the market, acts, and learns.

The atlas is open enough for Jacob to name and connect concepts Drover has never anticipated. A small operational kernel lets selected parts of that map govern teammate context, campaigns, bets, exact releases, the wall, and returned outcomes.

The product is not:

- a blank whiteboard Jacob must maintain;
- a generated diagram that silently changes between sessions;
- a database browser for systems, motions, and campaigns;
- a workflow editor exposing agent machinery;
- a separate product-management and campaign-management suite;
- a graph whose visual placement is business truth.

The decisive distinction is:

- **Open architecture material** records what matters in Jacob's understanding.
- **Operational roles** record where Drover may change execution, attribution, prioritization, or founder authority.
- **Receipts and evidence** record what actually happened and what joins are supportable.
- **Placement** records only how the current map is composed.

## 2. Founder promise

Within three seconds of opening a venture, Jacob can identify:

1. what the venture is trying to make true;
2. how its product creates value;
3. which routes to value are active;
4. where current campaigns apply pressure;
5. what is approaching the wall;
6. what reality recently returned; and
7. what requires founder judgment.

Within one continuous canvas, Jacob can then:

- add an untyped concept without completing a form;
- connect it tentatively to the existing model;
- make it operational when doing so becomes useful;
- trace an operational path into its campaign, bet, exact work, wall receipt, and outcome;
- see which claims are founder direction, repository-grounded, inferred, evidence-supported, challenged, or unattributed;
- direct the selected context through the same composer; and
- reveal teammate and runtime machinery only when inspecting execution.

Repeated use must accumulate founder language, architecture revisions, product truth, release lineage, decision receipts, and attributable outcomes. If it does not alter what Drover prepares or works on next, it has failed.

## 3. Mental model

The atlas uses ordinary language at rest. Formal role names appear when they help prediction.

| Founder sees | Means | Operational consequence |
|---|---|---|
| A thought | Something Jacob wants to preserve without classifying yet | None beyond selection and conversation context |
| A named area | A meaningful grouping such as a market door, product concern, or strategic territory | Supplies context; does not create a workflow |
| How value happens | An intended actor-to-value product loop | Grounds product and motion context |
| A capability we can reuse | A system | Can power several motions without duplication |
| A repeatable route to value | A motion | Can be activated by campaigns and targeted by direction |
| What we are activating now | A campaign | Supplies audience, objective, primary motion, governing bet, and measurement contract |
| What we are unsure about | A bet | Receives fork, work, ending, and outcome lineage |
| What may cross into the world | An exact release projection | Requires the wall when consequential |
| What reality returned | An outcome or unattributed signal | May support or challenge architecture only through an explicit basis |

A system is a reusable ability. A motion is a repeatable journey that uses abilities. A campaign is a bounded attempt to run a journey for a specific audience and objective. A bet is the uncertain claim that attempt tests.

## 4. Design doctrine

### 4.1 Simple at rest

The opening atlas is composed, not blank. Drover uses current founder-confirmed architecture and live records to create a stable, sparse default view. Tool palettes, schemas, agent avatars, configuration, and property panels remain absent.

### 4.2 Open when shaping

Jacob can type anywhere, name an area, connect two things, or move material without choosing a type first. Drover never interrupts ordinary expression with an object-kind modal.

### 4.3 Explicit when consequential

The moment an edit would alter runtime context, campaign attribution, referential integrity, or founder authority, the UI names the consequence. Founder-originated direct edits apply immediately with undo. Teammate or inferred edits require an evidence-backed proposal and founder acceptance.

### 4.4 Spatial continuity

Zoom and focus change representation without navigating to noun-specific routes. A focused trace grows from its position in the atlas; backing out returns to the previous camera and selection. Venture switching is the only normal context replacement.

### 4.5 Honest under pressure

Pressure is expressed as a concrete reason: held release, challenged claim, shared-system contention, missing product capability, absent evidence, contradictory founder assertions, or stale source. Drover never compresses these into a universal score.

## 5. Durable model

All architecture lives inside the existing venture state and isolation boundary. There is one current architecture document, an append-only revision journal, and existing bet, work, wall, outcome, conversation, configuration, and placement collections. There is no second database and no parallel canvas authority.

### 5.1 Architecture document

```json
{
  "schemaVersion": 1,
  "ventureId": "venture-buffalo",
  "revision": 17,
  "intent": {
    "statement": "Talented builders find the right people through credible work, not polished profiles.",
    "constraints": ["Matched cohort remains the product center."]
  },
  "elements": [],
  "connections": [],
  "groups": [],
  "evidenceAnnotations": [],
  "updatedAt": "2026-07-15T14:00:00.000Z",
  "updatedBy": { "authority": "founder", "id": "jacob" }
}
```

The current document is a readable snapshot. Every accepted mutation also writes an architecture revision receipt containing revision number, actor, source, before/after semantic diff, affected targets, reason, and timestamp. Revisions are not a second store of current truth; they are history.

### 5.2 Stable element envelope

Every meaningful item shares one identity envelope:

```json
{
  "id": "arch-department-champions",
  "role": "concept",
  "name": "Department champions",
  "statement": "Possible human bridge into a sponsored cohort.",
  "provenance": {
    "kind": "founder-authored",
    "createdAt": "2026-07-15T14:00:00.000Z"
  }
}
```

`role` is a tagged union discriminator, not a universal type system. Allowed current roles are `concept`, `product-loop`, `system`, `motion`, and `campaign`. Bet, release, outcome, teammate, workpiece, and repository artifacts remain external durable records referenced through typed target refs.

All roles have `id`, `role`, `name`, optional `statement`, and `provenance`. Role-specific fields are the only additional schema.

### 5.3 Concept

A concept preserves founder-defined architecture material without claiming an operational meaning.

Minimum fields: the stable envelope. Optional fields: `sourceRefs` and open `aliases` used only for search and inference reconciliation.

Concepts may be selected, grouped, linked, discussed, proposed for a role, and cited by operational elements. They do not independently alter runtime instructions, attribution, return ordering, or wall behavior.

Examples include actors, needs, promises, offerings, product capabilities, surfaces, distribution doors, constraints, questions, and venture-specific ideas. These do not require host-level entity types.

### 5.4 Product loop

```json
{
  "id": "arch-loop-builder-proof",
  "role": "product-loop",
  "name": "Work becomes credible proof",
  "actor": "Recent graduate",
  "entry": "Has something real to build",
  "steps": [
    { "id": "step-describe", "label": "Describes the work", "conceptRefs": ["arch-project-drop"] },
    { "id": "step-compose", "label": "Enters a deliberately composed cohort" },
    { "id": "step-work", "label": "Performs real work" },
    { "id": "step-proof", "label": "Leaves credible proof" },
    { "id": "step-return", "label": "Finds people or institutional opportunity" }
  ],
  "value": "Credible proof and better collaborators",
  "intendedChange": "Useful work begins before identity",
  "repositoryRefs": ["repo:src/domain/work-entry.ts"]
}
```

Ordered steps make the loop targetable and traceable. Step labels remain venture-authored. Drover does not provide a universal product-management taxonomy.

### 5.5 System

```json
{
  "id": "arch-system-work-proof",
  "role": "system",
  "name": "Work record and proof",
  "does": "Turns atomic work entries into credible, reusable proof.",
  "supportsProductRefs": ["arch-loop-builder-proof#step-proof"],
  "repositoryRefs": ["repo:src/domain/work-entry.ts"]
}
```

A system must express a reusable capability. It has no maturity, status, channel, owner, score, or campaign stage. Reuse is derived by counting inbound motion references; a system with no current motion is not automatically bad.

### 5.6 Motion

```json
{
  "id": "arch-motion-graduate",
  "role": "motion",
  "name": "Project-first graduate entry",
  "actor": "Recent graduate",
  "entry": "A project worth advancing",
  "value": "A matched working group and credible proof",
  "systemIds": [
    "arch-system-intake",
    "arch-system-cohort",
    "arch-system-work-proof"
  ],
  "productRefs": ["arch-loop-builder-proof"],
  "repeatabilityClaim": "A qualified builder can enter through work, join a cohort, and create proof that attracts the next participant."
}
```

The order of `systemIds` expresses the intended route, not a workflow that agents execute step-by-step. Motions do not have stored status or health. Current activation, evidence, and pressure are projections.

### 5.7 Campaign

```json
{
  "id": "arch-campaign-first-drops",
  "role": "campaign",
  "name": "First twenty project drops",
  "audience": "Recent graduates with a project worth advancing",
  "objective": "Produce qualified work descriptions before profile creation",
  "primaryMotionId": "arch-motion-graduate",
  "motionIds": ["arch-motion-graduate"],
  "governingBetId": "bet-project-first",
  "supportingBetIds": ["bet-free-demand"],
  "measurement": {
    "observation": "A qualified project is described before identity setup",
    "window": "First twenty accepted project drops"
  },
  "bounds": {
    "startsAt": "2026-07-15T00:00:00.000Z",
    "endsAt": null
  }
}
```

`bounds` describes the founder's intended activation boundary. It is not a lifecycle stage. A campaign without an end time is valid if another bounded condition is written in `measurement.window`.

One campaign may touch several motions but must have one primary motion. It may have several bets but must have one governing bet. Supporting bets cannot receive primary attribution merely because they share the campaign.

### 5.8 Open connection

```json
{
  "id": "connection-champions-institutional",
  "fromRef": "architecture:arch-department-champions",
  "toRef": "architecture:arch-motion-institutional",
  "label": "may open the door to",
  "assertion": "tentative",
  "source": { "kind": "founder-authored" }
}
```

Open connections preserve meaningful founder language and spatial traceability. `assertion` is only `tentative` or `founder-asserted`. It is not evidence confidence.

Open connections do not power motions, activate campaigns, govern bets, or establish outcome causality. Those consequences require role-specific structural fields or evidence annotations.

This is intentionally not a universal edge taxonomy. The label is open text. Only source and target validity, venture isolation, and assertion authority are enforced.

### 5.9 Named group

```json
{
  "id": "group-campus-door",
  "name": "Campus distribution door",
  "statement": "The first institutional opening, not the product ceiling.",
  "memberRefs": [
    "architecture:arch-department-champions",
    "architecture:arch-motion-institutional"
  ]
}
```

A named group preserves semantic membership. Its geometry, bounds, fill, ordering, and collapsed state remain placement. Unnamed multi-selection groups are placement only.

### 5.10 Evidence annotation

```json
{
  "id": "evidence-drop-return",
  "subjectRef": "architecture:arch-motion-graduate",
  "evidenceRef": "outcome:outcome-drop-six",
  "stance": "supports",
  "basis": "captured-join",
  "note": "Supports work-first entry for this observed sample; does not establish channel-level causality.",
  "appliedBy": { "authority": "founder", "id": "jacob" },
  "appliedAt": "2026-07-15T15:00:00.000Z"
}
```

Allowed stances are `supports` and `challenges`. Allowed bases are `repository-citation`, `captured-join`, and `founder-confirmed`. The annotation always preserves its note and evidence identity. An outcome does not update architecture by itself.

### 5.11 Targets

All cross-record references use one venture-scoped target envelope:

```json
{
  "kind": "architecture",
  "id": "arch-motion-graduate",
  "stepId": null
}
```

Allowed kinds are `venture`, `architecture`, `bet`, `work`, `wall-item`, `outcome`, `teammate`, and current compatibility targets. Target resolution always includes the current venture; an ID from another venture is indistinguishable from missing.

### 5.12 Placement

Placement stores camera state, element coordinates, group geometry, z-order, collapsed presentation, manual route bends, and optional decorative strokes. Deleting placement must regenerate a deterministic atlas without losing architecture meaning, relationships, selection targets, history, or receipts.

Freehand drawing, decorative arrows, and unlabeled frames are placement. Named concepts, labeled connections, and named groups are architecture. The UI makes that boundary clear when deleting or exporting.

## 6. Mutation and authority

### 6.1 Founder direct edit

Founder actions inside an authenticated founder session may create, edit, connect, group, move, promote, demote, detach, or remove architecture. These edits do not cross into the external world and do not require the wall.

Semantic edits apply immediately, produce an architecture revision receipt, and expose Undo. Placement edits follow the existing placement path and do not produce domain receipts.

### 6.2 Teammate proposal

Teammates and MCP clients may read current architecture and create proposed semantic patches. Every proposal includes:

- base revision;
- plain-language intent;
- exact semantic patch;
- affected execution contexts;
- evidence or founder-conversation source;
- unresolved assumptions; and
- proposer identity/configuration receipt.

Proposals appear as ghosts adjacent to the relevant map context, never as accepted architecture. Jacob may accept all, accept a subset, revise in conversation, or reject. Rejection writes a taste/decision receipt but does not pollute current architecture.

### 6.3 Inference

Repository scanning and conversation interpretation may suggest concepts, product loops, system links, or contradictions. Inference never writes current architecture. A proposal derived from repository truth cites exact paths and revision identity. A proposal derived from conversation cites its conversation entry.

Drover reconciles suggestions by stable IDs, aliases, and founder-confirmed identity. It never silently merges two similarly named elements.

### 6.4 Promotion

Promotion changes one element's role while preserving its ID, name, history, open connections, and placement.

1. Jacob selects an ordinary concept.
2. He says or chooses the operational meaning, such as “Use this as a system.”
3. Drover asks only for missing role invariants that cannot be inferred from the selected context.
4. Drover previews execution and relationship consequences in plain language.
5. Jacob applies the change; the revision receipt records before and after.

Promotion is not required to connect or discuss a concept. It is required before that concept can occupy a role-specific structural field.

### 6.5 Demotion

Demotion returns an operational element to `concept` while preserving name, statement, history, open connections, and placement. It is blocked while role-specific inbound references remain unless the same atomic patch detaches or rewires them. Historical campaign, bet, wall, and outcome receipts never disappear.

### 6.6 Deletion

“Remove from current architecture” is the normal semantic operation. It creates a revision that removes the current element while history preserves prior identity.

- Unreferenced concepts remove immediately with Undo.
- Referenced concepts require a plain-language impact confirmation.
- Operational elements require an atomic detach, rewire, or cancel.
- Campaign removal never deletes bets, work, releases, wall receipts, or outcomes.
- Bet and outcome deletion remain governed by existing rules.
- Placement deletion never invokes semantic deletion.

### 6.7 Concurrency

Semantic mutations use optimistic concurrency against architecture revision. A stale patch is rejected with the current semantic diff and may be rebased. Placement continues using its own merge behavior because it is not business truth.

## 7. Projection and visual grammar

The atlas is a projection of architecture plus live bet/work/wall/outcome state. The projection contains no independently mutable domain nodes or edges.

### 7.1 Visual materials

| Meaning | Visual material | Non-color cue |
|---|---|---|
| Open concept | Plain label or paper-like fragment | Uneven/open edge and no role glyph |
| Named group | Quiet territorial boundary | Title embedded in boundary |
| Product loop | Continuous sequence through product terrain | Ordered beats and return curve |
| System | Stable landmark | Layered/stratified glyph and compact capability statement |
| Motion | Route crossing systems | Repeated path rhythm and actor/value endpoints |
| Campaign | Temporary pressure wrapped around part of a route | Bracket/envelope and bounded label |
| Bet | Claim aperture | Distinct claim-shaped opening, not a task card |
| Release | Artifact approaching the wall | Exact-work edge and wallward orientation |
| Outcome | Returning impression | Inbound shape and source identity |
| Founder authority | Wall and decision seal | Physical boundary and explicit receipt |
| Teammate contribution | Small attribution mark at inspection depth | Name/configuration receipt, never avatar grid |

### 7.2 Relationship truth

- Structural role relationships use continuous paths.
- Founder-asserted open connections use a light continuous stroke with their language on the path.
- Tentative connections use a broken stroke and question-shaped endpoint.
- Evidence annotations carry a source token and stance mark at the subject.
- Derived exact joins use a continuous trace with a receipt icon.
- Inference uses a ghost stroke and never appears identical to accepted architecture.
- Unattributed signals stop near the atlas edge and do not connect themselves.

Color reinforces these differences but never carries them alone.

### 7.3 Pressure

Pressure is a localized deformation or interruption with a written reason on focus. Allowed derived reasons are:

- `held-release`;
- `challenged-claim`;
- `shared-system-contention`;
- `missing-product-capability`;
- `missing-evidence`;
- `founder-assertion-conflict`;
- `stale-source`;
- `blocked-work`; and
- `unattributed-return`.

The enum belongs to projection logic and test fixtures, not the durable architecture schema. Multiple reasons remain separate. No score, severity color taxonomy, or synthetic health field is stored.

## 8. Semantic zoom and focus

Semantic altitude is driven by camera scale plus explicit focus. Production does not require an altitude tab bar; keyboard and outline commands provide deterministic access.

### Venture altitude

Show intent, the product loop silhouette, named architecture territories, active motion routes, localized campaign pressure, the nearest held release, recent returned reality, and founder judgment. Systems appear only as named landmarks essential to understanding the routes. Concepts collapse into group labels or meaningful exceptions. Agents remain absent.

### Architecture altitude

Show open concepts, named groups, product-loop detail, reusable systems, motions crossing shared systems, open connections, missing product/GTM links, and evidence qualification. Campaigns remain compact pressure envelopes.

### Motion altitude

Show actor, entry, systems in intended order, product value delivered, repeatability claim, campaigns, supporting/challenging evidence, current releases, and system contention. Keep enough neighboring architecture to preserve orientation and show an omission boundary.

### Campaign altitude

Show audience, objective, primary motion, touched motions, governing and supporting bets, measurement contract, exact staged releases, held effects, returned outcomes, dependencies, and decisions. Do not render tasks, stages, or a timeline.

### Bet/work altitude

Use the current Workyard strengths: exact staged work, evidence, fork lineage, contributors, product diffs, worktrees, wall effects, decisions, outcomes, and local conversation.

### Machinery depth

Reveal runtime, model, configuration revision, coordination, tools, work logs, costs, and credentials as receipts associated with selected execution. Machinery is not a zoom altitude in the primary map; it is an explicit “How this runs” reveal.

### Focus behavior

Enter or double-click focuses. The selected object remains spatially anchored while its relevant trace expands. Unrelated content quiets but remains visible enough to communicate omission. Escape restores the previous camera and selection. “Show whole venture” fits the deterministic current projection, not every historical record.

## 9. Core interactions

### 9.1 Open after time away

The return band names only material changes since the founder cursor: one required judgment, one recent return, and one pressure change. The atlas beneath it remains the stable venture map. Selecting a return beat traces it into architecture and receipts.

### 9.2 Create an open concept

Double-click blank canvas, press `N`, or direct the composer. An inline text caret appears at the target position. Enter creates a concept; Shift+Enter adds its statement. Escape cancels. No type prompt appears. Screen readers receive an equivalent dialog with name and optional statement.

### 9.3 Connect concepts

Drag from a selected object's relationship handle or say “Connect this to …”. Dropping creates a tentative open connection and immediately places its label in edit mode. A blank generic arrow is not durable; cancelling the label keeps only an optional decorative placement stroke.

### 9.4 Make something operational

Selection exposes one contextual action: “Use in Drover.” It opens a compact role chooser with plain descriptions, not schema names. Conversation is the primary path for ambiguous promotion. The preview states what execution context, relationships, and return behavior will change.

### 9.5 Create or revise a motion

Jacob can draw a route through existing systems or state the route in conversation. A drawn route becomes a motion only after actor, entry, value, and repeatability claim are present. Drover proposes missing language from surrounding context. Reordering systems changes intended architecture, not a workflow execution sequence.

### 9.6 Start a campaign

With a motion selected, Jacob says “Run this for …” or uses “Activate this motion.” The composer inherits the motion. Drover asks only for audience, objective, governing uncertainty, and observation contract. It may fork or attach a bet after Jacob confirms the campaign contract. The campaign appears as a bounded pressure envelope within the motion.

### 9.7 Direct work

Any selected architecture target enters conversation context. Direction may create or fork bets and stage work through existing work-loop mechanics. Runtime context contains a bounded architecture slice: selected target, intent, parent trace, relevant product loop, systems, active campaign contract, evidence qualifications, contradictions, and explicit omissions.

### 9.8 Review at the wall

Selecting a release follows exact work to the wall without changing routes. Wall review shows artifact/diff, intended consequence, campaign/bet context, evidence, contributor receipt, and what the architecture predicts. Only Jacob can release, hold, revise, or decline. Architecture editing never grants outward authority.

### 9.9 Receive an outcome

An outcome enters from the world with captured source identity. Exact joins illuminate the path back to release, bet, campaign, and motion. The path label says “joined through,” not “caused by.” Drover proposes support/challenge annotations with explicit basis. Until Jacob applies one, current architecture is unchanged.

### 9.10 Compare pressure

At venture or architecture altitude, selecting “pressure” emphasizes each localized reason across motions. Shared systems show concurrent dependencies without inventing allocation percentages. The comparison ranks founder-required judgments first, then held releases, challenged claims, blocked work, missing evidence, and inactive areas—with the reason visible.

### 9.11 Undo and history

Every founder semantic edit offers immediate Undo and remains accessible in architecture history. Undo is a new forward revision, never destructive history rewriting. Jacob can compare revisions and restore selected semantic changes without restoring placement.

## 10. Composer contract

Selection is the universal targeting gesture. The composer target chip always names the selected element and its role, if any. The outgoing conversation entry stores the target ref and architecture revision used to construct context.

The context builder includes only the smallest truthful slice:

- venture intent;
- selected element;
- containing named groups;
- structural parents/children relevant to the request;
- open connections explicitly mentioned or one hop from selection;
- live campaign/bet/work context;
- evidence labels and source refs;
- relevant repository citations; and
- an omission summary.

Concept selection supplies descriptive context but no operational instruction by itself. An operational target may alter teammate prioritization and proposal scope. Workpiece targeting remains exact and overrides broader architecture for edit scope while retaining the parent trace.

## 11. Execution consequences

Architecture is valuable only if these effects are implemented:

1. Work-loop briefs receive the selected architecture slice and revision.
2. Campaign governing bets are prioritized over supporting bets when attribution or return ordering requires a primary claim.
3. Product-loop and system context constrain repository work and surface missing capability proposals.
4. Architecture evidence annotations change which contradictions and unknowns appear in the next brief.
5. Return briefs group consequences by affected architecture and prioritize founder judgment.
6. Architecture changes invalidate or flag stale pending drives whose context revision no longer applies; they do not silently rewrite running work.
7. A removed campaign detaches current activation context but never erases bet, work, wall, or outcome lineage.
8. Accepted architecture proposals become durable founder decision receipts and influence later inference.

If the vertical slice cannot demonstrate items 1, 4, and 5, the atlas is presentation only and must not ship.

## 12. Return brief

The return brief is projected in this order:

1. founder decisions required;
2. held or failed outward consequences;
3. returned outcomes with exact joins;
4. architecture challenges and contradictions;
5. product capability gaps exposed by GTM work;
6. shared-system pressure affecting multiple motions;
7. completed internal work; and
8. machinery receipts on demand.

Every item names affected architecture, evidence strength, exact source, and why it is being shown. The brief does not summarize all activity or imply that absence of evidence is failure.

## 13. Empty, dense, stale, and adverse states

### Empty venture

Show repository binding, one conversational invitation—“What are you trying to make true?”—and any evidence-backed architecture proposals as separate ghosts. Do not generate a polished architecture automatically. After intent, Drover may propose one product loop from repository/conversation evidence.

### Dense venture

At distance, aggregate by semantic group and motion route, not card count. Labels collide deterministically: selected, founder-held, returned, and pressured items win. Focus composes a bounded trace and states what is omitted. The outline provides complete deterministic access.

### Stale sources

Freshness attaches to the source projection that is stale: repository, market connector, teammate drive, or wall execution. Founder-authored architecture remains available. Stale evidence cannot silently strengthen an annotation or trigger a new drive.

### Offline

Local architecture and placement edits continue and write local receipts. Repository-grounded claims use the last verified revision and say so. External outcomes cannot be fetched, outward wall actions remain unavailable, and queued semantic proposals state their base revision. No fake live animation appears.

### Conflict

Concurrent semantic conflicts show the two plain-language changes and their affected targets. Jacob chooses, combines, or restates through conversation. Drover never resolves founder-intent conflicts by last-write-wins.

### Failed inference

If Drover cannot reconcile a proposed element with current identity, it creates a proposal marked “possibly duplicates …” and asks no blocking question until Jacob inspects it.

## 14. Accessibility and input

- Every canvas object is reachable through the deterministic outline.
- `N` creates a concept; Enter focuses; Space selects; Escape broadens/cancels; Delete invokes the appropriate semantic or placement boundary; Command/Ctrl+Z writes an undo revision for semantic changes.
- Arrow keys traverse the outline and spatial nearest neighbors.
- Screen-reader labels state role, name, pressure reason, relationship count, and selection state without narrating coordinates.
- Connect and promotion flows have keyboard equivalents.
- Focus order follows the composed trace, not DOM creation order.
- Zoom never becomes the only way to reveal information; outline and focus commands expose the same content.
- At 200% browser zoom, the canvas remains operable through pan, focus, composer, and outline.
- Reduced motion replaces travel, release, return, fork, and architecture-change animation with immediate state changes and persistent receipts.
- Color is never the sole carrier of role, evidence, pressure, selection, or authority.

Desktop targets are 1440×900 and 1280×800. Phone and tablet remain explicitly out of scope.

## 15. Persistence and write paths

Extend the venture store with:

```json
{
  "architecture": {
    "current": {},
    "revisions": [],
    "proposals": []
  }
}
```

Large revision histories may later move to a venture-local append-only file if measured size requires it, but the first implementation uses the current readable venture persistence conventions. No SQLite, graph database, cache authority, or cross-venture index is introduced.

Read path:

1. load venture state;
2. validate current architecture and all refs inside the venture;
3. join live bets/work/wall/outcomes read-only;
4. derive pressure and semantic projection;
5. join placement by stable presentation key;
6. build focus scene and outline.

Write path:

1. authenticate founder or accepted proposal authority;
2. validate base revision and patch operations;
3. enforce role invariants and referential integrity;
4. calculate affected execution contexts;
5. atomically write current document and revision receipt;
6. notify projections and mark incompatible pending drives stale;
7. never execute an outward effect.

Placement writes continue separately and cannot alter architecture content or refs.

## 16. API contract

Recommended endpoints within existing firm routes:

- `GET /api/firm/architecture` — current document, revision, permissions, proposal counts.
- `GET /api/firm/architecture/projection` — semantic atlas plus live joined state; no placement authority.
- `POST /api/firm/architecture/mutations` — founder semantic patch against base revision.
- `POST /api/firm/architecture/proposals` — teammate/MCP proposal.
- `POST /api/firm/architecture/proposals/:id/decide` — founder accept, partial accept, revise, or reject.
- `GET /api/firm/architecture/revisions` — paged semantic history.
- `POST /api/firm/architecture/revisions/:id/restore` — produce a new revision from selected prior semantics.

Mutation operations are finite and semantic: `create-element`, `update-element`, `change-role`, `remove-element`, `create-connection`, `update-connection`, `remove-connection`, `create-group`, `update-group`, `remove-group`, `apply-evidence`, and `remove-evidence`. The API does not expose arbitrary JSON Patch against the venture file.

Every response includes the current architecture revision. Errors distinguish stale revision, invalid role invariant, cross-venture/missing ref, authority denial, and active-reference conflict.

## 17. MCP contract

Add provider-neutral tools:

- `read_venture_architecture`
- `read_architecture_context`
- `propose_architecture_change`
- `list_architecture_proposals`
- `explain_architecture_pressure`

Do not expose `apply_architecture_change` to teammate runtimes. Founder-facing host tools may apply after an explicit founder interaction, but capability issuance must remain separate from teammate configuration.

MCP reads include evidence qualification and omissions. Proposal writes require base revision, intent, semantic operations, evidence refs, and expected execution effect. Cross-venture refs fail closed.

## 18. Outcome joins

Join strength is derived, never stored as confidence:

1. **Exact:** captured outcome identity resolves to executed wall receipt and exact work/bet.
2. **Contextual:** exact bet resolves to governing/supporting campaign and motion at the architecture revision active when released.
3. **Founder-applied:** Jacob explicitly supports/challenges an architecture subject using that evidence.
4. **Inferred:** Drover proposes a relationship from content similarity or conversation.
5. **Unattributed:** no supported join exists.

Only levels 1–3 may render a continuous evidence trace. Contextual join does not imply causality. Architecture revisions captured on work and wall receipts prevent later architecture changes from rewriting historical context.

## 19. Transfer, isolation, and compatibility

Venture export includes current architecture, revisions, proposals, semantic groups/connections, evidence annotations, and placement. Imports validate all refs against the imported venture before activation.

Architecture IDs are venture-local. Transfer may preserve them inside the venture package. No portfolio-level system or motion is introduced.

Existing ventures receive schema version 1 with their current direction represented as intent when safely available and empty element collections. Existing bets remain unassigned to campaigns. Drover may propose mappings from bet refs and conversation, but never accepts them automatically.

Existing lens clients continue receiving teammate/bet projections until the architecture-capable client is active. Existing `gtm-ide`, `channel`, and `~/.gtm-ide` identifiers remain untouched. Historical exports continue to import without architecture.

## 20. Security and wall

- Architecture mutation requires founder authority or proposal acceptance.
- Teammates cannot forge founder provenance, evidence basis, accepted revision receipts, or outward capabilities.
- All target refs resolve through the current venture before lookup.
- Repository paths are normalized and constrained to the venture repository/worktree rules.
- Stored open text is treated as untrusted input at render and runtime boundaries.
- Architecture context never grants tools, credentials, or wall capabilities.
- Nothing sends, publishes, deploys, purchases, messages, or otherwise crosses into the world without existing wall authority.
- Founder-only bet ending remains unchanged.

## 21. Implementation architecture

### New backend modules

- `brain/src/firm/architecture.mjs` — schema, role invariants, target resolution, mutation application.
- `brain/src/firm/architecture-projection.mjs` — live joins, pressure reasons, semantic altitude projection.
- `brain/src/firm/architecture-context.mjs` — bounded conversation/runtime context and omission summary.
- `brain/src/firm/architecture-routes.mjs` — API transport only.

Keep each service below 500 LOC by separating schema/mutation, projection, and context responsibilities. Do not create entity-specific stores or services.

### Existing backend modules extended

- `venture-store.mjs` — default architecture collection, atomic persistence, revision/proposal retention.
- `venture-transfer.mjs` — export/import and ref validation.
- `lens.mjs` and lens routes — read the semantic projection and keep placement separate.
- `conversation.mjs` and routes — accept architecture targets and capture revision.
- `work-loop.mjs`, `work-loop-tools.mjs`, and coordination — consume bounded architecture context and react to stale revision.
- `wall.mjs` — capture architecture context revision on staged/released effects; no authority change.
- `market.mjs` — expose exact/contextual joins without architecture writes.
- `mcp-tools.mjs` — read and proposal tools.

### UI modules

- `ui/src/components/atlas/VentureAtlas.tsx` — shell and composition under 300 LOC.
- `AtlasCanvas.tsx` — camera, selection, keyboard delegation.
- `AtlasProjection.ts` — pure mapping from API projection to scene primitives.
- `AtlasOutline.tsx` — deterministic non-spatial access.
- `ArchitectureElement.tsx` — open concepts and role materials.
- `MotionRoute.tsx`, `CampaignPressure.tsx`, `EvidenceTrace.tsx`, `FounderWall.tsx` — stable domain visuals.
- `ArchitectureMutationPreview.tsx` — proposal/direct-edit consequences and conflict handling.
- `useAtlasCamera.ts`, `useAtlasSelection.ts`, `useArchitectureMutation.ts` — behavior seams.

Extend existing Workyard, composer, conversation, return brief, wall review, and machinery receipts. Do not duplicate them under `atlas/`.

### Code simplified or deleted after parity

- teammate-first far-view projection;
- card-shaped bet rendering at venture altitude;
- altitude-specific route assumptions replaced by focus scenes;
- anti-cage assertions that ban all new founder-facing structure;
- duplicate selection/ref parsing once the target envelope is authoritative.

Deletion occurs only after architecture parity tests pass. Historical implementations and identifiers are not casually renamed.

## 22. Rollout

### Slice 0 — authority and fixtures

Update authority documents and anti-cage doctrine. Add architecture fixture builders for Buffalo and DenialShield. No UI route changes.

### Slice 1 — read-only living atlas

Persist/import architecture, project the default atlas, focus shared systems and motion/campaign/bet/work traces, preserve wall and outcome joins, and include architecture context in one deterministic teammate drive. Existing lens remains available behind a local development flag.

### Slice 2 — founder shaping

Create/edit concepts, connections, and named groups; promote/demote roles; revision receipts; undo; architecture-aware composer; outline parity.

### Slice 3 — proposals and returns

Repository/conversation proposals, founder decisions, evidence annotations, architecture-aware return brief, stale drive handling, and outcome challenge flow.

### Slice 4 — replace primary lens

Make the atlas the venture opening only after desktop, accessibility, dense, transfer, isolation, wall, stale/offline, and unrelated-venture acceptance passes. Remove obsolete far-view code after a measured fallback period.

No slice introduces a second database, generic analytics, campaign stages, or autonomous outward action.

## 23. Verification

### Domain

- Tagged roles accept only their minimum invariants.
- Concepts remain valid without a role.
- Promotion preserves identity, open connections, history, and placement key.
- Operational refs reject missing/cross-venture targets.
- Demotion/removal cannot strand active structural refs.
- Campaign requires one primary motion and governing bet; supporting bets remain distinct.
- Open connections never create structural execution semantics.
- Placement deletion loses no architecture meaning.

### Authority and truth

- Teammates can propose but not apply.
- Founder direct semantic edit writes a receipt and undo revision.
- Architecture edits cannot issue outward capability.
- Bet ending remains founder-only.
- Outcome projection never labels contextual join as causality.
- Evidence annotations require a real same-venture evidence ref and allowed basis.
- Inference is visually and structurally separate from current truth.

### Execution

- Selecting a concept supplies descriptive context only.
- Selecting a motion supplies its bounded product/system/campaign/evidence slice.
- Architecture revision is captured on conversation, drive, work, and wall receipts.
- Relevant architecture change marks pending incompatible drive context stale.
- Applied challenge changes next brief prioritization.
- Removed campaign preserves bet/work/wall/outcome history.

### Projection and UX

- Three-second default truth is present at 1440×900 and 1280×800.
- Two motions share one rendered system identity.
- Open concepts and operational roles remain visibly predictable without color.
- Semantic zoom changes representation rather than scaling miniature cards.
- Focus preserves orientation and states omissions.
- Campaign reads as pressure within a motion.
- Exact release reaches existing wall review.
- Outcome trace exposes basis and source.
- Machinery is hidden by default and inspectable.
- Empty, dense, stale, offline, conflict, and unattributed states are honest.
- Outline has complete selection and action parity.
- Keyboard, screen reader names, reduced motion, 200% browser zoom, 1440×900, and 1280×800 pass.
- Buffalo and DenialShield require no schema or component variants.

### Transfer and compatibility

- Export/import round-trips semantic architecture, history, evidence, and placement.
- Import cannot bind refs to another local venture.
- Existing venture without architecture loads an explicit empty atlas.
- Older client receives compatible existing lens data during rollout.

Deterministic fixtures prove mechanics only. The product still requires Jacob's repeated use with a real venture and real attributable outcomes.

## 24. Seven-day behavioral test

Use Buffalo Projects for seven working days while preserving DenialShield as a portability fixture.

Success requires:

1. Jacob opens the atlas on at least five days and can state the venture change, active motion pressure, nearest release, and latest return without opening machinery.
2. Jacob adds at least three untyped concepts without schema administration.
3. At least one concept is promoted because execution needs it, not to satisfy the model.
4. Two motions visibly share one system without duplicate records.
5. One campaign direction creates or forks a real bet and stages exact work.
6. One wall decision retains its architecture context revision.
7. One attributable outcome produces an evidence proposal; Jacob accepts, revises, or rejects it.
8. That decision changes a later teammate brief or return priority.
9. DenialShield remains coherent without new schema or Buffalo language.

Instrument locally and minimally: time-to-first-orientation action, focus depth, concept creation, promotion/demotion, architecture-targeted direction, proposal decision, wall trace, return trace, and undo. Do not capture private content in product analytics without separate authority.

## 25. Kill conditions

Stop or revise the adaptation if any of these occur:

- Jacob must classify most thoughts before placing them.
- The opening atlas requires manual grooming to remain understandable.
- Architecture selection does not change teammate context or return priority.
- Open connections acquire hidden execution meaning.
- Agent proposals are mistaken for founder-confirmed architecture.
- Outcome traces visually imply unsupported causality.
- Campaigns become task containers or stages.
- Product architecture becomes a decorative area disconnected from GTM work.
- A shared system must be duplicated to appear in two motions.
- Placement deletion damages durable meaning.
- The model requires venture-specific schema.
- Runtime, tools, costs, or teammates dominate the default view.
- A second store becomes necessary before measured persistence limits justify it.

## 26. Decisions closed by this specification

- The chosen UX is a composed living atlas, not a blank smart whiteboard or trace-only product.
- Open founder-defined architecture is durable when it has a name or labeled relationship.
- Operational meaning uses five architecture roles: concept, product loop, system, motion, and campaign.
- Bet and outcome remain existing records; release remains derived from exact work and wall receipts.
- Direct founder semantic edits apply immediately with undo; agent changes are proposals.
- Open connections use founder language and never substitute for structural role fields.
- Named group meaning is durable; group geometry is placement.
- Production semantic zoom is camera/focus driven, not a permanent altitude tab bar.
- “Product loop” is the inspection-depth term; at rest Drover says “how value happens.”
- Direct semantic manipulation ships in founder-shaping Slice 2, after read-only projection proves comprehension.
- The atlas becomes primary only after execution coupling, portability, wall, accessibility, and dense-state gates pass.

There are no remaining ordinary product-preference decisions required before implementation planning. New authority is required only for external integrations, spending, destructive migration, or production release.

## 27. Prototype evidence

The standalone prototype demonstrates the contract without a production route or backend:

- `evidence/buffalo-venture-1440x900.png` — composed venture opening;
- `evidence/buffalo-open-concept-1440x900.png` — founder-defined concepts and contextual inspection with no execution effect;
- `evidence/buffalo-operational-promotion-1440x900.png` — founder-applied promotion into a reusable system;
- `evidence/buffalo-campaign-trace-1440x900.png` — campaign within a motion;
- `evidence/buffalo-outcome-trace-1440x900.png` — outcome joined without causal overclaim;
- `evidence/buffalo-machinery-revealed-1440x900.png` — machinery behind the architecture; and
- `evidence/denialshield-venture-1280x800-reduced-motion.png` — unrelated venture portability and reduced motion.

`verify.mjs` rendered and interacted through Chrome at 1440×900 and 1280×800. It exercised open concept inspection, founder promotion, keyboard concept creation, shared system focus, campaign/bet/release/outcome traces, wall, machinery, outline, venture isolation, and reduced motion. `evidence.json` is the machine-readable receipt.

This is deterministic mechanical and visual evidence, not outside-founder proof or proof that the production architecture changes real work.
