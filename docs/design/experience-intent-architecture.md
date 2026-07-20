# Experience intent architecture

Status: accepted desktop direction, 2026-07-18. This audits the T3-shaped workbench against Drover's
founder intents and records the target architecture. It does not authorize mobile, responsive phone,
tablet, sheet, drawer, or off-canvas variants.

## Verdict

**FIX.** The visual hierarchy is calmer, but the current "continuous work thread" is still a composition of
independently derived snapshots. T3 feels inevitable because work identity and draft scope are stable before
the UI projects them. Drover reconstructs a founder-facing `Direction` from messages, bets, drives, walls,
and outcomes, then keeps visual selection and execution targeting in local component state.

The sharpest risk is not cosmetic: a founder can write against one selection, change selection, and send the
same text to another destination. Exact artifact selection also used to drop `workRef` and steer the parent
bet instead. The first correction in this audit binds drafts to exact scope and sends exact-work corrections
through the work route that preserves `betId + workRef`.

## Intent map

| Founder intent | Required experience contract | Current gap |
| --- | --- | --- |
| Return and understand | Consequence-led home; loading and failure never look empty | Initial load and venture-list failures can masquerade as first use |
| Resume work | One durable work identity restores thread, draft, result, and position | Rail/Home now read durable child threads when present; draft, scroll, deep link, and composer routing do not yet restore from `threadRef` |
| Direct new work | New direction creates or focuses an addressable draft | The command focuses the composer but no durable pre-send identity exists |
| Correct exact work | Visible subject and execution subject are identical | Immediate safeguard preserves `workRef`; conversation reply still lacks general subject refs |
| Compare approaches | Status reflects real activity; ended work cannot be steered | Corrected locally; durable reviewed/chosen disposition is still missing |
| Review consequences | Material appears at its causal place and review completion persists | Opening an indexed row advances exact review; the chronological material projection is still missing |
| Decide an outward act | Exact effect, authority boundary, correction, failure, and retry stay together | Two-act release is strong; revision reasons and persisted failure recovery are incomplete |
| Watch work | Latest durable milestone and terminal receipt replace generic busyness | Rich receipts exist in orphaned components; live workbench polls snapshots |
| Open the map | Map is optional and always has a visible route back | Visible Back to work action added; Escape remains a secondary shortcut |

## Automatic vetoes resolved in this pass

- The map no longer has an undisclosed pointer-only dead end.
- "Choose what to pursue" no longer promises a choice the component cannot commit.
- A direction no longer offers a duplicate Result and Context view of the same body.
- "Back to venture" no longer labels a transition that sometimes only broadens one level.
- Disabled attachment chrome is removed until attachment exists end to end.
- "Working" is derived from an active drive, not merely an open bet.
- Ended approaches no longer offer steering.
- Opening a multi-approach direction no longer silently targets one arbitrary approach; steering requires an
  explicit approach choice.

## Whole-system operating graph

The summoned map now opens on the complete connected operating picture, not a set of category columns. It
shows Product capacity, every canonical path to market, market work, and returned evidence from left to
right. It derives links from current relationships plus the structured references already held by systems,
paths, releases, and market work; it does not infer business truth from visual placement.

Selecting a node highlights its direct route while the rest of the system stays visible. The inspector shows
the record's concrete facts and real connections, then offers an explicit handoff to work or context. The
graph can be panned, zoomed, and fitted, but not manually rewired or dragged. Unconnected Product/GTM truth
remains visible as a gap; unrelated orphan notes stay in venture context. Large same-kind groups wrap across
the canvas after ten rows, which preserves 120 earned records without turning the page into one tall stack.

The signature interaction is route focus: click any path to market and see the Product systems and market
work that make it real. There is no ambient animation or invented live status. Current evidence is the
Buffalo Projects graph at 10 nodes, 16 links, and 3 paths to market, plus the 120-record density journey at
100%, 125%, and 150% zoom.

## Canonical target

Identity must precede projection. Promote the existing brain `Thread + Run` substrate into the sole
founder-work spine:

```text
child Thread
  identity: threadRef + parentThreadRef + originMessageRef + subject refs
  activity: Run refs and sequenced events
  material: work, artifact, verification, and outcome refs
  authority: decision and consequence refs
  return: reviewed-through + latest consequence
```

Every founder direction mints or resumes a child thread. Every attempt records a run against that thread,
not only the venture root. A revisioned read model joins ordered thread events without copying business
truth. The work index, home, workbench, composer, map, keyboard navigation, deep links, and portfolio return
all address the same `threadRef + focusRef`.

Thread status is orthogonal, never one overloaded enum:

```ts
type WorkThreadStatus = {
  lifecycle: "open" | "closed";
  activity: "queued" | "running" | "stopping" | "idle";
  attention: "decision" | "review" | "failure" | "none";
  terminal: "completed" | "failed" | "cancelled" | "paused" | "budget-exhausted" | "interrupted" | null;
  unread: boolean;
  reviewedThrough: string | null;
};
```

Brain-side implementation checkpoint: new founder-authorized drives now mint or resume a child Thread,
every Run joins that child, and `GET /api/ventures/:id/work-index` derives the orthogonal facets above from
Threads, Runs, live drives, settlement receipts, and pending decisions. A founder-only reviewed-through
write rejects stale consequence refs. Legacy root-joined Runs are reported, not fabricated into child rows.
The rail and Home now consume this contract whenever canonical child Threads exist. Pre-contract ventures
remain reachable through an explicitly labeled `Earlier work` compatibility fold; they are not falsely
migrated. This ships the work-index slice, not the full chronological `WorkThreadEvent[]` architecture.

The UI projection is one typed chronological `WorkThreadEvent[]`: founder turn, interpretation, work
milestone, artifact revision, verification, decision, release, evidence, and learning. Alternate views exist
only when they offer a genuinely different job such as full diff, preview, or side-by-side comparison.

## Component disposition

- **Keep:** `FirmApp`, `VentureHome` as a pure renderer, `WorkspaceIndexParts`, `DecisionGate`, exact review
  primitives, and the summoned map.
- **Merge:** conversation narrative and material bodies into one `WorkThread`; run disclosures into one
  provenance event; duplicate result bodies into event renderers.
- **Split:** `VentureWorkspace` into snapshot, workspace reducer, and projection; composer behavior from its
  view; transport API by domain.
- **Kill:** unreachable old shell components, duplicate representation registry, false registry stubs,
  duplicated direction overview, dead props, and old-shell CSS after the thread projection lands.

Production UI components remain below 300 lines. `VentureCanvasStage.tsx` and `api.ts` remain adjacent known
violations and should split by stable domain responsibility when touched.

## Evidence and non-goals

The original T3 comparison used upstream commit `1735e27d9e5106bbb35d5b1dd10363604a54b69e`. Direct component
inspection was refreshed against the installed T3 Code 0.0.28 build at `fda6486233e0`. Drover ports the proven
transcript, composer, changed-files/diff, terminal, checkpoint, and status interaction geometry while rebinding
it to Drover truth. T3's project/session/thread/event stores, disconnected conversation authority, planning
chrome, permanent empty coding panes, and mobile/off-canvas paths remain outside the product.

Historical shipped-pattern receipts remain Notion AI's page conversation and text revision flows, plus
Loops' exact send flow. Mobbin was unavailable during this audit after three connector attempts, so these
receipts were not newly revalidated.

## Verification contract

- A draft written for one scope never appears or submits under another scope.
- Exact work correction carries both `betId` and `workRef`.
- Standalone market returns remain openable even without a bet.
- A direction never exposes duplicate views of the same result.
- Ended approaches cannot be steered; "Working" requires an active run.
- Map mode always exposes a visible Back to work action.
- Desktop acceptance is verified at 1440×900, 1280×800, and the 960px minimum. There are no mobile options.
