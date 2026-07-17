# Drover

**The founder-controlled Product and go-to-market system.** Drover gives one founder a venture canvas for
seeing, understanding, directly manipulating, and executing the whole system while retaining authority at
every world boundary.

The product/build laws are [`docs/FIRM-SPEC.md`](docs/FIRM-SPEC.md). Current proof and known gaps are
[`docs/STATE.md`](docs/STATE.md). The intended desktop experience is [`DESIGN.md`](DESIGN.md).

## The product

A venture binds to a real product repository and one readable local venture store. The canvas is the main
founder surface over one canonical open model, with Product and go-to-market as permanent territories.
Objects, relationships, artifacts, releases, evidence, and insights keep the same identity across every
view.

One continuous venture conversation and persistent scoped branches direct and interrogate the canvas.
Selecting any visible object focuses its relationships, restores its conversation and work, and scopes the
same composer without hiding the wider venture.

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

The current working tree still contains three competing founder shells and several partial paths. It is
being migrated to the single canvas/conversation product above without discarding the working runtime,
venture data, wall authority, repository grounding, product worktrees, conversation, or evidence lineage.
See [`docs/STATE.md`](docs/STATE.md) for exact verified behavior and unproven requirements.

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

The agent-facing door exposes venture-scoped reads and can continue inward work already authorized by a
founder direction or founder-invoked workflow. The current MCP drive path can also start fresh agent-stamped
work; that is an unapproved implementation gap documented in `docs/STATE.md`. MCP cannot release, approve,
end work, authorize deploy, spend, or perform another founder-only consequence. Current Electron/MCP
endpoint discovery limitations are also documented in `docs/STATE.md`.

## Verify

```bash
npm test
npm run test:acceptance
```

`npm test` runs Brain tests, UI unit tests, lint, and the production build. `npm run test:acceptance` adds
token parity and deterministic browser journeys. These are readiness receipts, not outside-founder or
market proof.

## Safety boundary

Electron owns a volatile per-boot secret and signs each founder request with a short-lived, single-use
method-and-path claim. The secret is never exposed to browser code or logged. Unstamped loopback, replayed,
expired, cross-origin, actor-stamped model/MCP, forged, and prior-process claims fail closed. Presence is a
volatile lease; away holds every outward release. Deploy requires a second explicit founder authorization.
Ventures fail closed across reads and writes.
