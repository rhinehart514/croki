# Croki current-state audit

Audited: 2026-08-05  
Subject: the current `croki/main` working product and the in-progress 0.4.8
simplification

## Executive assessment

Croki is a credible application-aware development environment with stronger
execution, provider, recovery, and evidence foundations than its current
product legibility suggests. Its main weakness is not missing agent capability.
It is that the founder must still reconstruct the state of the work from the
Thread, Preview, Diff, Git controls, terminal receipts, and provider prose.

Overall assessment: **76/100**. The architecture and provider substrate are at
a solid B level. Product completion, release truth, remote trust, onboarding,
and removal of legacy product models keep the whole below that level.

This score is a prioritization device, not a release gate. A higher score must
come from verified behavior, not more surfaces or product concepts.

## Product boundary

Croki is an ADE. The selected provider remains the agent and retains its native
reasoning, planning, delegation, memory, tools, and response behavior. Croki
owns the durable environment around that work:

- the canonical Thread and worker Thread representation;
- repository, worktree, files, terminal, Preview, Review, and Git state;
- permissions and consequential-action boundaries;
- durable runtime, checkpoint, and environment receipts;
- evidence the founder or a later provider turn can inspect; and
- recovery after refresh, reconnect, provider failure, or application restart.

Croki must not turn the findings in this audit into an implicit planning loop,
completion judge, provider router, behavioral prompt, or orchestration policy.
It should make native work easier to understand, verify, resume, and ship.

## Graded state

| Area                              | Score | Current judgment                                                                                                                                  |
| --------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product thesis and coherence      |    72 | The ADE and founder audience are credible, but the repeatable changed result is not yet visible as one product path.                              |
| Core founder loop                 |    83 | Thread, intervention, Preview, Diff, Git, approvals, and recovery are substantive; verification and shipping remain fragmented.                   |
| Architecture and type safety      |    82 | Contracts, ordered replay, provider instances, and deterministic orchestration are strong; runtime durability and oversized modules remain risks. |
| Tests, CI, and release operations |    79 | Unit and contract coverage is broad and release destinations fail closed; packaged runtime and enabled publication paths are not fully proven.    |
| Visual system and accessibility   |    78 | The dense workspace has a coherent direction; core sidebar, composer, Preview input, tabs, and motion contain semantic or accessibility defects.  |
| Security and trust                |    72 | Local auth, workspace writes, Electron isolation, and secure native storage are strong; terminal and remote authority are too broad.              |
| Provider support and parity       |    82 | Six provider drivers preserve native differences; rollback, auth confidence, MCP availability, and readiness are not uniformly represented.       |
| Cross-platform product            |    76 | Web, desktop, React Native, and native iOS share real contracts; Preview, Canvas, remote creation, packaging, and distribution are not at parity. |
| Onboarding and documentation      |    76 | Setup and recovery guidance exists; provider coverage, compatibility naming, platform availability, and support paths drift.                      |
| Marketing and external readiness  |    62 | The wedge is compelling, but public availability, ownership, proof, and download claims run ahead of enabled Croki releases.                      |
| Performance and scale             |    78 | Timeline virtualization and telemetry are good; long Thread reads are unpaged and hot paths repeatedly process full histories.                    |
| Simplicity and product debt       |    68 | 0.4.8 removes significant machinery, but legacy scopes, duplicate surfaces, and very large modules remain active.                                 |

## What is already strong

### Native provider ownership

`ProviderService` resolves a configured provider instance and delegates work to
its adapter. The shared adapter boundary translates lifecycle and event
differences without requiring providers to behave identically. Codex, Claude,
OpenCode, Cursor, Grok Build, and OpenClaw have real drivers; Cursor and Grok
remain early access.

The native-provider rule is explicit and worth preserving. Canvas visibility,
application direction, and environment presentation do not grant authority or
silently select a harness.

### Durable execution substrate

Croki has durable projects, Threads, messages, activities, checkpoints,
worktrees, Git operations, terminals, files, Preview, plans, approvals, remote
connections, and recovery. Typed orchestration envelopes carry sequencing,
causation, and completion information. Live subscription is attached before
snapshot and replay, and clients deduplicate ordered updates.

### Honest evidence foundation

Checked screens are preserved as Thread-owned evidence. The product correctly
states that a checked screen proves capture, not complete flow, breakpoint,
accessibility, or production coverage. Missing visual evidence can appear as
**Not checked** rather than a fabricated success state.

### Release ownership guards

Release destinations are independently enabled and validated. Inherited T3
repositories, packages, services, and mobile destinations are rejected rather
than silently published to. This is the correct foundation even though it
means Croki is not yet externally available on every advertised platform.

## Highest-priority findings

### 1. Completion is visible only after reconstruction

The founder loop exists across several surfaces, but no Croki-owned projection
answers all of these factual questions together:

- What changed?
- What did the environment observe running or passing?
- What screens were inspected?
- What remains unverified?
- Is the branch committed, pushed, or attached to a pull request?
- Does the provider need input or authority?

The provider's final prose cannot be the durable source of these facts, and
Croki should not replace it with a judgment. Croki can derive a compact factual
turn result from checkpoint, command, Preview, approval, and Git receipts.

### 2. Environment failures do not always lead to recovery

The UI can accurately show an unavailable or unauthenticated provider, but the
composer path can still end at a disabled control or a banner that only says to
sign in through a CLI. Readiness should remain provider-native while adding
direct routes to Settings, provider instructions, retry, or environment
reconnection.

### 3. Provider capabilities are broader than the typed parity model

The common capability model covers only part of the meaningful variance.
Rollback may be provider-native, a local transcript projection, or unsupported.
Forking, voice, model switching, background text generation, MCP-backed
application observation, and auth confidence also vary. Controls must state
the real capability rather than imply identical semantics.

### 4. Remote and terminal authority exceed project boundaries

Terminal CWD validation currently proves that a directory exists, not that it
belongs to the authorized project or worktree. Caller runtime environment
values are merged after the base environment blocklist. Standard remote scopes
also authorize broad server-level project, terminal, Git, and Preview actions.

Before broader remote use, authority should be scoped to environment, project,
worktree, Thread, tool family, and lifetime. This restricts the ADE without
changing how the selected provider reasons inside granted authority.

### 5. Sensitive telemetry and browser credentials need a stricter policy

Malformed browser trace payloads can be logged, and configured OTLP forwarding
passes browser trace bodies outward. Web connection records persist credentials
in IndexedDB, while desktop and mobile use stronger OS-backed storage. Croki
needs an allowlisted telemetry boundary, explicit external-export control, and
a documented credential lifecycle.

### 6. Long Threads lack a bounded client contract

Projection snapshots query complete message, activity, plan, and checkpoint
histories. Client reducers and timeline derivations repeatedly copy, filter,
sort, or scan full arrays during streaming updates. Server-side caps do not
replace a paginated transport and UI contract.

Croki should load recent history first, preserve the viewport anchor while
loading older history, and update ordered indexes incrementally. A repeatable
long-Thread benchmark should guard payload, first paint, streaming, scrolling,
and heap behavior.

### 7. Intended simplification and active compatibility paths disagree

The 0.4.8 direction says the application brief is the only active `.croki`
product model and Concept, Release, Venture, and progress are compatibility
input. Active provider-turn code still loads parts of that hierarchy and
derives progress. Product docs also say **Product**, while provider architecture
previously described **GTM v1**.

Compatibility decoding may remain where installed repositories require it, but
legacy data must not silently continue as active context or visible product
behavior. The migration boundary needs an expiry condition and tests.

### 8. Public platform claims exceed enabled distribution

The marketing download surface advertises platforms and stores that current
release documentation describes as disabled, unsigned, inherited, or not yet
distributed. Public claims should be generated from or checked against one
Croki-owned release manifest. An unavailable platform should be labelled as
such rather than routed through a hopeful fallback.

## Verified accessibility defects

- Sidebar V2 uses interactive row wrappers containing nested controls.
- The primary contenteditable composer lacks a persistent accessible name.
- The Preview address field relies on placeholder text rather than a label.
- Right-panel tab controls do not implement tab semantics and keyboard behavior.
- Some continuous animation lacks reduced-motion handling.

These are bounded repairs to existing surfaces, not a visual redesign.

## Recommended order

1. Restrict terminal and remote authority; add telemetry redaction and lifecycle
   tests.
2. Make marketing and download availability match enabled Croki-owned release
   destinations.
3. Add the ADE-native turn result described in
   [ADE-native adjustments](./ade-native-adjustments.md).
4. Put provider and environment recovery actions beside the blocked composer.
5. Represent provider capability differences explicitly.
6. Add paginated Thread history and performance regression budgets.
7. Finish quarantining legacy Concept, Release, Venture, progress, and GTM
   behavior.
8. Repair the verified accessibility defects and perform rendered keyboard,
   contrast, responsive, loading, failure, and recovery QA.

## Evidence and verification limits

During this audit:

- `npm run check:croki` passed against the recorded upstream base;
- focused web tests and web typechecking passed in the reviewed areas;
- focused release, artifact, and observability tests passed;
- `npm run release:smoke` passed; and
- the local development server could start with isolated state.

No collaborative browser or Preview automation host was available. Visual
composition, focus order, contrast, breakpoints, and live recovery behavior
therefore remain unverified and are not inferred from source inspection.

The working tree also contains the active 0.4.8 changes. This document
distinguishes intended direction from behavior that remains active in that tree.
