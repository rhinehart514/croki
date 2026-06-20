# GTM IDE — Vision

**What it is:** A local Claude agent harness for GTM engineering. You open a repository, it reads what you built, and runs a multi-channel pipeline — grounded in your code, powered by Claude at the intelligence nodes, with you in every gate.

Built for Jacob first. Proven on real projects before it touches anyone else.

---

## The core insight

Every other GTM tool starts from a list you bring.

GTM IDE starts from your repo. It reads your product copy, extracts your ICP, maps your conversion flow — from the JSX, the metadata, the FAQ blocks, the schema markup already in the code. The context that powers GTM (who you're targeting, what you built, what the win event is) is the same context that informs product strategy. There's no separate mode — it bleeds in naturally.

---

## What the product is not

- Not a CRM replacement
- Not rebuilding Clay, Apollo, or Exa — it pulls from them via MCP
- Not a marketing dashboard with charts
- Not two separate tools (workspace scan + flow library) — the workspace tab is gone; the repo scan lives inside the context node

---

## Architecture: a harness, not a chatbot

The DAG is the deterministic orchestration layer. Claude agents fire only at specific nodes where judgment is needed. Everything else is code.

```
CONTEXT NODE    Claude agent reads repo + HTML/JSX copy
                → extracts product name, ICP, value props, conversion flow
                → auto-populates without manual config

SOURCE NODE     Claude agent + MCP/web search tools
                → finds prospects matching the ICP
                → returns structured items for downstream nodes

ENRICH NODE     Claude agent + browser/MCP tools
                → researches each prospect
                → fills in signal, company context, fit signals

FILTER NODE     Deterministic code — scoring against ICP
                → no agent (scoring is math, not judgment)

GENERATE NODE   Claude agent + all upstream context + ledger history
                → drafts outreach grounded in what it read
                → gets sharper each run as the ledger fills

GATE            You. Read, redirect, approve.
                → nothing executes without explicit approval
                → conversation with Claude inline to adjust before approving

EXECUTE NODE    Claude agent + MCP tools (Gmail, LinkedIn)
                → sends only after gate
                → logs every action to the ledger

MEASURE NODE    Deterministic — captures replies, outcomes, attribution
                → feeds back into context for next run
```

**The venture doctrine that applies:** Complete structure. Partial activation. Local state. Founder in every gate.

---

## The canvas

### Entry point: two modes, both first-class

**Vibe mode** — describe the goal in plain language, Claude builds the DAG:
```
> find 10 SaaS founders in WNY who just shipped something
  and reach out about Buffalo Projects cohorts
```
Claude reads the repo, reads the prompt, assembles nodes, connects edges. The diagram is the output of the conversation.

**Node builder** — construct and refine the pipeline directly. Every node is configurable via conversation in the right panel — no forms.

### The canvas is alive

- Nodes show real numbers on their face: "47 found · 12 qualified · 4 approved"
- Data particles flow along edges in real time as a run progresses
- Claude agents show their active tool calls in the run log while working
- Gate nodes pulse waiting for you — not a modal, a live state

### The right panel is a conversation

Click any node. Claude explains what it's doing, what it found, what it's uncertain about. You redirect in plain language. The node reconfigures from the conversation. No forms.

### The gate is a reading session

Drafts appear as cards. Each one shows:
- The message
- Why Claude wrote it this way
- What context it used
- What it's uncertain about

`A` approve · `R` reject · `E` redirect inline with Claude

After repeated edits, Claude asks: *"You consistently move the CTA to the end — want that as the default?"* It learns your style.

### Commit-style run history

Every run is a commit:
```
run-7  · 3 replies ↑   · opened hook changed to product-specific angle
run-6  · 0 replies     · same messaging, new segment
run-5  · 1 reply       · first signal
```

`diff run-4 run-7` shows exactly what changed in messaging between runs and what drove the difference.

---

## The ledger

Local file at `~/.gtm-ide/ledger/<workspace-id>.jsonl`. Append-only.

Every run records:
- Who was in the pipeline and where they came from
- What was drafted and what context Claude had
- What the gate decision was and why
- What was sent
- What came back (reply, click, ignore)
- What changed in the context node between runs

The ledger is what makes the feedback edge real. It's not just an arrow on a diagram — it's the accumulated signal that Claude reads before every generate pass. Run 10 is meaningfully smarter than run 1 because the ledger says what worked.

---

## MCP integration

Resource nodes declare MCP connections — not API keys for external services. The tool calls the MCP endpoint; the data comes back as structured items into the pipeline.

Connections in scope first:
- `buffalo-projects-mcp` — source node, already live in Claude Code sessions
- Browser MCP — enrich node, research prospects via real pages
- Gmail MCP — execute node, after gate approval
- Exa — source node, web-native prospect finding

The pattern: GTM IDE orchestrates. MCP tools provide the data. Claude reasons over it.

---

## Multi-channel

The DAG supports parallel branches — one per channel — sharing the same context nodes. ICP and product are defined once. Each channel runs its own source → enrich → generate → gate → execute path.

The top of the canvas shows mission control:
```
EMAIL      ████████░░  8 in pipeline · 1 reply  · gate waiting
LINKEDIN   ██░░░░░░░░  2 approved    · running
CONTENT    ████░░░░░░  building      · Claude drafting
```

Click any channel to expand into full DAG view.

---

## What "done" looks like after each run

1. Drafted messages staged at the gate
2. Approved messages sent (or logged locally if execute node is in review mode)
3. Run recorded in the ledger
4. Context node updated with what worked
5. `diff` available against the prior run

Not a report. Not a dashboard. A ledger entry and a sharper starting point for the next run.

---

## Build order

1. **Context node from repo scan** — HTML/JSX copy extraction, no API key, auto-populates ICP and product from the codebase. Everything downstream gets better.

2. **Source node via buffalo-projects MCP** — first working source, no new API key, real data.

3. **Generate node via Claude** — `ANTHROPIC_API_KEY`, full context from upstream nodes. First end-to-end run that produces real output.

4. **Ledger** — append-only local file. Without it every run is isolated; with it every run compounds.

5. **Gate UX** — card-based review, inline conversation, `A/R/E` keyboard shortcuts.

6. **Vibe mode** — describe the goal, Claude builds the DAG. Natural language as the primary entry point.

7. **Multi-channel view** — parallel branches, mission control header.

---

## Version

v0.0.4 — architecture defined, workspace mode and flow library running, single-channel DAG executing with stubs, 41 tests passing. Claude agent harness not yet wired.

Last updated: 2026-06-20
