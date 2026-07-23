# STATE — Croki

**Stage:** alpha. **Updated:** 2026-07-23.
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

Desktop startup now loads and reveals the founder window before unfinished-work recovery begins. Recovery yields
until after the renderer load and fails to the diagnostic log rather than closing a usable shell. Brain and its
synchronous repository work still share Electron main, so this proves earlier visibility, not sustained
responsiveness under recovery; the process boundary remains unbuilt.

The product map now stays true without founder upkeep: a founder-confirmed source apply re-runs the page
derivation as a reconciler. An unchanged page produces zero store writes (no revision or timestamp churn, so
unrelated canvas nodes never move), a page the code no longer proves retracts only while it is still the
adapter's own tentative read — founder-corrected or adopted records are never rewritten or removed, and a page
other venture truth still references keeps its object while its derived links retract. A derivation returning
zero pages leaves the existing map alone, a sync failure never fails the apply, Croki's own isolated worktrees
are excluded from derivation, and there is no file watcher or polling; manual re-map still works unchanged.

Work remains the direct coding-agent surface with exact provider/model choice, isolated coding attempts,
conversation, files, diff, preview, terminal, verification, checkpoints, and founder-controlled source apply.
New Work directions now receive their exact durable Thread and founder-message identities in the acceptance
response. The immediate founder turn rebinds from its draft address to that Thread and remains visible until the
same durable message arrives, rather than discovering the new Thread from a creation-time heuristic.
The founder can delete any non-root chat from its existing action menu. One inline confirmation makes clear that
live work will stop; the founder-only delete tombstones the Thread, refuses future continuation, requests
cancellation for every attached live Run, revokes restartable WorkScopes rooted there, and removes the chat from
Work while preserving Product truth, artifacts, and receipts.
Product/GTM conversation now uses the same exact Work Thread and founder-selected Claude or Codex runtime,
model, and effort as Work. Its compact canvas composer hides repository controls but does not replace their
values or create another participant identity. Closing and reopening the dock preserves the scoped draft,
Thread, and last coherent transcript. Product interpretation and proposal review stay beside the canvas;
native repository execution, preview, terminal, diff, or other Work-owned material follows the same Thread
into Work. A branch-backed provisional local model view may appear above that Thread's composer; corrections
preserve the same durable work and `ModelBranch`, and review uses the existing selective merge surface.

Product / GTM now rests on the code-proven Product walk: repository-derived pages in left-to-right walk order
with only source-supported navigation links. Selecting a page, consequence, play, play step, or evidence return
derives one feature-local presentation projection around that question; projections are ephemeral canvas state,
not modes or semantic truth. Current truth, provisional alternatives, live work, founder gates, and evidence
remain visually distinct across Product, shared Product/GTM, and GTM territories. Automatic layout owns
placement. Nodes are not draggable, the Organize control and placement writes are absent, and legacy placement
records remain readable compatibility data. Node selection expands exact material in place.

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
Targeted work scopes resume state by explicit WorkScope, exact work item, or Thread in that order. Unrelated
Threads for the same provider can run concurrently, while the same Thread or work item remains single-writer.
Untargeted legacy work keeps the participant-wide fallback rather than guessing an unsafe association.

Desktop live updates now have one ref-counted upstream connection per venture in the renderer, while the Electron
bridge routes subscriptions by opaque identity. Work connection and Thread timeline consumers receive the same
venture events, and removing either consumer cannot tear down the other's stream. The events remain invalidations;
typed delta delivery and targeted projection updates are not yet built.

Claude's native `AskUserQuestion` and policy-triggered permission prompts now cross the headless Agent SDK seam
without disappearing. Croki parks the structured question or exact requested action on the existing founder
wall, keeps option descriptions, multi-select choices, and previews, and pauses durable Work. A founder answer
becomes the next founder turn and resumes the same Thread, Claude session, selected model, and isolated worktree.
A native tool permission may be allowed once only for the exact hashed tool input; the grant is consumed on use
and expires at the end of that resumed drive. Commit, merge, push, PR, deploy, publish, and destructive restore
commands remain behind Croki's existing exact consequence controls and cannot be granted through this seam.

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
tree now ships two current world-crossing slices. Host-stamped `deploy` preparation runs an exact re-verified
repository `package.json` command only from the founder gate, and a separately founder-granted HTTP observer
may read one exact HTTPS target for a bounded window. Outbound `message` is now a first-class kind on the same
physics: preparation stamps the exact recipient, subject, and body without touching the network; execution is
founder-only through the existing Gmail transport under the same durable CAS lease (concurrent sends excluded,
interruption after execution begins leaves verification-required and refuses blind retry); the executor receipt
records the Gmail message and thread ids; and a founder-granted `gmail-thread` observer, refused unless the send
receipt names a thread and unable to widen beyond it, returns a reply's exact facts (from, date, snippet) or
uninterpreted silence within its bounded window. The legacy wall/bet message seam is unchanged and separate.
Other action kinds remain preparation-only.

## Connected read capabilities and credentials

Both Claude and Codex receive the same screened Croki work-loop tools. When a supported local Chromium browser
exists, `read_browser_page` opens one public HTTP(S) page in a fresh in-memory context, returns rendered text and
links, and closes it. It has no click, typing, upload, download, persisted cookies, or access to the founder's
browser session. When an Exa key is connected, `search_web_with_exa` and `read_web_with_exa` provide attributable
public-web reads; the key stays in the host request header and never enters a prompt, subprocess argument, or tool
result. Existing Gmail OAuth remains the structured mail connector and its send path remains founder-gated.

Native coding UI work uses a separate Croki-owned preview, not a founder browser session or an agent-launched
browser. Each Run is pinned to its exact isolated coding workspace and can use `preview_open`, navigation,
click/type/press/scroll, DOM evaluation/wait, and screenshot tools against the preview mounted visibly in that
Work Thread. Claude's native coding prompt explicitly directs local UI verification through those tools and
forbids launching a separate browser-automation session. The broker refuses cross-Run or cross-workspace access
and releases the pin on every provider exit, including failure, before the error propagates.

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
- `POST /api/ventures/:ventureId/journey-imports`
- `POST /api/ventures/:ventureId/journey-imports/:importRef/preview`
- `POST /api/ventures/:ventureId/journey-imports/:importRef/adopt`
- `DELETE /api/ventures/:ventureId/journey-imports/:importRef`
- `GET /api/ventures/:ventureId/journey-observations`
- `GET /api/ventures/:ventureId/journey-mapping-proposals`
- `POST /api/ventures/:ventureId/outward-actions`
- `POST /api/ventures/:ventureId/outward-actions/:actionId/execute`
- `POST /api/ventures/:ventureId/outward-actions/:actionId/observations`
- `POST /api/ventures/:ventureId/outward-actions/:actionId/observations/:observationId/check`
- `POST /api/ventures/:ventureId/outward-actions/:actionId/observations/:observationId/revoke`

## Visual implementation

The current Product / GTM implementation lives under `ui/src/components/product-gtm/`. It uses the shared
T3-shaped shell and a near-black spatial center with DM Sans operating text, mono exact material, blue focus,
amber authority, restrained provisional texture, meaning-bearing node silhouettes, explicit relationship verbs,
source-bearing returns, Product/GTM crossing spectra, keyboard controls, minimap, inline expansion, and
reduced-motion rules. The default Product walk, consequence trace, full play, and evidence-return projections
reuse the same React Flow canvas and existing node and edge components. Unknown legacy edges render as
**Related to**; code, expectation, support, contradiction, sequence, dependency, and return meanings remain
available without relying on color.

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
play. Product-walk and focused camera composition preserve a readable active chapter; below semantic-detail zoom
secondary context uses meaningful overview markers rather than tiny full labels.

Drafted plays now carry the mandated per-step walkthrough. "Walk through this play" focuses step one on the
canvas and opens the play-scoped conversation; step focus is canvas selection (`workflow:<playId>:<stepId>`),
so existing selection framing, reduced-motion collapse, and session persistence apply with no new camera or
mode machinery. The dock names the focus ("Drafted play · Step N of M" with the step label) above the composer
with keyboard-reachable previous/next controls that disable honestly at the ends. A message sent while a step
is focused carries the play's real object ref plus the step's stable id from its own workflow graph — no
fabricated object identity — and the drive prompt directs the agent to revise that exact step while preserving
every other step. An established play keeps "Run again" and none of this machinery appears. A prepared
`message` outward action shows the exact recipient, subject, and full unclamped body at the founder decision
point, and the gmail-thread watch control appears only when the send receipt names a thread.

The 2026-07-23 Product/GTM pass replaces fit-all opening behavior with the Product walk and adaptive local
framing. Page refinement asks what should be different and for whom; connecting a change to market is unavailable
until an adopted Product consequence exists. Selected plays still render every step, while their opening camera
frames the owner and first three steps readably. Observed journey imports accept one UTF-8 JSON, JSONL, or CSV
file up to 12 MiB. Raw rows and identifiers remain in a venture-scoped `0600` staging file only long enough for
deterministic aggregation; SDKs receive a sanitized profile, the founder adopts an exact mapping proposal, and
only aggregate counts plus a bounded receipt persist. The summoned overlay can show page observations,
transitions, drop-offs, and observed-only curves without changing repository topology or semantic-model v3.

The earlier T3 polish pass also raised legibility and honesty on the existing surfaces. In Work, non-founder
agent output caps at an 80ch reading measure while the composer keeps its full width. Resting canvas labels were
raised for legibility, an empty GTM territory remains honestly empty, and the projection code stays below the
repository size ceiling. The projection was split under the 500-line ceiling
(`productGtmProjection.ts` 468, new co-located `productGtmChapter.ts` 101) with identical behavior. The dead
`release` member of the thread `contextKind` union was dropped, and the previously undeclared `--n-surface-2`
token the workspace shell already referenced is now declared in `ui/src/index.css`.

The 2026-07-23 Work polish pass further reduced resting chrome. The anchored composer no longer repeats the
connected-capability inventory already owned by Product / GTM; it keeps only the explicit participant, SDK
model and effort, repository, isolated worktree, and guarded-authority context. Those controls stay on one row
at the full conversation width and wrap as one unit when the adjacent review workspace narrows the chat.
Artifact, evidence, comparison, and code references now read as compact transcript receipts rather than stacked
ledger bands, while an unresolved founder consequence retains the only attention treatment. The Work composer
uses the same 16px corner geometry as founder turns with a quieter 80px minimum and restrained shadow.

The deterministic browser harness remains a development/test surface. Electron remains the shipped product.
Visual verification must confirm that the BrowserWindow loaded and became visible; a healthy Brain alone is not
proof.

## Verification status

Validated during this realignment:

- semantic model and branch unit tests pass;
- selective merge, drift conflict, and agent merge refusal pass;
- WorkScope lease/concurrency and atomic spend tests pass;
- the provider-neutral MCP surface and authority matrix pass;
- the complete Brain suite passes 992 tests; the complete UI suite passes 369 tests, the Electron suite passes
  54 tests, and the production UI build succeeds;
- the outward message receipts pass: preparation stamps the exact contract with zero network use, agent
  execution is refused, the founder send records Gmail message/thread ids, the CAS lease excludes a concurrent
  double send, interruption leaves verification-required and refuses blind retry, a gmail-thread grant is
  refused without a receipt thread id and cannot widen, a matched reply returns exact facts, an empty thread
  returns silence, a failed read stays retryable, and the legacy wall/bet message path still passes;
- the map reconciler receipts pass: a no-change re-run produces zero writes and no revision movement, a removed
  page and its links retract while a founder-corrected page is never clobbered or removed, an apply that lands
  a new page reaches the map citing the founder's source rather than a worktree, and a throwing sync leaves the
  apply applied;
- the walkthrough receipts pass: a drafted play's walkthrough focuses step one and opens the play conversation,
  advancing updates the named step, a correction carries the exact step reference, and an established play
  shows "Run again" with no step machinery;
- the GTM two-register receipts pass: a play whose stored blob claims established still projects as drafted
  without real movement, a not-yet-adopted play that has run stays drafted, only a canonical play that has run
  reads as established, per-step running counts derive from real state with the exact items behind each count and
  none on empty steps, a long play lays out at full length with one node per step, and a legacy `channel` workflow
  record reads forward into the two-register model without trusting its stored register;
- focused canvas tests pass 28/28; focused credential/connector tests pass 31/31;
- UI lint, the production build, and service/component size checks pass;
- focused provider-intervention and Claude runtime boundary receipts pass, and the structured founder-decision
  UI passes; architecture verification passes at the consciously re-baselined 149-module ceiling with the
  intervention and journey-import boundaries kept in feature-local modules;
- runtime reachability, dead-code, and UI bundle checks pass;
- the live browser-read adapter opened `https://example.com`, returned rendered text and one link, and closed its
  isolated context;
- the deterministic `1440×900` Product/GTM browser journey proves the `0.82` opening floor and one-click adopted
  workflow disclosure;
- deterministic browser acceptance passes for first run, return/offline recovery, founder consequences, native
  coding, dense Product/GTM, selective merge, and the two-surface boundary (8/8 journeys);
- Product/GTM receipts prove the code-proven Product walk as the resting projection, page expansion in place,
  consequence-before-market gating, full-play local framing, non-draggable automatic placement, Thread continuity
  across the canvas and Work, and a summoned observed-journey overlay that restores the prior camera and selection;
- journey-import receipts pass for JSON, JSONL, quoted CSV, UTF-8 and size rejection, sanitized profiling,
  venture isolation, deterministic preview and aggregation, exact and adopted dynamic route mapping, stale-map
  refusal, bounded receipts, raw-file cancellation and expiry, and persisted snapshots without raw people or rows;
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

The complete post-enhancement `npm run test:acceptance` receipt passes on July 23, 2026: the complete mechanical
suites, token, reachability, architecture, size, bundle, site, eight deterministic browser journeys, 54-test
visible-Electron suite, and packaged macOS launch receipt. `npm run check:architecture` passes across the current
149 Brain modules with no cycles or retired imports, and the service/component size checks pass.
`npm run verify:tokens` passes with 171 canonical tokens across 16 CSS files; remaining infinite animations are
limited to the gate's explicit work-state exemptions. The UI production build and bundle budgets pass, with the
entry at or below 350 KB, general chunks at or below 600 KB, and listed on-demand grammars at or below 850 KB.

The deterministic complete founder loop is proven through selective Product-model merge. One real external
dogfood loop remains required before release readiness because it would invoke provider credits and world-
crossing actions that this implementation run did not have authority to spend or execute.

## Known open work

- Remove remaining Brain-side architecture/release/bet/fork/crew read adapters only after export/import migration
  coverage proves old ventures survive without them.
- Finish Product/GTM authoring gestures for branch creation and model-change proposal from contextual work.
- Add outward executor/observation adapters for real kinds beyond the current deploy + HTTP and message +
  gmail-thread slices and the compatibility release/Gmail seams; do not turn this into a generalized
  send/publish engine before repeated venture use earns one.
- Resume interrupted scoped provider work automatically only when exact participant, provider, spend, and machine
  constraints are all satisfied.
- Complete reduced-motion, auth, budget, provider-backpressure, outward failure, silence, and merge-conflict visual
  screenshot QA beyond the deterministic state assertions already present.
- The structural conflict between the module-count and LOC ceilings on the one-importer families
  (`work-loop-*`, work-loop guards, semantic-model compat) remains a deliberate consolidation call, not deletion.
- Exercise Exa and Gmail against founder-connected accounts only with explicit authority for API use and any
  world-crossing send. This implementation used no founder account, message, or paid API credit.
- Complete a real dogfood loop from repository connection through outward action, evidence return, selective
  Product-model merge, and the faster next move.
