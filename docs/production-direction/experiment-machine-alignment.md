# Experiment-machine alignment map

> **Archived audit.** This receipt evaluates a superseded product direction. It does not describe
> the current tree; use [FIRM-SPEC.md](../FIRM-SPEC.md) and [STATE.md](../STATE.md).

**Status:** full-stack mission audit of the current tree against
[../EXPERIMENT-MACHINE-SPEC.md](../EXPERIMENT-MACHINE-SPEC.md).
**Updated:** 2026-07-12. **Stage:** alpha.

This is the audit receipt for the 2026-07-12 revision. It is baseline evidence, not a fresh verification pass of the current uncommitted working tree.

## Decision

The experiment machine is assembled at the deterministic/local engineering level for its declared alpha
scope. The six founder-held rails are present in the live paths, not merely described in components or tests.
The product is not mission-proven yet: no real founder has produced an attributable market result through the
whole loop, and no outside founder has survived it unaided. That is evidence the codebase cannot synthesize.

The central architecture is coherent with the mission:

`one venture → cited product canvas → editable experiment work → one-click start → crew run → founder wall
→ real outcome/reply → canvas loop-back + joint decision → taste for the next run`

No required program, policy, experiment schema, scorecard, or stage skeleton sits in that path.

## Full-stack fit

### Product and interface

- **One living canvas, not a dashboard.** `GtmCanvas.tsx`, `GraphCanvas.tsx`, and `wovenOverlay.ts` keep cited
  product context, goals, open work, pipelines, decisions, and returned outcomes in one coordinate space.
  `buildLoopBackLayer` draws a returned outcome to the front of its originating pipeline; the detail rail in
  `App.tsx` is closed by default and available only when the founder asks for it.
- **Proposal before pipeline.** Trigger-born and loser-born experiments are `experiment-proposal` work
  artifacts in `work-artifact-store.mjs`. They are visible, editable, revisioned canvas material; they are not
  inserted into an invisible surfaced matrix. A pipeline exists only after the founder decides the work needs
  execution.
- **One-click start is reachable.** `OpenCanvasWorkbench.tsx` renders **Greenlight to run** on a proposed
  experiment. `App.tsx` starts a fresh, artifact-scoped operator session and records the proposal as greenlit.
  That action starts crew work but does not mint the protected outward-release capability.
- **Refinement stays open.** The same work artifact can be edited directly, discussed with the crew, handed
  between Claude and Codex, branched for comparison, related to other work, retired, or restored. No field or
  model gate stands between the founder and the material.
- **Few decisions.** `pending-inbox.mjs` projects one trigger decision rather than a raw signal plus a duplicate
  proposal. A reply gets one decide-together interruption. Breadth remains available on the canvas as pull.

### Runtime and safety

- **Truth.** Repository grounding remains a read-only cited scan. Product claims enter the canvas through the
  terrain/product authorities; speculative model work stays labeled rather than promoted to fact.
- **The wall.** `assertGateWall` rejects any execution topology whose outward path bypasses a founder gate.
  Approval and release verbs remain unavailable to model tools, and deploy retains its second founder
  authorization.
- **Away means conservative.** `presence.mjs`, the presence route/hook, graph runtime context, and
  `connectors/gate/default.mjs` form one fail-closed path. Presence defaults and lapses to away. While away, a
  standing blessed pattern cannot release anything outward or possibly outward; unknown executors are held,
  while proven internal prep is allowed.
- **Only the founder kills.** `belief-writeback.mjs` owns the verdict authority. `loser-mutation.mjs` reads only
  `verdict.decision === "kill"`; operational `status: "failed"` is repair work, not market evidence. A mutation
  is a proposal artifact, never a write to the loser and never a run.
- **Mechanics stay agent-judged.** Mutation carries an open crew instruction based on the recorded learning.
  There is no host-selected message/ICP/channel/product bucket. The anti-cage suite continues to reject fixed
  journey, output, channel, board-gating, autonomy, and deploy taxonomies.
- **Venture isolation.** Goals, artifacts, relationships, inputs, sessions, runs, outcomes, and reply context
  are project-scoped. Stable-reference and graph/session guards fail before cross-project focus or execution.

### Outcomes, replies, and learning

- **Automatic attribution.** `connectors/measure/inbox-reader.mjs` joins a real Gmail thread to the exact sent
  item and ingests the outcome on its durable join key. A repeat poll deduplicates by provider event identity.
- **The founder is brought back in.** A reply also becomes one unrouted `reply` input with sender/body and
  exact run/pipeline/thread lineage. `reply-alert.mjs` projects it without writing, and `DecideTogetherPanel`
  opens once in the attended app. It can set the reply as the crew's subject; it cannot send or decide.
- **Return reads as motion.** Warm replies use the live ember treatment and closed observations use the quiet
  learning loop. Reduced-motion users retain the directional relationship without continuous animation.
- **Taste closes the loop.** Founder gate edits, approvals, and rejections remain durable memory for the next
  composition and drafting pass. An outcome itself never manufactures founder taste or authority.

## Bounded caveats, not hidden gaps

1. **The reply interruption is in-app, not an OS notification.** The attended interface polls its durable
   inbox and raises one interruption. Background push infrastructure is not claimed for this local alpha.
2. **Automatic mailbox reading is implemented for Gmail.** Webhook/manual/other captured replies enter the
   same reply projection, but provider-native readers for every possible channel are not an alpha claim.
3. **Presence is deliberately volatile and local.** A restart becomes away, which is the safe result. A future
   multi-instance hosted runtime would need a shared lease authority before claiming the same guarantee.
4. **Legacy `sharedContext.experiments` remains a compatibility authority for run-derived experiments and
   founder verdicts.** It is no longer passed into a surfaced experiment matrix. New pre-execution proposals
   live in the open work authority; deleting the compatibility record now would break learned verdict history
   without improving the founder experience.
5. **Greenlight starts work; the wall still asks again before outward effect.** This is intentional, not two
   names for the same approval. The first says “work this bet”; the second says “release these exact effects.”

## Proof still required

- Run the final browser journey across desktop/narrow, reload, reduced motion, partial failure, away/present,
  proposal edit/start, founder wall, reply interruption, and canvas return.
- Record the remaining Claude/Codex/no-runtime live matrix.
- Produce one real founder-approved outward effect and return its honest result.
- Have an outside founder complete the same loop without intervention.

The first two are engineering verification. The last two are the alpha market gate. Until they exist, the
right claim is: **the machine is built for its declared alpha scope; the mission is not yet validated.**

## Do not rebuild the cage

Do not answer the remaining proof gap with a required experiment schema, role taxonomy, fixed batch size,
configuration surface, funnel, program, policy, or scoreboard. The only correct next move after UI/UX
verification is real use and evidence.
