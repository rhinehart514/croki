# Claude Composer redesign — three zones, four moves

**Status:** Design settled (mock approved 2026-07-07). Not yet built.
**Mock:** `docs/design/composer-redesign.mockup.html` (open in a browser; rendered at 1440).
**Supersedes the direction in:** `docs/design/build-room.md` (the build-room mirror is killed here).

## The problem

The composer today is a stack of ~6 bolt-on bands (thread, per-card ideation block, candidate-shapes block, gate block, error block, build-room mirror) plus an input carrying an attached-subject header + posture chip, and it self-drives between ~7 states (edge rail, slim rail, floating pill, full panel, expanded, build-room, receded). It has no *structure* — it has a pile. That is why it can't absorb four new features without becoming worse. "Less is more" here is scoped to the composer itself: the left rail and every other component stay.

## The redesign — three zones

1. **Chrome (top).** Header (Claude + live dot + status) and pipeline tabs. Minimal.
2. **Response zone (middle).** Everything Claude hands back wears ONE card frame — an embodied idea set, a plan to approve, a question, a gate. No more separate bands per response type.
3. **Input zone (bottom).** The text line with inline @-chips, a summoned parts tray, and the control bar (Parts toggle, model, mic, send).

**State model shrinks to two:** closed (a slim line) vs open (the three zones). It opens itself for exactly one reason — the founder is needed. It never self-drives between six other shapes.

**The build-room mirror is deleted.** The canvas already *is* the plan; the composer points at it, never re-draws it.

## The signature: one roster tile, four places

A crew face (`CrewFace`/`agentPersona`) or capability mark (`lib/capabilities.ts`) is the SAME tile in the @-menu, the parts tray, the embodied idea flow, and the plan checklist. Gated capabilities carry the small amber dot everywhere they appear. This is what lets the composer hold four features without reading as four features — "one inventory, one language."

## The four moves and where each lands

1. **@-mention your team in the sentence** (keystone) — Input zone. Type `@`; a Notion-style menu sectioned into **Teammates** (faces) and **Capabilities** (marks, GATED tag on outbound) autocompletes from the crew bench + `CAPABILITIES`. Selecting inserts an inline chip. Data is already client-side — no new fetch.
2. **Ideas come back as faces, not paragraphs** — Response zone. **DECISION: horizontal crew flow** — each proposed shape is a left-to-right chain of faces/marks ending at the amber gate chip, mirroring the canvas's own flow. Reads instantly as a pipeline; two shapes fit without scrolling.
3. **A parts strip you summon** — Input zone. **DECISION: summoned, not always-on.** A "Parts" toggle in the control bar slides in the tray of draggable faces/marks (also appears when `@` is active). Reuses the existing drag (`STEP_DRAG_MIME` / `StepDragPayload`); each tile drags to canvas OR drops into the sentence as a chip.
4. **See the plan before it runs** — Response zone, same card frame as the idea set. A teammate-stamped, editable checklist (face + step + edit-on-hover), ending at the gate row, with "Run to my gate" / "Change it".

## Grounding — Mobbin references

- Notion — [@-menu sectioned Pages/Users with a clean toolbar row](https://mobbin.com/screens/ec1eddc9-37e7-45d3-bf7a-cbb30ab6b38b) — the mention pattern (sectioned by type).
- Cursor — [in-composer MCP picker with brand marks + toggles](https://mobbin.com/screens/0febde4f-4089-4c53-a831-04a7f745c2b2) — capabilities-as-marks inside the input.
- Threads — [@-mention popover with avatars + org sections](https://mobbin.com/screens/314d7129-c72e-4a27-8d84-1ea698e405f1) — face rows in a mention menu.
- n8n — [AI-agent node with tool avatars hanging beneath](https://mobbin.com/screens/47553ad7-3785-4804-83fb-a6a93ade33f9) — embodiment (steps carry their tool's face).
- Zapier Canvas — [steps carrying Gmail/tool marks](https://mobbin.com/screens/3d04dc70-ff09-497f-a3d3-f43537423973) — embodied flow ending in a send.

## Reuse map (already wired — verified)

- Drag: `STEP_DRAG_MIME` (`lib/objectPalette.ts`), `StepDragPayload` union (`LeftRail.tsx:19`); drop → `onStepDrop` (`App.tsx:1527`) → `handleAddNode` (`App.tsx:1475`) → `applyOperations` → POST `/api/graph/operations`. Capability stage→category via `CAP_STAGE_CATEGORY`.
- Roster data: `bench` (`AgentBenchRow[]`, `App.tsx:456` / `getAgentBench`), `CAPABILITIES` (`lib/capabilities.ts`). Both already client-side.
- Node identity for embodiment: `GTMNode.ref` (teammate) / `connector` (capability), `kind` (`types.ts:536`). Faces via `agentPersona`, marks via `capabilityMark`.
- Embodied candidates ALREADY carry crew: `candidate-composer.mjs` returns candidates with full nodes (each with `kind`+`ref`); `sessionCandidates()` reads them (`ComposerDock.tsx:37`). Today's `BuildCard` shows only `node.label` and **drops the ref** — embodiment is a render change, not new data.

## Net-new work (build sequence)

1. **Kill the second, prose ideation path.** The `ideate` tool (`operator-tool-exec.mjs:704`) → `IdeaReview.tsx` returns prose with no crew and composes the graph only after the founder picks. Converge on the embodied `propose_candidates` path (which already carries crew). This is the highest-value collapse and it touches the engine.
2. **Embody the idea/plan cards.** Upgrade `BuildCard`/`RosterRow` to read `node.ref`→face and `connector`→mark, rendered as the horizontal flow + the stamped plan checklist. One shared card component for both.
3. **@-mention + chips in the textarea.** Net-new: mention parser, resolution against bench + `CAPABILITIES`, chip token render, autocomplete menu. On send, extract mentions as structured hints (net-new optional field on the resume payload) so composition binds the named teammates/capabilities — otherwise the operator only sees text.
4. **Summoned parts tray.** Reuse the drag verbatim; add the tray + Parts toggle; add drop-into-textarea (insert chip) alongside the existing drop-onto-canvas.
5. **Collapse the state model + delete the build room.** Reduce to closed/open; remove the build-room split and its `BuildRail`.

## Bar

Reference-grade, calm, dense-but-legible at the real docked width (~480px). Light `#fafafa` ground, monochrome zinc, Geist, semantic color only, amber (`--gap`) reserved for the gate. Capability brand marks carry their own identity color (identity, not decoration).
