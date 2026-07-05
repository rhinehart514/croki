# GTM Graph Phase 1 Handoff

Date: 2026-07-03

## Complete

- Object graph store and typed operations are in place. Node domains stay open, edge types stay the closed union, and derived fields cannot be written through object-graph mutations.
- Graph intelligence phase-1 slice is implemented: product/market/strategy spray helpers, edge routing into the closed union, per-node weakness detection for evidence, product, measurement, and execution, plus honest `unmeasured` reports for specificity and performance.
- Strongest current testable path scoring is code-derived and returns exactly one highlighted path in phase 1.
- Run compile extends `run-compile.mjs` instead of replacing it. A selected path stages a run behind the existing founder gate wall, carries a seven-section `RunPlan`, mints join keys, and turns missing or hollow measurement into a repairable Measurement weakness rather than a compile block.
- Object graph projection now includes stored product truths, market objects, paths, measurement contracts, compiled runs, inline gate projections, staged review items, and founder-entered outcomes.
- The object graph API and UI are additive. Existing map/board/flow surfaces were not cut.
- The canvas surface is mounted as the default GTM graph lens. It shows one lit path, weak cards, click-to-inspect, a weakness lens, a compile affordance, gate/outward card registers, and attribution/gate receipts in the inspector.

## Verification

- Passed: `npm --prefix brain test -- test/object-graph-projection.test.mjs test/graph-intelligence.test.mjs test/run-compile.test.mjs test/object-graph-store.test.mjs`
- Passed: `npm run lint`
- Passed: `npm run build`
- Partial full backend result: `npm --prefix brain test` passed 1057 tests and failed 5 HTTP route suites because this sandbox cannot bind `127.0.0.1`. A focused run of `test/gtm-engine-wiring.test.mjs` fails before assertions with `listen EPERM: operation not permitted 127.0.0.1`.
- `npm start` builds the UI, but rendered browser QA could not run here. Native modules were rebuilt locally for Node 25 (`better-sqlite3`, `node-pty`), then server start on a non-default port failed with the same `listen EPERM` sandbox restriction.

## Remaining

- Browser verification of the actual canvas once local port binding is available.
- True live cold-open streaming from scan/research into the graph. The projection/API returns the phase-1 graph, but the animated materializing spray is not yet wired as a live progress stream.
- Inline gate review actions on the object-graph edge. The graph projects the existing gate primitive and staged payloads, but approve/edit/promote still live in the existing gate hosts.
- Founder-entered outcome form on the object graph. Outcome ingestion exists and projects to nodes once results are recorded.
- Phase 05 cuts were intentionally not performed: old map/board/goal/operator surfaces remain available where already wired.

## Ambiguities

- The specs say compile the highlighted path. Some highlighted paths are graph walks rather than stored `GtmPath` records. I implemented a transient path fallback so graph-walk highlights still compile through the existing wall instead of blocking on the old path store.
- Gate nodes are rendered as a projection node for readability, while the gate remains backed by the existing execution-graph gate primitive. No new approval mechanism was introduced.

## Backend Tier-1/2

Landed in commit `2ee4b11`:

- Default graph altitude now hides staged run item nodes. A compiled run projects as one `runs.run` card with `payload.itemCount`; pass `expandRun` to fetch that run's item cards on demand.
- `GET /api/projects/:projectId/object-graph` runs the fast read-only product scan when the project has no current scan-derived product cards or the scan is stale. It returns product cards immediately and schedules market research in the background when market cards are empty.
- Weakness detection is less noisy. Thin/no-signal nodes report `unmeasured`; product, measurement, and execution flags now require an actual scan/run/list signal or explicit payload marker.
- Recommended paths now include `name`, a short human label, alongside the full `nodeIds`, `signals`, and score details.
- Retired sources are hidden from the default graph without deleting source records. Rule: `retiredAt`, `payload.supersededBy`, or source status `cancelled` / `canceled` / `superseded` excludes the node and dependent edges unless `includeRetired=true`.
- Founder-dragged positions persist in a per-project layout sidecar, not in derived graph nodes.

API shape for frontend:

- `GET /api/projects/:projectId/object-graph`
  - Optional query: `expandRun=<runId-or-obj-runId>` adds only that run's staged item nodes.
  - Optional query: `includeRetired=true` includes retired nodes/edges for inspectors.
  - Response fields: `projectId`, `scanOnOpen`, `graph`, `positions`, `expandedRun`, `recommendation`.
  - `scanOnOpen`: `{ scanned, reason, created, skipped }`.
  - `graph.nodes`: default graph nodes; run summary nodes carry `payload.runId`, `payload.status`, `payload.itemCount`, gate metadata, and measurement metadata.
  - `positions`: `{ [nodeId]: { x, y } }`.
  - `expandedRun`: `null` or `{ runId, itemCount }`.
  - `recommendation.highlighted[0].name` and `recommendation.rankedPaths[].name` are the short labels.

- `POST /api/projects/:projectId/object-graph/positions`
  - Body: `{ "positions": { "node-id": { "x": 120, "y": 240 } } }`. A raw map is also accepted.
  - Response: `{ projectId, positions, savedAt }`.

Verification:

- Passed: `node --check src/object-graph-projection.mjs src/object-graph-store.mjs src/graph-intelligence/weakness.mjs src/graph-intelligence/path-ranking.mjs src/server.mjs`
- Passed: `node --test test/object-graph-store.test.mjs test/object-graph-projection.test.mjs test/graph-intelligence.test.mjs test/run-compile.test.mjs`
- Full `npm --prefix brain test` is blocked in this sandbox by pre-existing environment issues: `better-sqlite3` was compiled for `NODE_MODULE_VERSION 127` while this Node requires `141`, and route tests cannot bind `127.0.0.1` (`listen EPERM`). I did not rebuild native modules per the guardrail.
