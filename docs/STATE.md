# STATE — Drover

**Stage:** alpha. **Updated:** 2026-07-22.
**Authority:** [`FIRM-SPEC.md`](FIRM-SPEC.md) defines durable product/build physics. Root
[`DESIGN.md`](../DESIGN.md) defines the intended desktop experience.

This file reports what the current tree proves. Direction is not proof.

## Current product shape

The founder shell has two presentation surfaces over one venture: Work and Product / GTM. There is no current
Releases destination or founder-facing System mode. The rail is surface-owned: Work shows Threads; Product / GTM
shows local search, agents, and connected capabilities.

The capability rail now consumes a host-owned runtime inventory rather than assuming a saved label is callable.
At rest it shows at most three useful capabilities; exact Product/GTM selection may surface up to five relevant
ones. Unavailable or reconnecting capabilities are named honestly and cannot be dragged. Gmail observation is a
`Source · Read`; Gmail send is a separate `Action · Approval`.

First run now chooses a real Product codebase, derives its name, performs the bounded local read-back, and opens
Work in that single choice. **What are you trying to make true?** and Claude/Codex selection live in the ordinary
Work composer rather than blocking repository connection. Missing authentication never blocks adding the
codebase.

Work remains the direct coding-agent surface with exact provider/model choice, isolated coding attempts,
conversation, files, diff, preview, terminal, verification, checkpoints, and founder-controlled source apply.
The founder can delete any non-root chat from its existing action menu. One inline confirmation makes clear that
live work will stop; the founder-only delete tombstones the Thread, refuses future continuation, requests
cancellation for every attached live Run, revokes restartable WorkScopes rooted there, and removes the chat from
Work while preserving Product truth, artifacts, and receipts.
Product/GTM participation in a Work Thread now stages a branch-backed provisional local model view above the
composer. The view can mix current truth, proposals, alternatives, unknowns, evidence, actions, gates, and
outcomes; it does not require workflow order. Corrections preserve the same durable work and `ModelBranch`, and
review opens the existing selective `ModelChange` merge surface. Legacy workflow artifacts remain readable.

Product / GTM now renders a single living-v3 canvas rather than the former fixed-lane map. It projects current
semantic objects and relationships, durable provisional model branches, live WorkIndex state, generic outward
actions, and evidence returns. Current truth, provisional alternatives, live work, founder gates, and evidence
use distinct visual states. Product, shared Product/GTM truth, and GTM occupy distinct territories inside one
strictly left-to-right causal graph; curved spectrum edges identify real territory crossings. Its default opening
frame now composes the first useful causal chapter instead of fitting the entire portfolio: a shared trunk,
territory-weighted neighborhoods, attached work and decisions, compressed secondary features, and state-derived
emphasis make the route legible without another setting or mode. Node selection expands exact detail or branch
review in place and reflows only the local neighborhood. Founder drag placement persists as presentation, and
rail agents, tools, and sources open exact scoped work only when dropped on a supported subject.

The opening chapter now ranks Product-to-market-to-evidence consequence above mere path length and frames no
more than five relevant nodes at a `0.82` readability floor. Old overview cameras cannot override that default.
Remote context remains as concise semantic markers rather than near-invisible node text; the Product, Shared,
and GTM territories use explicit words and distinct symbols. Bundled relationships fan visibly, adopted GTM
workflows receive a one-click shortcut and compact ordered geometry, and a conditional **Return to current**
control appears after meaningful pan or zoom.

The old `maps`, `release-mode`, and `system-mode` production component trees and their pipeline/release workspace
tests were deleted. Workspace presentation memory migrated to v12 and retains only Work/Product-GTM mode, Thread,
object selection, canvas camera, conversation state, rail width, and scroll memory. Legacy memories map forward
without retaining release navigation state.

## Semantic model v3

The canonical semantic store is schema v3. Alongside open semantic objects and relationships, it holds:

- `modelBranches` — durable provisional Product/GTM alternatives;
- `modelChanges` — source-bearing object or relationship creates, updates, and removals;
- `modelMergeReceipts` — transactional selective founder promotion;
- `workScopes` — durable, revocable continuing inward authority;
- `outwardActions` — generic world-crossing preparation and return joins.

Legacy schema records migrate lazily and idempotently to empty v3 families. Architecture compatibility records
still project into open objects for old reads, but current UI APIs no longer expose `ArchitectureRole`, closed
architecture proposal unions, release-only market indexes, or release write routes.

Branch work overlays current truth without copying the full model. Current target digests expose drift conflicts.
Independent agent writes retry after unrelated CAS contention. Selective merge is founder-only, applies only the
selected changes transactionally, records previous/resulting model revisions, and does not close the branch.

## Work authority and execution

WorkScopes are founder-created, venture-scoped, origin-bearing, revocable, and discoverable on restart. Agent
drive requests with a `workScopeId` must remain within that scope and resume its exact origin Thread. Unrelated
fresh work is refused. Scope discovery reports whether an exact spend policy exists; scopes without one remain
paused rather than spending on boot.

Drive leases now key exact Run/resume identity instead of serializing every request by participant. Daily spend
reservations use a revisioned CAS ledger. Provider sessions and coding worktrees remain isolated by Run.

This proves independent lease and spend primitives; it does not yet prove a broad real 10–15-approach dogfood
portfolio or automatic provider resumption after restart.

## Agent-facing surface

The advertised MCP surface is provider-neutral:

- `read_current_model`
- `create_model_branch`
- `read_model_branch`
- `propose_model_change`
- `compare_model_branches`
- `start_scoped_work`
- `prepare_outward_action`
- `watch_for_return`

It also exposes read-only venture discovery. Former architecture, campaign, bet, fork, wall, and generic drive
tools are no longer advertised. Compatibility HTTP reads remain while migration is incomplete. The former Heat
HTTP/UI/runtime model was removed.

Agents cannot merge current truth, widen a WorkScope, execute an outward action, grant observation, grant
capabilities, or end founder-owned work. Generic outward actions can be prepared and projected. The current
tree now ships one current world-crossing slice: host-stamped `deploy` preparation runs an exact re-verified
repository `package.json` command only from the founder gate, and a separately founder-granted HTTP observer
may read one exact HTTPS target for a bounded window. Other action kinds remain preparation-only.

## Connected read capabilities and credentials

Both Claude and Codex receive the same screened Drover work-loop tools. When a supported local Chromium browser
exists, `read_browser_page` opens one public HTTP(S) page in a fresh in-memory context, returns rendered text and
links, and closes it. It has no click, typing, upload, download, persisted cookies, or access to the founder's
browser session. When an Exa key is connected, `search_web_with_exa` and `read_web_with_exa` provide attributable
public-web reads; the key stays in the host request header and never enters a prompt, subprocess argument, or tool
result. Existing Gmail OAuth remains the structured mail connector and its send path remains founder-gated.

Founder credentials now persist as schema-v2 encrypted envelopes. Electron configures operating-system
`safeStorage` below the renderer boundary; Linux `basic_text` is rejected. Existing plaintext credentials migrate
atomically on first protected desktop access, failed migration preserves the original record, and non-Electron
production writes fail closed. Public APIs continue to expose only redacted connection metadata.

Deploy execution acquires a durable CAS lease before the adapter runs, so concurrent founder requests cannot
execute twice. A completed receipt settles the lease; adapter failure stays retryable. A process interruption
after execution begins leaves an explicit verification-required state and refuses blind retry. HTTP returns
record exact response facts and either a matched return or uninterpreted silence. Observation failure grants no
new authority and remains retryable inside its existing window.

## HTTP surface

Implemented current routes:

- `GET /api/capabilities`
- `GET|POST /api/credentials`
- `POST /api/credentials/gmail/connect`
- `DELETE /api/credentials/:provider`

- `GET /api/ventures/:ventureId/model`
- `GET|POST /api/ventures/:ventureId/model/branches`
- `GET /api/ventures/:ventureId/model/branches/:branchId`
- `POST /api/ventures/:ventureId/model/branches/:branchId/changes`
- `GET /api/ventures/:ventureId/model/branches/:branchId/compare`
- `POST /api/ventures/:ventureId/model/branches/:branchId/merge`
- `POST /api/ventures/:ventureId/model/branches/:branchId/close`
- `GET|POST /api/ventures/:ventureId/work-scopes`
- `POST /api/ventures/:ventureId/work-scopes/:scopeId/revoke`
- `GET /api/ventures/:ventureId/market-movement`
- `POST /api/ventures/:ventureId/outward-actions`
- `POST /api/ventures/:ventureId/outward-actions/:actionId/execute`
- `POST /api/ventures/:ventureId/outward-actions/:actionId/observations`
- `POST /api/ventures/:ventureId/outward-actions/:actionId/observations/:observationId/check`
- `POST /api/ventures/:ventureId/outward-actions/:actionId/observations/:observationId/revoke`

## Visual implementation

The current Product / GTM implementation lives under `ui/src/components/product-gtm/`. It uses a near-black
neutral room, DM Sans operating text, mono exact material, blue focus, amber authority, restrained provisional
texture, distinct meaning-bearing node silhouettes and ports, solid causal arrows, curved dashed dependencies,
source-bearing return edges, Product/GTM crossing spectra, semantic zoom, keyboard controls, minimap, inline node
expansion, persisted drag placement, exact rail-to-node drop handling, and reduced-motion rules. It now composes a
bounded contextual causal chapter around exact selection, founder gates, unread evidence, review work, stale
branches, or active work; unrelated material remains present but quiet, and `Whole venture` returns directly to
the broad causal trunk. A compact top-right map key distinguishes Product, shared truth, and GTM. Its GTM workflow
disclosure puts adopted workflows first and unfolds their exact operational steps on the same canvas; motions
without established mechanics remain visibly unmapped rather than becoming fabricated flows. Exact Work items
keep separate canvas identities even when they share one Thread.

The GTM key now presents ambitious plays in two honest registers. A play's register is derived from physics,
never a self-declared field on its graph: it reads as **drafted** — an intended workflow, visibly marked not yet
real — until it is both founder-adopted (canonical, not a tentative staged draft) and has actually run, at which
point it reads as **established**. Because the register is derived, a draft can never present as established
regardless of what any stored blob once claimed. `deriveWorkflowRegister` is the single source of that truth,
used by both the canvas projection and the GTM key. Selected plays unfold at full operational length with
triggers, sources, agents, tools, conditions, waits, founder gates, outward actions, observations, outcomes,
branches, and return loops; the layout gives every step its own column at a fixed pitch, so a long play scrolls
end to end with no chapter compression or summarized middle.

An established running play carries per-step running counts derived only from real state — live WorkIndex work,
outward-action receipts, and evidence returns — placed on the canonical step of each kind: "N need your approval"
on the founder gate, "N waiting on reply" on the outward action, "N returned" on the observation, and "N in
progress" on the agent-work step. Each count carries the exact item references behind it, so the people are one
click behind the number. A step whose kind has no real item shows no count, a drafted play shows no counts at
all, and nothing is hand-maintained or fabricated. The legacy self-declared workflow `register` blob field was
retired end to end: adoption no longer writes it, and the flow-artifact authoring tool schema and work-loop
prompt no longer require or emit it. Legacy records that still carry the old field read forward cleanly as
drafted until they truly run. The opening camera holds a readable frame on the play and its first steps rather
than shrinking a long workflow to fit; selecting a later step frames that exact point while preserving the whole
graph. Whole-venture and focused camera composition preserve a readable active chapter; below semantic-detail
zoom the remaining portfolio uses meaningful overview markers rather than tiny full labels.

The 2026-07-22 T3 polish pass raised legibility and honesty on the existing surfaces without adding capability.
In Work, non-founder agent output now caps at an 80ch reading measure while the composer keeps its full width, so
long agent turns no longer run to a ~1167px line. In Product / GTM, the whole-venture canvas now opens fit to all
nodes rather than a five-node sample, so nothing lands scattered off-screen; provisional read nodes that would
render edgeless are attached to the page(s) they derive from, or chain into one left-to-right reading trunk when no
page exists yet, so first-run reads are never orphans; an empty GTM territory shows an honest on-canvas note and
dims the GTM legend chip instead of promising plays that do not exist; the page-refine panel now offers the
mandated GTM action — proposing a play that lands as an adoptable Work Thread proposal — alongside starting work;
and resting node labels were raised for legibility. The projection was split under the 500-line ceiling
(`productGtmProjection.ts` 468, new co-located `productGtmChapter.ts` 101) with identical behavior. The dead
`release` member of the thread `contextKind` union was dropped, and the previously undeclared `--n-surface-2`
token the workspace shell already referenced is now declared in `ui/src/index.css`.

The deterministic browser harness remains a development/test surface. Electron remains the shipped product.
Visual verification must confirm that the BrowserWindow loaded and became visible; a healthy Brain alone is not
proof.

## Verification status

Validated during this realignment:

- semantic model and branch unit tests pass;
- selective merge, drift conflict, and agent merge refusal pass;
- WorkScope lease/concurrency and atomic spend tests pass;
- the provider-neutral MCP surface and authority matrix pass;
- the complete Brain suite passes 849 tests; the UI suite passes 49 files and 247 tests;
- the GTM two-register receipts pass: a play whose stored blob claims established still projects as drafted
  without real movement, a not-yet-adopted play that has run stays drafted, only a canonical play that has run
  reads as established, per-step running counts derive from real state with the exact items behind each count and
  none on empty steps, a long play lays out at full length with one node per step, and a legacy `channel` workflow
  record reads forward into the two-register model without trusting its stored register;
- focused canvas tests pass 28/28; focused credential/connector tests pass 31/31;
- UI lint, the production build, and service/component size checks pass;
- runtime reachability, dead-code, and UI bundle checks pass;
- the live browser-read adapter opened `https://example.com`, returned rendered text and one link, and closed its
  isolated context;
- the deterministic `1440×900` Product/GTM browser journey proves the `0.82` opening floor and one-click adopted
  workflow disclosure;
- deterministic browser acceptance passes for first run, return/offline recovery, founder consequences, native
  coding, dense Product/GTM, selective merge, and the two-surface boundary;
- the July 21 Product/GTM coherence correction passes focused left-to-right causal-path, territory-crossing,
  opening-frame, feature-compression, local-reflow, exact-Work separation, dense-data, and 200%-zoom browser receipts;
- the current deploy/return slice passes founder-only execution, durable failure, double-execution exclusion,
  exact-target observation, silence, returned-evidence, observation-failure, UI-state, production-build, and
  real-browser repository-command/observation-grant receipts;
- the provisional local-model browser receipt passes at `1440×900`: mixed-semantic material stays contained above
  the composer without workflow language, and review opens the exact branch with its source-bearing change selected;
- dense Product/GTM remains contained at 1440×900 and at a simulated 200% zoom without truncating canonical
  objects, model alternatives, or outward actions;
- the Electron suite confirms a visible local-asset BrowserWindow, in-process Brain, restart recovery, trusted
  founder bridge, and no production HTTP listener;
- the packaged macOS app builds, opens a visible renderer, reaches its in-process Brain, and includes the native
  Claude/Codex runtime dependencies;
- deleting the retired UI bundles reduced the production graph and bundle while keeping size budgets green.

The complete pre-enhancement `npm run test:acceptance` receipt passed on July 21, 2026. It is not a current
post-enhancement receipt. The single remaining red gate is `npm run check:architecture`, which reports 134 Brain
modules against the 131-module ceiling — three over, down from five. The 2026-07-22 T3 polish pass removed the two
genuinely dead firm route modules that accounted for the earlier gap (`architecture-routes.mjs`,
`release-routes.mjs`) and their transport tests; the load-bearing `firmRoutes` wall-decide surface was verified and
kept. No dead Brain module remains: every module now has at least one importer, and the one-importer families
(`work-loop-*`, the work-loop guards, the semantic-model compat shim) are LOC-ceiling-compliant feature-local
splits whose sole importers already sit at the 500-line service ceiling (`work-loop-tools.mjs` 499,
`semantic-model.mjs` 489). Folding any of them back would trade the module-count violation for an LOC violation, a
worse outcome. Reconciling to 131 without weakening either check therefore requires a deliberate deeper
consolidation, not more dead-code removal; the check was not weakened and readiness stays red on it alone.
`npm run verify:tokens` now passes (171 canonical tokens across 14 CSS files); every remaining infinite animation
sits on an exempt `spinner`/`data-state="stopping"` work-receipt selector. `npm --prefix brain test` passes 849/849
and `npm --prefix ui run test:unit` passes 247/247 across 49 files; the UI production build, lint, token, and
service/component size checks pass.

The deterministic complete founder loop is proven through selective Product-model merge. One real external
dogfood loop remains required before release readiness because it would invoke provider credits and world-
crossing actions that this implementation run did not have authority to spend or execute.

## Known open work

- Remove remaining Brain-side architecture/release/bet/fork/crew read adapters only after export/import migration
  coverage proves old ventures survive without them.
- Finish Product/GTM authoring gestures for branch creation and model-change proposal from contextual work.
- Add outward executor/observation adapters for real kinds beyond the current deploy + bounded HTTP slice and
  compatibility release/Gmail seams; do not turn this into a generalized send/publish engine before repeated
  venture use earns one.
- Resume interrupted scoped provider work automatically only when exact participant, provider, spend, and machine
  constraints are all satisfied.
- Complete reduced-motion, auth, budget, provider-backpressure, outward failure, silence, and merge-conflict visual
  screenshot QA beyond the deterministic state assertions already present.
- Reconcile the Brain tree to the 131-module ceiling without weakening the check. The tree is now three modules
  over (134), down from five after the dead firm route removal. No dead module remains to reclaim: the overage is
  now structural, caused by LOC-compliant feature-local splits (`work-loop-*`, work-loop guards, semantic-model
  compat) whose importers already sit at the 500-line service ceiling. Closing the last three requires a deliberate
  consolidation call — a genuine conflict between the module-count and LOC ceilings — not more deletion.
- Exercise Exa and Gmail against founder-connected accounts only with explicit authority for API use and any
  world-crossing send. This implementation used no founder account, message, or paid API credit.
- Complete a real dogfood loop from repository connection through outward action, evidence return, selective
  Product-model merge, and the faster next move.
