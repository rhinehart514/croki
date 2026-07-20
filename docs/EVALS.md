# Drover evals

**Status:** current acceptance contract, revised 2026-07-18.

[FIRM-SPEC.md](FIRM-SPEC.md) defines the product. [STATE.md](STATE.md) is the only authority for what the
current tree proves. These evals define evidence required to advance that state; they do not turn an unrun
criterion into a completion claim. Superseded repository-change and GTM-engine evals are preserved in
[history/LEGACY-EVALS.md](history/LEGACY-EVALS.md).

## 1. One product language

- Founder surfaces use Drover, venture, direction, work, artifact, evidence, map, and exact consequence.
- Historical identifiers such as `bet`, `fork`, `outcome`, `teammate`, `gtm-ide`, and the legacy `channel`
  record may remain behind compatibility adapters. They are not required founder vocabulary or product
  ontology.
- Facts, evidence, interpretation, work state, and world consequences remain distinct.
- Runtime/model/configuration details remain inspectable receipts and never displace the work itself.

## 2. Venture truth and isolation

- A founder can create or reopen a venture bound to one real product repository.
- One canonical venture model backs workbench, conversation, map, views, work, and history.
- Product claims cite repository evidence or identify inference.
- Cross-venture reads, writes, founder-wall decisions, and returned evidence fail closed.
- Durable venture records remain local, readable, exportable, and honest about machine-local paths.

## 3. Workbench-first founder workspace

- Opening a venture lands on the permanent adaptive workbench, not the node map. With no selection,
  `VentureHome` shows where directions stand and what needs judgment.
- Selecting a direction, run, artifact, or decision opens the best registered representation for that work in
  the same center. The workbench is not a temporary overlay over a dimmed canvas.
- The spatial graph appears only after the founder explicitly summons Map.
- Selection and composer scope survive work-to-map and map-to-work transitions.
- Double-click or Enter on a selected map object returns to that work in the workbench.
- Escape broadens predictably: map to work, then selection or representation depth to `VentureHome`.
- The workspace index, conversation, workbench, map, and founder gate project the same venture-scoped
  identities rather than creating parallel navigation or truth stores.

## 4. Directing the venture

- One persistent conversation sits beside the adaptive workbench and summoned map.
- The composer is the action spine. With nothing selected, it directs the venture through `/drive`.
- With selected direction work, it continues the durable scoped conversation through
  `replyInConversation`; it does not silently start unrelated work.
- One exact scope is visible and survives mode changes. A presented scope must match the payload actually
  sent to the Brain.
- Every command names its target and exact next consequence. Runtime/model/cost remain quiet provenance.
- Missing runtime access produces a truthful, recoverable state.

## 5. Summoned venture map

- The map projects venture intent, Product value, go-to-market reach, active work, founder-held consequence,
  and returned reality before participant machinery.
- Open concepts, connections, and groups may remain descriptive. Operational roles are earned only when they
  unlock real execution, attribution, evidence, or reuse.
- Pan, zoom, authored placement, camera history, semantic focus, outline parity, dense omission, and
  empty/offline states remain usable at supported desktop viewports and browser zoom.
- Founder edits use compare-and-set revisions and restorable receipts. Models and MCP clients may read
  qualified context and propose changes, but cannot apply or promote canonical truth without the required
  founder act.
- Deleting placement loses no semantic venture truth or consequential record.

## 6. Work, alternatives, and product change

- Configured participants may answer, form genuinely different alternatives, consult another configured
  participant, stage artifacts, and ask the founder through the direct work loop.
- An implementation Run uses an isolated git worktree, records provider-session and checkpoint lineage,
  retains exact files, diff, commands, and verification, and survives restart without false completion.
- Separate attempts remain inspectable and comparable in one Thread. Apply, reverse apply, commit, branch/PR
  preparation, restore, and discard require an exact founder consequence and fail closed on lineage drift.
- A completed implementation projects its Product consequence and release or distribution question. Deploy
  keeps a second explicit authorization.
- Only the founder ends active work. Runtime completion never silently becomes founder-ended work.
- Work awaiting a founder decision remains inspectable and discussable without mutating the exact staged
  consequence.

## 7. Founder wall

- One non-forgeable boundary holds every world-touching consequence.
- Each item presents only decisions valid for its purpose and leaves a durable receipt.
- Away holds every outward act while inward work may continue.
- Unstamped browser, API, MCP, model/runtime, stored content, configuration, stale, replayed, forged,
  cross-origin, and prior-process claims fail closed.
- Batch review, a standing grant, or a model-authored instruction never becomes delegated release authority.
- Transport failure remains visible and retryable; it is never recorded as success.

## 8. Configuration, evidence, and continuation

- Venture configuration is readable, versioned, attributable, reversible, and incapable of expanding host
  authority.
- Closed choices exist only for finite adapter and safety mechanics. They do not become role, workflow, or
  market taxonomies.
- Evidence retains source, language, attribution strength, and uncertainty. Unsupported joins remain visible.
- Positive, negative, and zero returns may change later judgment without becoming sentiment scores or a
  founder-facing activity scoreboard.

## 9. Portfolio and transfer

- A portfolio founder boundary may show exact decisions from isolated ventures while conversation,
  configuration, map, work, spend, and evidence stay scoped to the selected venture.
- Export/import preserves readable durable identity and history while stripping machine-local bindings.
- Imported product work does not resume until the founder explicitly binds a valid destination repository.

## 10. Desktop experience

- Electron desktop is the production product. The browser is a deterministic development and test harness,
  not a second production surface.
- Verify the founder journey at 1440×900 and 1280×800 and through 200% browser zoom; phone and tablet layouts
  are not acceptance criteria.
- Keyboard focus, selection, map navigation, workbench descent, founder decisions, and composer use remain
  complete. Visible focus, semantic names, contrast, and reduced motion meet the WCAG 2.2 AA target.
- Work, map, selected scope, errors, loading, empty, dense, stale, offline, and founder-held states stay
  understandable without relying on color alone or clipping primary controls.

## Deterministic release gate

```sh
npm run test:acceptance
```

The command must pass Brain tests, UI unit tests, lint, production build, design-token parity, the preserved
firm browser journeys including native coding, the Atlas browser journeys, and the real Electron native-coding
receipt. Run `npm run test:atlas:fixtures` separately as a supporting fixture receipt. Record exact counts in
`STATE.md` only after rerunning them on the current tree.

The same complete gate runs on pushes to `main` and pull requests through the macOS GitHub Actions workflow.
The browser remains a deterministic harness. A green run does not prove live provider behavior,
world-touching effects, outside-founder comprehension, or market value; those require separate receipts.

## Alpha proof gate

The company direction remains unproven until an outside founder binds a real product, directs useful work,
releases an exact outward act, receives attributable positive, negative, or zero evidence, and chooses the
next move without intervention. Deterministic fixtures cannot satisfy this gate.
