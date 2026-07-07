# W7 — Engine collapse: investigation + verdict (DEFERRED)

**Date:** 2026-07-07
**Branch:** `sprint/w7-engine`
**Verdict:** Classification **(C) LOAD-BEARING**. No code change. The premise behind the task — "Drover has TWO execution engines both wired" — is **factually false**. There is ONE engine. Nothing was removed.

---

## The premise, and why it's wrong

The reachability audit believed Drover ran two parallel execution engines:

- **"LEGACY"** — `brain/src/graph.mjs` `runGraph` dispatching through the `brain/src/connectors/` registry, reached via `/api/graph/run` and `/api/graph/run/stream`.
- **"LIVE"** — `brain/src/operator-runtime.mjs` + `brain/src/step-runners.mjs` (the open-step model), the operator drive-to-gate path.

The hypothesis was to collapse the first into the second so there is one execution path.

**This is not the architecture.** `runGraph` is not a parallel engine — it is *the* engine. The operator path does not replace it; it **calls it**. `step-runners.mjs` is not a competing engine; it is one of the two **node-dispatch targets inside `runGraph`**. You cannot collapse `runGraph` into the operator runtime, because the operator runtime's core operation *is* a call to `runGraph`.

---

## What the code actually shows (hard evidence)

### 1. `runGraph` is the single shared engine — the operator path is a wrapper over it

- `operator-runtime.mjs:15` — `import { hasApproveIntent, listConnectors, runGraph } from "./graph.mjs";`
- `operator-runtime.mjs:627` — the operator's normal drive-to-gate run: `const result = await runGraph(flow.graph, { ... })`
- `operator-runtime.mjs:1832` — the operator's gate-release run: `const result = await runGraph(flow.graph, { ... })`
- `run-compile.mjs:350` — the compile/approve path also runs `await runGraph(graph, { ... })`

So "LEGACY" (`runGraph`) is a **shared dependency of "LIVE"** (the operator), not a parallel to it. This alone settles the question: the legacy path cannot be dead or redundant when the live path is built on top of it.

### 2. `runGraph` dispatches each node by kind — connectors and open-steps are two targets in one engine

`graph.mjs` `runNode` (≈258–373):

- `graph.mjs:268–293` — `const kind = node.kind ?? "tool";` if `kind !== "tool"` (i.e. `agent` / `skill` / `code` / `mcp`), dispatch through the injectable **step runtime** (`step-runners.mjs`).
- `graph.mjs:314–369` — otherwise (`kind === "tool"`) dispatch through the **connector registry** (`getConnector(node.category, connectorId)`).

The "open-step model" and "the connectors" are **the same engine's two node handlers**, selected per node. Neither is a separate runtime.

### 3. The direct-run HTTP routes are live and bound to shipped UI controls

`ui/src/api.ts` → `runGraph` posts to `/api/graph/run` (145); `runWorkflowNode` posts to `/api/graph/run` with a `targetNodeId` (151); `runGraphStream` posts to `/api/graph/run/stream` (168). Their callers in the shipped canvas:

- `App.tsx:2505` — `onRun={() => void streamRun()}` — the **primary canvas "Run" button** → `/api/graph/run/stream`.
- `App.tsx:3030` — `onClick={() => void executeGraph(selectedNode.id)}` — run from an opened node.
- `App.tsx:3056` — `onRunNode={(id) => void executeGraph(id)}`.
- `App.tsx:2221` — `onRunNode: (id) => void runNode(id)` → `runWorkflowNode` → `/api/graph/run`.
- `App.tsx:1247` and `App.tsx:1264` — **the founder gate approve/reject resolution** calls `executeGraph(...)` to resume the run through `/api/graph/run`.

The direct-run path is not test-only. It is the canvas Run button, the per-node run, and the gate approve/reject resolution.

### 4. The Wave-1 gate-safety guard lives ON the legacy path

- `server.mjs:2535` — `/api/graph/run` passes `authorizeRelease: authorizeReleaseForRequest(req)`.
- `server.mjs:2610` — `/api/graph/run/stream` passes the same guard.
- `server.mjs:2096` — the operator gate path passes the same guard into `resolveOperatorGate`.
- `graph.mjs:454–456` — `runGraph` enforces it: on an approve intent, `authorizeRelease()` must pass before any approval is honored.

Deleting the legacy route would delete a gate-safety seam and break the founder-gate approve/reject UI flow.

### 5. The founder gate — the Wall itself — is a connector

- `connectors/gate/default.mjs:15` — `category: "gate"`.
- A composed gate node carries `category: "gate"` and no `kind`, so `runNode` defaults it to `"tool"` and dispatches it through the connector registry.

Therefore **every composed graph that has a founder gate reaches the connector registry through `runGraph` on every run.** The connectors are not dead code behind the "real" engine; the gate connector (the Wall) is exercised on every single run, direct or operator-driven. The gate-safety test `gate-mcp-approval.test.mjs` drives `/api/graph/run` over HTTP (`runGraphHttp`, ~89) — the "legacy" path is where the safety tests run.

---

## Classification: (C) LOAD-BEARING

The legacy `/api/graph/run[/stream]` + `runGraph` + connectors path is:

1. The shared engine the operator path itself calls (`operator-runtime.mjs:627, 1832`).
2. A distinct live surface (canvas Run, per-node run, gate approve/reject resolution) not covered by removing it.
3. The home of the gate-safety guard and the founder-gate connector (the Wall).

There is no dead code to remove and no redundant engine to migrate. **No collapse is possible or appropriate.** No code was changed in this pass.

---

## What a *real* unification would (and would not) be

There is exactly one genuine consolidation the codebase offers, and it is **not** "two engines." It is: the two node-dispatch targets inside `runGraph` — the tool-connector registry and the open-step runtime. A true unification would mean re-expressing every load-bearing `tool` connector (`gate/default`, `execute/local`, `execute/deploy`, `execute/artifact`, `measure/default`, `score/default`, `context/product`, `context/icp`, `find/*`) as `code`/`agent` steps and deleting the registry.

Assessment: **do not do this.** It is a large, high-risk rewrite with no safety or clarity payoff that offsets the risk:

- The connector path is where the **Wall** lives (`gate/default.mjs`) and where the **deploy double-authorization** and **local-staging default** live (`execute/deploy.mjs`, `execute/local.mjs`). These are the safety-critical seams; rewriting them as open steps moves the wall onto the rented model's side of the leash, which is the exact inversion AGENTS.md forbids ("Code is the deterministic spine only").
- The registry is the deterministic spine by design. Per the harness doctrine, deterministic behavior (routing, gating, staging) is code's job, not a rented step's. Collapsing connectors into agent/code steps would blur that boundary.
- Real payoff is small: the stub connectors (`enrich/clay`, `enrich/clearbit`, `find/apollo`, `find/exa`, `draft/openai`, etc.) are ~a third of the 2,259 connector LOC and are cheap to leave in place. They are reachable whenever the composer emits a matching `tool` node and are surfaced by `listConnectors`. Removing them is a separate, smaller "prune unreferenced stub connectors" task — and even that should be deferred until it is proven no composed graph and no palette lists them, because the composer is free to emit any category (anti-cage). When uncertain, the task's own rule applies: treat as REDUNDANT, defer.

If a future pass wants to reduce connector surface, the safe scope is: prune **only** the stub connectors that (a) no test references, (b) `listConnectors`/the UI palette does not surface, and (c) the composer doctrine never emits — proven one connector at a time, never a bulk delete. That is a code-cleanup task, not an engine collapse.

---

## Bottom line

Deferred correctly. The one-engine reality means there was never a second engine to collapse. Executing any removal here would have deleted a live surface, a gate-safety guard, or the founder-gate connector. No code changed; `npm test` was not re-run because nothing was touched.
