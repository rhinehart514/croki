# Verification and Acceptance

This file remains the acceptance contract for the production-direction work already described in files
01–16. The complete product-market-terrain, provider-parity, browser, and live-alpha eval stack is defined in
`17-product-market-terrain-completion-spec.md` and is additive. Where the two differ, file 17 wins.

## Product acceptance

Drover is production-ready for this direction when a founder can:

1. Register a real codebase.
2. Land on the woven canvas with grounded product truth and honest unknowns.
3. See the persistent product-level GTM crew on and around that canvas.
4. Ask or pin an optional GTM/product question in the UI or AI coding session.
5. Focus its evidence and distinct teammate perspectives without synthetic consensus.
6. Choose or request a GTM/product pipeline directly or from that question.
7. Have the model compose the pipeline without a fixed skeleton.
8. Watch the relevant teammates work.
9. Review the action at the founder gate.
10. Approve, reject, or edit it.
11. Execute only with the required authorization.
12. Capture or ingest what happened.
13. See the outcome return spatially to the pipeline, the question when present, the product, and the crew.
14. See the next coding session and next composition receive the learning.

## Domain tests

- product/question/crew isolation;
- evidence provenance and demotion;
- founder decision persistence;
- contribution lineage;
- outcome attribution;
- provider-ingested outcomes remain idempotent by their provider/source key, while intentionally repeated
  founder-entered observations remain separate receipts unless the founder explicitly merges them;
- no fabricated metrics;
- backward-compatible project/channel/run reads;
- pre-enrichment fixtures, empty new state, archived/unknown references, and rollback-compatible reads;
- stable founder geometry after refresh and compatibility rollback;
- teammate memory isolation;
- question optionality;
- open vocabulary and no fixed stage skeleton.

## Runtime tests

- every execute path has an upstream founder gate;
- composition cannot forge approval or autonomy;
- raw MCP writes are classified safely;
- product/code changes require explicit authorization;
- replay and resume preserve pinned-question context when present, plus crew and gate context;
- failures are classified and recoverable;
- idle ambient work makes no unnecessary model/probe calls;
- no connector readiness is presented as a successful outcome.

## MCP tests

- canonical tools expose the same records as the UI;
- project scoping is enforced;
- read tools do not mutate;
- write tools describe their boundary;
- raw prompts and internal soul data do not reach founder-facing output;
- coding-session question → action → outcome loop round-trips.

## Browser acceptance

Verify at minimum:

- fresh product entry;
- sample product path;
- product altitude on the woven canvas;
- relevant crew pod;
- teammate focus and anchored sidecar;
- question altitude with preserved disagreement and provenance;
- action altitude and open execution graph;
- watchable run;
- one anchored gate review through one decision path;
- product-shaped change review;
- outcome capture and return edge to product/question;
- accepted implication staged as a dashed product-change pipeline;
- focus transitions without lost selection and stable geometry after refresh;
- empty/loading/error/partial states;
- keyboard-only focus, zoom, evidence, pipeline, and gate flow;
- narrow viewport.

## 100x acceptance

The product should demonstrate all of the following in one coherent product:

- a code-native GTM opportunity derived from real product structure;
- a persistent teammate crew improving from founder judgment;
- a product-shaped action that changes or exposes the product;
- a real market signal returning to the product;
- a subsequent coding session receiving that signal as useful context;
- no external action escaping the founder wall.

## Definition of done for each workstream

- behavior implemented;
- diff scoped;
- unit/regression coverage proportional to risk;
- API/MCP and UI semantics aligned;
- browser flow verified where user-facing;
- state/docs updated only to what is actually true;
- no unrelated user changes disturbed;
- no new cage or hosted fuzzy subsystem introduced.

## Verification prompt

```text
Verify the production direction, not only the happy path.

Read the acceptance cases above, then run the relevant backend tests, UI tests, lint, build, and browser
flows. Exercise empty, loading, error, partial, stale, duplicate, unmeasured, rejected, and resumed states.
Check project isolation, evidence provenance, teammate-memory isolation, open graph composition, founder-wall
enforcement, autonomy promotion, outcome attribution, MCP parity, and anti-cage rules.

Also verify semantic altitude and focus behavior, persistent crew identity, spatial memory after reload,
multiple pending gates, sparse empty canvases, long disagreement branches, and that no dashboard or duplicate
gate surface has replaced the canvas.

Report separately: passed behavior, real regressions, pre-existing failures, environment limitations, and
unverified market assumptions. Never call the product validated because the suite is green.
```
