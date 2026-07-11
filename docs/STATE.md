# STATE — Drover (Alpha)

**Stage: Alpha. Updated 2026-07-10.** The terrain-first implementation is built in the current tree.
Deterministic contracts and the fixture browser evaluation pass; the real-founder and
attributable-outcome acceptance gate has not passed.

This is the front-door record of what the product currently proves. [README.md](../README.md) explains the
product, [VISION.md](VISION.md) gives the north star, and
[17-product-market-terrain-completion-spec.md](production-direction/17-product-market-terrain-completion-spec.md)
is the approved completion target.

## What Drover is now

Drover opens on a living product-market terrain, not a goal form or an empty pipeline editor. The terrain
combines cited product truth with clearly labeled model reads, open questions, crew positions, chosen moves,
founder decisions, and returned outcomes.

The terrain is primary. The operation is the active work laid over it. A pipeline is one move the founder
chooses to make real. Operator keeps the whole terrain visible; Engineer opens the selected pipeline's
editable execution flow.

The harness still owns only three constraints:

- **Truth:** a read-only scan produces cited product facts. Already-grounded truth renders without an AI
  runtime or model call.
- **The founder wall:** every outward effect remains behind founder authorization. Terrain context and model
  work cannot grant approval.
- **Taste:** founder approvals, rejections, and edits become durable memory for later work.

Codex and Claude Code are both local sources of rented intelligence through the founder's existing
subscription. The selected runtime can read the terrain, work with the crew, compose a pipeline, and drive
it to the same wall. Provider choice does not own product records, decisions, outcomes, or authorization.

## What “Alpha” means

The product can be built, green, and browser-tested while the market bet remains unproven. No outside
founder has yet completed the full terrain-to-market loop without help, and no attributable real-world win
has returned through that loop.

The alpha test is:

1. A founder opens a real product and understands cited truth before supplying a goal.
2. They investigate or correct a credible opening with the crew.
3. They choose a move, turn it into a real pipeline, and run it to the founder wall.
4. They approve a real outward effect.
5. A real positive, negative, or no-response result returns with honest attribution.
6. That result changes the next terrain read and the next work.
7. An outside founder survives the same path without intervention.

That human test is T11 and Gate D in the completion specification. It has **not passed**. The stage remains
alpha.

## Implemented in the current tree

| Area | State | What is proved |
|---|---|---|
| Terrain-first home | **Built and fixture-tested** | A grounded product opens on the canvas in Operator, including with zero pipelines. Cited truth appears before a goal is required. |
| Deterministic terrain | **Built and tested** | The project-scoped read combines existing truth, questions, moves, outcomes, implications, crew, relationships, and geometry without spending a model call or writing state. Partial and stale owners are reported honestly. |
| Cited first grounding | **Built and tested** | The initial repository scan is persisted into product truth, so the first terrain view does not depend on opening another surface or running AI. Cross-project receipts are rejected. |
| Rented terrain read | **Built and tested with adapters and fixtures** | Model output produces openings and tensions as inferences, keeps uncertainty and falsifiers, demotes unsupported citations, and may return no hypotheses without breaking the terrain. |
| Codex and Claude support | **Implemented; contract-tested; Codex smoke-tested** | One provider-neutral task path supports both local CLIs and subscription authentication. Product reading, terrain reading, composition, and operator paths honor the selected runtime. A signed-in Codex subscription completed the opt-in project-scoped terrain read on 2026-07-10 without touching the founder wall. |
| No-runtime use | **Built and fixture-tested** | Cited product terrain and existing work remain available without Codex or Claude. Missing model interpretation is local and explicit rather than a full-product connection wall. |
| Terrain to pipeline | **Built and tested** | A selected opening, question, or direct request can become the existing open pipeline. Its evidence, wording, intended effect, uncertainty, and measurement intent travel as advisory context, never as a prerequisite or approval. |
| Operator and Engineer context | **Built and tested** | Surface, view, and focus survive operator turns and resume. Leaving one pipeline returns to the originating terrain focus when available. |
| Persistent crew identity | **Built and browser-tested** | Every teammate uses one deterministic illustrated character across the canvas, left rail, conversation, crew room, creation flow, and profile. Initials remain only as a render-failure fallback. Same refs retain the same face; different refs remain visually distinct. |
| Founder wall | **Built and security-tested** | Every execution path still requires upstream founder authorization. Browser-only gate release, project isolation, self-approval rejection, and the second deploy authorization have regression coverage. |
| Outcome return | **Built and tested** | Joined outcomes return to their product, question, move, crew, run, and decision context when those links exist. Approval alone is not treated as a market result; unjoined signals remain unattributed. |
| Taste loop | **Built and tested** | Gate decisions feed durable taste into later composition and agent work. Terrain reads can consume founder corrections without turning them into authorization. |
| UI and agent-client parity | **Built and contract-tested** | Terrain references can be inspected, focused, discussed, recorded, proposed, and run through both the interface and MCP without becoming durable authority. |
| Real founder alpha loop | **Unproven** | T11, Gate D, and the named alpha-loop evaluation remain open. |

## Evaluation status

The completion specification separates four gates so lower-level proof cannot stand in for market proof.

- **Gate A — deterministic contracts:** implemented in the canonical test chain. Coverage includes terrain
  normalization and projection, provider adapters, project isolation, operator context, open pipeline
  composition, wall security, outcome learning, anti-cage rules, interface tests, lint, type checking, and
  the production build.
- **Gate B — deterministic browser journey:** passed for desktop, compact, narrow mobile, keyboard-only,
  hard refresh, and no-runtime modes. It covers cited truth before a goal, progressive terrain, distinct
  crew positions and stable illustrated identities, pipeline handoff, the wall, an explicit founder
  decision, outcome return, and recovery without spending a subscription.
- **Gate C — local-runtime smoke:** the Codex-only project-scoped terrain read passed through a signed-in
  ChatGPT subscription on 2026-07-10, and the harness confirmed that it made no approval or release request.
  The full matrix is still open: Claude Code only, neither runtime, and an explicit choice with both
  available have not all been recorded as live subscription runs.
- **Gate D — real-product alpha evaluation:** not run to a pass. There is no stranger-survival receipt and no
  attributable real-world result.

The exact current test receipt belongs in the commit or handoff that ran it. Do not turn changing test counts
into product claims here.

## What remains

The next milestone is evidence, not another product layer:

- run and record the complete Gate C matrix through normal local subscription setup;
- drive a real founder product from terrain to an outward effect and return the actual response;
- preserve negative or no-response results as outcomes rather than renaming them success;
- observe an outside founder completing the same path without explanation;
- record where the terrain, crew, pipeline handoff, or wall causes hesitation and fix only what blocks
  understanding or trust.

Passing deterministic tests means the terrain-first product is implemented. Only T11 and Gate D can prove
the alpha bet.

## Current document map

- `README.md` — the product and local setup.
- `PRODUCT.md` — the strategic product and design context.
- `DESIGN.md` — the visual-system rules and component identity contracts.
- `docs/VISION.md` — the terrain-first north star.
- `docs/STATE.md` — this honest build and evaluation snapshot.
- `AGENTS.md` — engineering invariants and repository rules.
- `docs/production-direction/17-product-market-terrain-completion-spec.md` — the approved completion and
  evaluation contract.
- `docs/production-direction/00-index.md` — the production-direction index.

Earlier goal-first, Claude-only, pipeline-as-product, operation-primary, board-primary, program, policy,
foundry, portfolio, and opportunity-list documents are historical. They do not override the terrain-first
mental model or the current code.
