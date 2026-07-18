# Drover

**The founder-controlled Product and go-to-market system.** Drover lets one founder direct, understand, and
execute the whole venture — operating through directions, artifacts, work, evidence, and exact
consequences, summoning a spatial canvas when it helps — while retaining authority at every world boundary.

The product/build laws are [`docs/FIRM-SPEC.md`](docs/FIRM-SPEC.md). Current proof and known gaps are
[`docs/STATE.md`](docs/STATE.md). The intended desktop experience is [`DESIGN.md`](DESIGN.md).

## The product

A venture binds to a real product repository and one readable local venture store. One canonical open
model carries Product and go-to-market as permanent territories; objects, relationships, artifacts,
releases, evidence, and insights keep the same identity across every view. The founder operates through an
adaptive workbench — directions, artifacts, work, evidence, and exact consequences — and the spatial canvas
is a projection summoned over that model when spatial or causal understanding helps.

One continuous venture conversation and persistent scoped branches direct and interrogate the venture.
Selecting direction-backed work restores its conversation and representation and scopes the same composer
without hiding the wider venture. The generalized selected-object spine for other object types remains
incomplete; [`docs/STATE.md`](docs/STATE.md) records the exact boundary.

A founder direction can produce a provisional visual interpretation and begin safe inward work in the same
turn. Generated structure remains visibly inferred. Understand, Design, Execute, and Learn are reversible
lenses, not stages. Generated answers are temporary unless the founder saves a synchronized live view,
captures an immutable snapshot, or promotes a finding.

Claude and Codex can research, reason, design, implement, test, compare approaches, and prepare work within
the initiating direction. A founder-invoked workflow defines an outcome contract rather than a default DAG.
Runtime identity, model, tools, actions, cost, and verification remain inspectable provenance; AI identity
does not become the venture ontology.

Safe inward work may proceed after direction begins. Every send, publish, deploy, spend, destructive or
irreversible action, ambiguous material change to canonical truth, and active-work ending remains with the
founder. Product changes use isolated git worktrees and exact diffs.

Evidence returns to the relevant Product and go-to-market objects and visibly strengthens, weakens,
contests, or revises understanding. Facts, evidence, and interpretation remain separate.

## Current state

The current working tree has **one** founder surface: `FirmApp.tsx` renders a venture picker or the single
`VentureWorkspace` — there are no `?shell=` flags and no competing shells (the earlier immersive/Now/legacy
shells were deleted). The shipped tree is **workbench-first**: a venture opens on the permanent adaptive
workbench and its resting `VentureHome`; the graph is a summoned `map` mode, one action away, never the
resting host.

Map selection preserves the selected-work scope. Double-click or Enter returns to that work; Escape broadens
from map to work, then from selection or representation depth to `VentureHome`. The same composer continues
selected direction work through `replyInConversation` and starts unscoped work through `/drive`. The founder
wall remains fail-closed.

This is the implemented form of the ratified "canvas as a summoned projection" direction;
`docs/FIRM-SPEC.md` and `DESIGN.md` describe the workbench-first hierarchy, and the complete local acceptance
suite is green. See [`docs/STATE.md`](docs/STATE.md) for exact verified behavior, current defects, and
unproven requirements.

Historical identifiers such as `gtm-ide`, `bet`, `fork`, `channel`, and `~/.gtm-ide` remain deliberate
compatibility seams until an intentional migration proves safe. They are not product identity or required
founder vocabulary.

## Run locally

Requires a current Node.js release and npm.

```bash
npm install
npm run app
```

The desktop host builds the UI, starts the local Brain server on loopback, opens Electron, and signs founder
requests below the renderer.

The browser harness is available for deterministic development:

```bash
npm start
```

Standalone browser mode is read-only by default. Local source development may opt into
`DROVER_DEV_FOUNDER=1 npm start`; that default-off hatch accepts only non-agent requests whose origin and
socket are both loopback. It does not alter Electron authority.

## MCP

```bash
npm run mcp
```

The agent-facing door exposes venture-scoped reads and can continue or branch inward work already
authorized by a founder direction or founder-invoked workflow. An agent-stamped drive that carries only a
fresh goal — no bet lineage, no branch target — is refused: only the founder starts fresh work. MCP cannot
release, approve, end work, authorize deploy, spend, or perform another founder-only consequence. Current
Electron/MCP endpoint discovery limitations are documented in `docs/STATE.md`.

## Verify

```bash
npm test
npm run test:acceptance
```

The current locally verified command receipts and exact counts live in [`docs/STATE.md`](docs/STATE.md); rerun
them after any product change rather than treating this README as a second proof ledger.

There is **no CI workflow** — these run only when invoked by hand. The browser is a deterministic harness,
not production, and there is no packaged Electron end-to-end journey. These receipts do not prove live
provider behavior, world-touching effects, outside-founder comprehension, or market value.

## Safety boundary

Electron owns a volatile per-boot secret and signs each founder request with a short-lived, single-use
method-and-path claim. The secret is never exposed to browser code or logged. Unstamped loopback, replayed,
expired, cross-origin, actor-stamped model/MCP, forged, and prior-process claims fail closed. Presence is a
volatile lease; away holds every outward release. Deploy requires a second explicit founder authorization.
Ventures fail closed across reads and writes.
