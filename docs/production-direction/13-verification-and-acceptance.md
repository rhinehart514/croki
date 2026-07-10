# Verification and Acceptance

## Product acceptance

Drover is production-ready for this direction when a founder can:

1. Register a real codebase.
2. See grounded product truth and honest unknowns.
3. Meet the product-level GTM crew.
4. Ask a GTM/product question in the UI or AI coding session.
5. See multiple teammate perspectives and evidence.
6. Choose or request a GTM/product action.
7. Have the model compose the action without a fixed skeleton.
8. Watch the relevant teammates work.
9. Review the action at the founder gate.
10. Approve, reject, or edit it.
11. Execute only with the required authorization.
12. Capture or ingest what happened.
13. See the outcome linked to the action, question, product, and crew.
14. See the next coding session and next composition receive the learning.

## Domain tests

- product/question/crew isolation;
- evidence provenance and demotion;
- founder decision persistence;
- contribution lineage;
- outcome attribution;
- no fabricated metrics;
- backward-compatible project/channel/run reads;
- teammate memory isolation;
- question optionality;
- open vocabulary and no fixed stage skeleton.

## Runtime tests

- every execute path has an upstream founder gate;
- composition cannot forge approval or autonomy;
- raw MCP writes are classified safely;
- product/code changes require explicit authorization;
- replay and resume preserve question, crew, and gate context;
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
- product room;
- relevant crew pod;
- teammate profile;
- disagreement/evidence view;
- question room;
- action graph;
- watchable run;
- gate review;
- product-shaped change review;
- outcome capture;
- empty/loading/error/partial states;
- keyboard navigation;
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

Report separately: passed behavior, real regressions, pre-existing failures, environment limitations, and
unverified market assumptions. Never call the product validated because the suite is green.
```
