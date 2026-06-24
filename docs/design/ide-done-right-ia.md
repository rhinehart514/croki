# IDE done right — re-derived information architecture

Decided 2026-06-24. Direction picked by the founder from three. This is the
structural rework of the GTM IDE navigation, both front doors (human + MCP).

## The problem this fixes

The Explorer rail was a 1:1 mirror of the engine's DDD aggregate stores —
it navigated database tables, not the founder's mental model:

| Explorer item (before) | What it actually was |
|---|---|
| Programs | `program-store.mjs` |
| Capabilities | `capability-foundry.mjs` (AgentInstance) |
| Policies | `agent-policy-store.mjs` (AgentCreationPolicy) |
| Runs | the run ledger |
| Learning | `feedback-ledger.mjs` |
| Debugger | `engine.mjs` |
| Agents / Skills | the library |
| Context | the context engine |

Two more structural failures: the **center was contested** (the domain declares
`OutcomeProgram` the center, but the UI was canvas-first and Programs read 0 while
a graph was on screen), and the **five-mode lifecycle nav** (Design / Simulation /
Run / Review / Learning) rendered four pixel-identical screens — only Simulation
differed.

Audit scores (anti-sycophantic, slop-until-earned): **IA ~24/100**, **Flow ~38/100**.
Biggest losses: object-model-matches-the-user (nav matched the engine, not the user),
naming honesty (Policies/Capabilities/Context/Debugger are engineering nouns doing
navigation jobs), contested center. Verdict: **FIX** (the product idea and craft are
real and differentiated; the structure was wrong but fixable).

## The object model (re-derived from the founder's nouns)

Key insight: **the canvas is not the center — it is the editor view of the center.**
In Cursor the center is the file, not the editor. GTM IDE had inverted this.

Center = **OUTCOME** (`OutcomeProgram`). Founder's job: *I want an outcome → build a
system that chases it → approve what it sends → it gets smarter.* Hierarchy:

```
Project › OUTCOME › System (the canvas) › { its Agents · Runs · Approvals · Problems · Learning }
```

Surviving objects and their demotions:

- **OUTCOME** — the center. Status lifecycle: draft → building → running → waiting → learning → done.
- **SYSTEM** (the graph) — the primary *view* of an outcome, not a nav peer.
- **AGENT** — `AgentInstance`. "Capabilities" and "Agents" were two names for this; collapsed.
- **APPROVAL** — gated items at the founder gate. Was homeless in the nav; now first-class.
- **RUN** — `GTMRunResult`.
- **PROBLEM** — `Investigation` / the Problems rail.
- **PRODUCT TRUTH** — scan / understanding / context manifest ("what it knows").
- **POLICY** — an *attribute of* an agent (its rules), demoted out of the nav.
- **LEARNING / CONTEXT** — machinery; surfaced in-context, not as top-level peers.

## Controlled vocabulary (engine noun → founder noun)

| Engine noun | Founder noun |
|---|---|
| Program / Channel / Workflow | **Outcome** (its graph = "the system") |
| Capabilities / Agents | **Agent** |
| AgentCreationPolicy / Policies | "the agent's rules" (attribute, not a nav item) |
| gated items / pendingGates | **Approvals** / "waiting for you" |
| Investigation / Debugger | **Problems** |
| FeedbackSignal / Learning | **Learning** (history, in-context) |
| ScanReport / ProductUnderstanding / ContextManifest | "what it knows" |

## The three directions (the choice was which object the HOME screen centers)

1. **IDE done right** (PICKED) — comparable: Cursor / VS Code. One object in the tree
   (Outcomes, like files); the canvas is the editor for the selected one; Design/Run/
   Review/Learning become *states* of one canvas, not tabs; Agents/Problems/Runs become
   summonable panels. Most legible to anyone who has used Cursor.
2. **Outcome-first console** — comparable: Linear / deal pipeline. Home = the portfolio of
   outcome bets with live status; modes become the outcome's status, not a global nav.
3. **Review-first home** — comparable: Devin / PR-review inbox. Home = the gate (waiting for
   you + while you were away); canvas one click in. Boldest, most agent-native, biggest rebuild.

## The rework (what gets built)

Human front door (`ui/`):
- Rail collapses to ≤5 items: **Outcomes** (primary tree), **Library** (Agents+Skills),
  **Problems**, **Runs**. Capabilities/Policies/Learning/Context/Debugger leave the top level.
- Top nav loses the four redundant mode tabs; gains a primary **Run** + **Simulate**; modes
  become canvas states with a generalized bottom results panel.
- **Approvals** becomes a first-class affordance (quiet at 0, prominent when >0; modeled on
  the VS Code Source Control badge), wired to real pending-gate data.
- The co-pilot dock stops occluding the founder-gate node; the canvas lays out around it.

Agent front door (`brain/src/mcp.mjs`, `operator-mcp.mjs`):
- Synonym rot resolved: one noun for the workflow object (channel/workflow collapsed), one
  gate verb (`approve_gate` + `approve_workflow_gate` collapsed).
- The center object exposed to agents (`list_outcomes` / `get_outcome` …), absent before.
- `mutate_channel` → `update_*`; descriptions rewritten to pass the predict test; grouped by
  workflow. Old names kept as backward-compatible aliases where callers depend on them.

## Proof of life

- This-week version: the re-shelled canvas + rail at http://localhost:4317 (one screen, rebuilt).
- Fake door: none needed — it ships behind the existing local app, reversible via git.
- Countable change that says it worked: a new founder can name what each rail item contains
  before clicking (predict test), the gate is visible without hunting, and the four-identical-
  modes confusion is gone. Agent-side: a model driving the MCP no longer has two nouns for one
  object.

## Comparables cited

Cursor / VS Code (the IDE shell, one-object tree + summoned panels), Linear (outcome-as-object
+ status), Devin / PR-review inboxes (the review-first shape). Verify current best-in-class via
Mobbin before the polish pass.
