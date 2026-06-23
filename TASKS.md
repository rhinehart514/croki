# GTM IDE — Sprint Tasks

**Vision**: Multi-channel GTM project view. Channels are founder-defined durable DAGs rather than product templates. The system can coordinate several simultaneous motions around shared product intelligence while each channel keeps its own graph, gates, runs, and outcomes.

**Status legend**: `[ ]` todo · `[~]` in progress · `[x]` done

---

## 0. API contract (reference for all agents)

```
GET  /api/project
     → { project: { id, name, channels: [{ id, name, status, lastRunAt, lastRunOk, nodeCount, runCount }] } }

POST /api/graph/mutate
     Body: { graph: GTMGraph, command: string }
     → { graph: GTMGraph, description: string, changes: [{ type, nodeId, detail }] }

GET  /api/graph/template          — existing, unchanged
POST /api/graph/run               — existing, unchanged
POST /api/graph/save              — existing, unchanged
GET  /api/connectors              — existing, unchanged
```

---

## Track A — Backend

### A1 — Multi-channel project model `[x]`
- `brain/src/project-store.mjs` stores an arbitrary channel manifest plus shared product intelligence.
- New projects start with no imposed channel catalog. Creating a channel creates a blank graph; duplication is explicit.
- `GET /api/project` in `brain/src/server.mjs` — loads project, loads each channel's flow record, returns channels array with `{ id, name, status, lastRunAt, lastRunOk, nodeCount, runCount }`
- Status is derived from the most recent run in `flow-store` for each channel id

### A2 — Command bar mutation endpoint `[x]`
- `POST /api/graph/mutate` in server.mjs
- Calls Claude (claude-haiku-4-5-20251001 — cheap+fast) with the graph JSON + the command string
- Prompt: structured graph editor — Claude returns a JSON diff specifying node/edge mutations
- Apply the diff to the graph, return `{ graph, description, changes[] }`
- Keep mutations constrained: update_config, update_prompt, update_connector, add_node, remove_node, update_threshold

### A3 — Exa + Clay connector upgrades `[x]`
- **Exa** (`brain/src/connectors/find/exa.mjs`): already implemented, just verify it works end-to-end with a real `EXA_API_KEY`. Make sure `meta.category = "source"` (not just `type: "find"`) so the registry lookup works for the graph model.
- **Clay** (`brain/src/connectors/enrich/clay.mjs`): upgrade the stub. If `CLAY_API_KEY` is set, call the Clay People Enrichment API (`POST https://api.clay.com/v1/bulk-enrich`) with the prospect list. If no key, fall back to Exa-powered enrichment: for each prospect, call Exa search for `{name} {company} site:linkedin.com` and extract job title / company / bio from the text result. Remove `stub: true` from meta when the fallback enrichment actually populates fields.

---

## Track B — Frontend

### B1 — Channels list view `[x]`
- New route/state in `App.tsx`: when `view === "channels"` render `ChannelsList` component instead of the loop canvas
- `ChannelsList` at `ui/src/components/ChannelsList.tsx`:
  - Fetches `GET /api/project` on mount
  - Shows project name in breadcrumb: `G GTM IDE / Q3 Launch`
  - Grid of channel cards, each showing: name, status dot, last run time, node count, run count, "Open →" button
  - "New channel" creates a founder-named blank graph; channel cards can be duplicated.
- Toolbar breadcrumb: `Loops` link → sets `view = "channels"`, current channel name stays as active crumb
- `GET /api/project` schema matches Track A/A1 above; ChannelsList can stub the fetch and render mocked data until backend is ready

### B2 — Design polish `[x]`
All in `NodeEditor.tsx` and `index.css`:
1. **Save context button** — change `.build-button` on `ContextEditor` to use the secondary ghost style (same as the Save button in WorkNodeEditor, not the full-width purple CTA). Target: `NodeEditor.tsx:162`.
2. **WorkNodeEditor Rules tab** — replace the raw JSON textarea for config with a simpler key-value display (read-only `<dl>` of config fields + a "Edit raw" expand toggle). The agent prompt textarea can stay but should have a label and minimal padding. Clean up the layout to match the reference card style.
3. **Signals tab** — replace "Signal tracking coming soon." with a list of stubbed signal rows: each row has a signal type (Reply, Click, View), a count (0 or --), and a "last seen" (-- or a date). Source from `LINKED_SIGNAL_STUBS` constant in the component.
4. **History tab** — show last 5 run entries for the selected node using `runResult` (available as prop). Each entry: ok/fail dot, run ID (first 10 chars), item count, error snippet if failed. Pull from `flowRuns` prop (passed down from App.tsx through NodeEditor).
5. **Clear run chip** — in `App.tsx`, add a "Clear run" ghost chip next to the "Save"/"N runs" chips (`.loop-graph-actions`). On click: `setRunResult(null); setSelection(null); setGraphError(null)`. Style matches `.loop-save-chip`.

### B3 — Command bar wiring `[x]`
- `CommandBar.tsx`: on submit, call `POST /api/graph/mutate` with `{ graph, command }`
- Show a loading spinner in the send button while pending
- On success: call `onUpdateGraph(result.graph)` to apply the mutated graph
- Show a brief toast/inline message with `result.description` (e.g. "Added LinkedIn enrichment step")
- Pass `graph` prop down from App.tsx to CommandBar (currently it only has `onSubmit`)

---

## Track C — MCP Skill

### C1 — GTM IDE MCP server `[x]`
- New file: `brain/src/mcp.mjs`
- Runs as an MCP server (stdio transport using `@modelcontextprotocol/sdk` or a minimal hand-rolled JSON-RPC stdio server)
- Exposes these tools:
  ```
  list_channels()          → project channels array
  create_channel(...)      → blank founder-defined channel
  duplicate_channel(...)   → independent copy of a graph
  update_channel(...)      → rename, clarify, enable, or archive
  get_channel(id)          → { graph, lastRun }
  run_channel(id)          → runs the graph, returns GTMRunResult
  run_node(channelId, nodeId) → runs single node, returns node result
  approve_gate(channelId, nodeId) → approves pending gate, continues run
  get_items(channelId, nodeId)    → returns items array from last run
  mutate_channel(channelId, command) → natural language graph mutation
  ```
- Start command: `node brain/src/mcp.mjs`
- Add to `package.json` scripts: `"mcp": "node brain/src/mcp.mjs"`
- Document Claude Code config: `.mcp.json` at project root pointing to `brain/src/mcp.mjs`

### C2 — Claude Code `.mcp.json` `[x]`
- Create `/Users/laneyfraass/gtm-ide/.mcp.json`:
  ```json
  {
    "mcpServers": {
      "gtm-ide": {
        "command": "node",
        "args": ["brain/src/mcp.mjs"],
        "cwd": "/Users/laneyfraass/gtm-ide"
      }
    }
  }
  ```
- This makes the GTM IDE tools available in any Claude Code session run from the project root

---

## Track D — Closed the learning loop `[x]`

The fatal gap: runs were recorded to the ledger but never read back, so run 2
was identical to run 1. Now closed — connector-agnostic at the runner level.

- `brain/src/memory.mjs` (new) — reads founder gate decisions (approve / reject /
  edit) out of the run ledger and shapes them into memory for the next run.
  Reality constraint: pre-send, founder decisions are the only real outcome
  signal, so that is what the loop learns from. No invented replies.
- `gate/default.mjs` — captures per-item decisions (approve/reject/edit), stamped
  onto items and recorded in the ledger. Node-level approve-all still works.
- `graph.mjs` — `runGraph` accepts `opts.memory` + `opts.decisions`; injects
  memory into generate-node context, threads decisions into the gate.
- `draft/claude.mjs` — consumes `context.__memory`: prior approved drafts become
  voice exemplars, rejected ones become an avoid-list. Reports `meta.memory`.
- `server.mjs` — `/api/graph/run` loads prior runs, builds memory, returns
  `memoryApplied` so the loop is observable.
- `brain/test/memory.test.mjs` — 13 tests; full `npm test` green (54 brain tests).

The per-item gate review UI and visible `memoryApplied` state are now complete.

## Track E — Durable resident operator `[x]`

- Durable operation sessions persist goals, model turns, events, graph revision,
  run checkpoints, pending questions, pending gates, completion, and failures.
- The model operates through explicit tools: product/graph/problem inspection,
  typed graph patching, validation, node/full runs, run inspection/comparison,
  founder questions, and completion.
- Graph changes use validated operations rather than model-generated replacement
  JSON.
- Full and partial runs are recorded to the normal flow ledger.
- Founder gates pause the operator automatically.
- Gate approval resumes from the exact prior run artifacts instead of rerunning
  source, enrichment, or generation.
- The operator panel polls the durable session, shows its event trail, survives
  close/reopen/reload, updates the canvas after patches, and routes gates into the
  existing per-item review UI.
- MCP can start, inspect, resume, list, and cancel the same resident sessions.

## Done

- [x] Toolbar shell (breadcrumb, Build/Simulate/Run tabs, action buttons)
- [x] Canvas with React Flow node graph (all 9 node categories)
- [x] Right detail panel (slide-in, Overview/Rules/Signals/History tabs)
- [x] Auto-center canvas on node selection
- [x] Overview tab resets on node switch (key={selection} remount)
- [x] Simulation drawer slides up on Simulate
- [x] Mini-map (130×80 bottom-left)
- [x] Command bar + suggestion chips
- [x] Gate approval flow in Rules tab
- [x] Save/runs chips + error banner
- [x] 41/41 brain tests passing

---

*Last updated: 2026-06-21*
