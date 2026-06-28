# Connect a capability — design spec

Status: BUILT (Creation arc → shipped). Live in the React app behind the dock's
capabilities (plug) button; backed by a real MCP client, classifier, store, and API.
Original mock: `~/design-showcase/connect-capability/index.html` (`cc-hero.png` / `cc-states.png`).
Live renders: `cc-live-wall2.png` (the wall), `cc-live-confirm.png` (loosen-the-wall confirm).
Date: 2026-06-27.

## What shipped (backend, the net-new capability)

GTM IDE was MCP-server-only; it now also acts as an MCP **client**:
- `brain/src/mcp-classifier.mjs` — pure read/write classifier. Fail-safe: unknown → write
  (gated). A tool's `readOnlyHint` is a claim, not a permission; a write-verb name or
  `destructiveHint` gates it regardless. Token-exact matching. Tested (`mcp-classifier.test.mjs`).
- `brain/src/mcp-client.mjs` — hand-rolled JSON-RPC 2.0 over stdio (zero new deps, house
  style), injectable transport. Initialize / tools/list / tools/call. Tested with a fake
  transport (`mcp-client.test.mjs`) and proven live against a real stdio server.
- `brain/src/mcp-store.mjs` — durable servers + per-tool classification + founder overrides +
  trust; `effectiveClass = override ?? class`; untrusted servers quarantined (hard-gated, no
  loosening). Tested (`mcp-store.test.mjs`).
- `brain/src/server.mjs` — `GET /api/capabilities`, `POST /api/capabilities/connect`,
  `POST /api/capabilities/:id/reclassify` (loosening → 409 unless `confirm:true`),
  `DELETE /api/capabilities/:id`.
- `brain/src/demo/mcp-demo-server.mjs` — a real local stdio MCP server so the surface can
  be exercised end-to-end without installing a third-party server (no seeded/fake data).

UI: `ui/src/components/ConnectCapability.tsx` + `ui/src/styles/connect-capability.css`,
api in `ui/src/api.ts`.

## Integration (2026-06-27, Refinement arc — Direction A)

The first cut bolted Capabilities on as a full-screen overlay behind a dock plug icon — a
"settings page" disconnected from the work. Reworked so capabilities live where you reach for
capability: the **"+ Add step" library palette**, alongside agents and skills.

- `LibraryPalette.tsx` leads with a **"Your tools"** group: connected MCP tools as addable rows,
  grouped by server, each carrying its lane at pick time — read = proven-green check "runs free",
  write = gap-amber lock "gated" (the same pick-time-value language as the agent fit dots). A
  "Connect" affordance and a "Manage connected tools" footer open the wall (`ConnectCapability`),
  which is now reached from the library, not a dock button. The dock plug button is removed.
- Adding a tool drops a real step: a read tool → one runs-free node; a write tool → a founder
  gate + the tool node as a chain, so the wall holds by construction (mirrors "Review & stage").
- New node kind **`mcp`** (ref `<serverId>/<toolName>`) registered in `graph-operations.mjs`
  (NODE_KINDS/OPEN_KINDS), `step-runners.mjs` (STEP_KINDS + an honest default runner), and the
  `GTMNode` type. Live-verified: connecting the demo server, the palette shows 11 classified
  tools under "Your tools", and clicking `find_companies` adds it to the canvas.

The actual MCP dispatch at run time is still the run-path slice; the default `mcp` runner returns
an honest "needs an MCP runtime" until then.

## Not yet built (the honest next slice)

The surface connects + classifies + persists. The run-path integration — an MCP tool used as
a workflow step, with write-class calls actually routed through the founder gate at run time —
is the next slice. Remote (HTTP/SSE) MCP transport + OAuth is also follow-on (stdio only today).
The read-side exfiltration boundary (ideation's fatal-gap) remains follow-on; the trust badge
+ untrusted quarantine are the down payment.

## What it is

The surface where the founder adds an external **MCP server** (Clay, Google Drive, Gmail,
Salesforce, Zapier) and watches its tools auto-sort into two lanes: **Runs free** (read-class —
called whenever a workflow needs them, nothing leaves the building) and **Behind your gate**
(write-class — staged for review, the founder approves each before it acts). This replaces the
old hand-built connector picker. It is the keystone surface for the connectors-as-MCP reframe —
the one screen that makes the product's whole safety story legible in a glance.

## The hierarchy decision and what it claims

The layout **is** the safety argument. A single server card is split by a literal vertical
seam — **"the wall"** — with read tools on the left and write tools on the right. The claim:
*you can see, in one look, exactly what this tool can do on its own and what it can't.* The
asymmetry is felt, not just labeled — the left lane is calm and quiet (green checks, "called
whenever"), the right lane carries weight (amber locks, "you approve" on every row). Unknown
always falls right: "Unknown means gated — never the other way."

## Grounding in the live design system (reuse, not invention)

Zero new color or type was introduced. Everything maps to existing `ui/src/index.css` tokens:

- **Runs free** → `--proven` green (`#16a34a`) — the existing "ready/safe" semantic.
- **Behind the gate** → `--gap` amber (`#d97706`) — `library-palette.css:2` already declares
  *"the gate owns amber."* This surface honors that rule exactly.
- **Untrusted server** → `--danger` red (`#dc2626`).
- **Not connected / 0 tools / no signal** → `--blind` gray (`#a1a1aa`).
- **Type** — Geist Variable for chrome; **Geist Mono for tool identifiers and server URLs** (a
  tool name is a code symbol; the mono face is the honest one). Confirmed both faces load.
- Card / menu / pill patterns follow `menu.css` and `library-palette.css` conventions.

## The signature move

The **wall seam**: a dashed amber divider running top-to-bottom through the card, marked with a
lock badge, physically separating the two lanes. Reclassifying a tool is a tool *crossing the
wall*. Dragging a write → free triggers a deliberate confirm ("Let `update_record` run without
you?" / **"Loosen the wall"**) — loosening the wall is weighty by design, never a casual toggle.
Boldness is spent here and nowhere else.

## Honest states (the product never fakes)

Rendered as real states, not happy-path only: **not connected** (can't see tools until sign-in),
**auth expired** (gated tools paused, no writes fire until re-auth), **untrusted/community**
(quarantined — runs isolated, sees none of the product scan, writes hard-blocked), **0 tools**
(connected but nothing exposed — check scopes).

## Addresses the ideation fatal-gap

The ideation pass flagged that the wall is one-directional — read tools are an exfiltration
vector. This surface plants the seed of the fix: a **trust signal on the server itself**
(Verified / Community / Untrusted) and a quarantine path for untrusted servers. The full
read-side trust boundary is follow-on work, noted in the ideation ledger.

## References

- Live design system: `ui/src/index.css` (`:root` tokens), `ui/src/styles/menu.css`
  (the one dropdown), `ui/src/styles/library-palette.css` (the "+ Add step" palette; the
  "gate owns amber" rule).
- Ideation that produced this surface: connectors-as-external-MCP, capability altitude
  (keystone = read/write classification behind the founder gate).

## Proof / next step

Mock is clickable-static. To prove it: build the `Runs free / Behind your gate` split as a real
React panel reading a live `tools/list` from a connected MCP server, with the classifier
defaulting unknown → gated. The drag-to-reclassify + "loosen the wall" confirm is the one real
interaction to wire first.
