# Multiplayer ADE

Status: proposed for Jacob's confirmation before implementation  
Last updated: 2026-08-16  
Depends on: [current project state](./current-state.md), [Croki design](../../DESIGN.md), [domain language](../../CONTEXT.md), and [ADRs 0001-0014](../adr/)

## Decision

Croki will evolve directly into the multiplayer development environment for small software product teams working with agents.

A Project is shared once. Every Project Member can discover every Thread. Each Thread remains the single canonical account of one intended outcome, with one primary provider conversation, durable Worker Threads and Attempts, unresolved human judgment, and source-grounded evidence. The solo product remains the same Croki Jacob already uses; multiplayer behavior appears only when another Person becomes relevant.

Croki proves this product in one owner-controlled Execution Environment before taking on managed cloud execution, horizontal business workflows, or enterprise administration.

## State transition

When an agent has been working on a software outcome for hours, a teammate can enter the same Thread without a private briefing, understand its Current Reality, contribute direction or judgment, follow the work, and help it reach a verified result while Croki preserves authorship, authority, attempts, evidence, and recovery.

The defining event is **Mid-work Entry**:

1. a Person enters a Thread after meaningful work has already happened;
2. answers what the team is trying to make true, what is happening now, what needs judgment, and what evidence exists or is missing;
3. makes one useful intervention without a separate recap; and
4. follows the result to factual evidence or an honest unresolved state.

Parallel agent count, token volume, invitations, and administrative controls do not prove the product.

## First team

The first customer is a two-to-eight-person AI-native Product Team spanning enough product, design, and engineering judgment to ship software.

They already use coding agents. Work lasts long enough that someone else needs to enter it. Today they reconstruct private transcripts through Slack, pull requests, screen sharing, and meetings. One person often becomes the sole carrier of agent context.

The first release does not target enterprise platform departments, regulated work, anonymous communities, or solo builders who only share completed results.

## Product model

### Project

The Project is the collaboration and confidentiality boundary for one software product.

- It belongs to one Execution Environment.
- It has exactly one Project Owner and zero or more Project Members.
- Every active Project Member can discover and enter every Thread, including Worker Threads.
- Work requiring a different confidentiality boundary belongs in a different Project.
- There are no private Threads, Thread roles, or team modes.

### Thread

The Thread is the canonical shared work object for one intended outcome. It contains:

- human messages with authorship and Addressing;
- one Canonical Provider Lane;
- durable Worker Threads, Attempts, and bounded Workstreams;
- provider and environment state;
- approvals, user input, failures, and unresolved judgment;
- branch, worktree, checkpoint, Diff, Preview, test, commit, push, and pull-request evidence; and
- one understandable final, interrupted, failed, superseded, or settled state.

Croki does not add a Room, task board, collaboration dashboard, comments channel, or second conversation.

### Canonical Provider Lane

Each Thread has exactly one primary ordered provider conversation and at most one active primary turn.

- An idle Thread-addressed message starts the next turn.
- A running Thread-addressed message enters a visible durable FIFO for the next turn.
- An explicitly agent-addressed message may become Live Guidance against the exact active turn when the selected provider proves native steering.
- A person-addressed message is visible in the Thread but does not act on the provider.
- Croki never silently starts a second primary turn or changes an ordinary message into guidance.

Provider differences remain truthful. Unsupported Live Guidance stays an editable draft or can be explicitly queued for the next turn; Croki does not emulate steering.

### Worker Threads, Attempts, and Workstreams

A real provider child conversation becomes a durable, read-only Worker Thread beneath its parent.

- A concurrently writing Worker Thread receives its own worktree and branch by default.
- Retrying the same assignment after failure or interruption creates the next Attempt while preserving prior Attempts.
- A materially different assignment or workspace lineage creates a new Worker Thread.
- Provider activity without a durable child conversation remains a bounded Workstream rather than a fabricated Worker Thread.
- Worker failure is visible without making the parent fail unless the canonical lane is blocked.
- `Continue in parent` returns to the canonical Thread.

The existing **Separate chats** and **In Thread** presentations remain mutually exclusive views over the same real children.

## End-to-end experience

### Create and share a Project

1. The Project Owner opens an existing repository in a Croki Execution Environment.
2. Croki verifies provider and repository readiness without changing provider behavior.
3. The owner creates or opens the Project and starts a real Thread.
4. The owner creates a revocable Project Invitation.
5. The recipient authenticates as a Person, accepts once, and becomes a Project Member.
6. The Member lands directly in the intended Thread and can thereafter open every Project Thread without another invitation.

GitHub may authenticate the Person or confirm repository access. Croki still owns Project admission, membership, authority, and revocation.

Invalid, expired, identity-mismatched, consumed, or revoked invitations fail closed and reveal no Project or Thread content.

### Enter work already underway

Croki opens the real Thread, not a lobby or summary destination.

When meaningful state changed since this Person last visited, one compact Current Reality projection appears above the relevant timeline boundary. It may show:

- the intended outcome and latest explicit human direction;
- canonical provider state and current plan step when available;
- active Worker Threads and Attempts;
- unresolved approval, question, contradiction, failure, or missing authority;
- current branch, worktree, checkpoint, and changed files;
- observed checks and exit state;
- checked screens and explicit missing visual evidence; and
- commit, push, pull-request, and environment availability state.

Every fact opens its source. Current Reality is not a generated status report, correctness judgment, acceptance score, or separately maintained brief. The first implementation should compose it deterministically from Croki-owned and source-labelled facts. Any future generated compression must remain labelled synthesis with source coverage and omissions visible.

Cached history appears immediately. Catch-up preserves viewport position, drafts, and local surface selections. Large gaps show a bounded recent slice with **Load earlier turns** rather than replaying everything into the viewport.

### Presence and typing

Presence is relevant-only, ephemeral, and visually quiet.

- The Thread header may show who is currently viewing the same Thread.
- Preview and Diff may say that another Person is viewing a specific route, file, or line.
- Typing appears immediately above the composer, contains no draft content, and expires after input stops, navigation, backgrounding, or disconnect.
- Provider output remains **Working**, never human typing.
- Drafts remain device-local until sent.
- When no other Person is relevant, all multiplayer chrome disappears.

Croki does not add a persistent online roster, last-seen system, read-receipt theater, presence dashboard, or durable typing history.

### Address a message

One composer serves the one canonical Thread timeline.

| Address         | Meaning                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| Thread          | Shared direction. Starts the lane when idle or queues the next turn while busy.          |
| Person          | Visible human-directed message. Does not act on the provider.                            |
| Canonical agent | Explicit provider action. Starts when idle or offers native Live Guidance while running. |
| Worker Thread   | Not directly writable. Open its transcript and continue through the parent.              |

Every message shows its Person and Addressing. Addressing changes who should act, not who can see the work.

### Guide running work

Live Guidance is attached to the exact active turn and visibly moves through:

- **Delivering guidance**;
- **Guidance delivered**;
- **Guidance not delivered**; or
- **Guidance delivery unconfirmed**.

All Members see the message and delivery state. Guidance that becomes unconfirmed is never replayed automatically. If the turn finishes during delivery, Croki preserves the honest outcome and never silently converts it into a new turn.

### Follow another Person

Following is opt-in, local navigation.

- `Follow Alex` may mirror a bounded Preview route/viewport or Diff file/line selection.
- Manual navigation or explicit stop exits follow mode.
- Disconnect, surface closure, or unsupported client capability ends following honestly.
- Follow state is not persisted as Thread history, provider input, or Project truth.
- Opening or following Preview or Diff never changes provider instructions, tool access, context, or authority.

Croki does not synchronize cursors, remote-control another Person, or pretend mobile has an interactive Preview it cannot support.

### Resolve judgment

Approvals and provider user-input requests are first-class durable shared records.

- Every Member can see the request and its consequence.
- The first valid authorized response wins atomically.
- Other clients move to **Already resolved** rather than implying their stale click succeeded.
- A Member without authority sees **Owner approval needed** and a direct way to address the owner.
- Offline clients may preserve a draft or selection but cannot claim resolution.
- Decline, Stop, and interruption remain distinct from failure.

Project navigation raises only unresolved approval/input, an unvisited actionable failure, or another state requiring that Person. It does not become an inbox.

### Finish and verify

When the canonical turn settles, Croki adds at most one factual Turn Result beneath the provider answer. It may include:

- changed files and checkpoint;
- observed commands/checks and exit state;
- checked screens or **Not checked**;
- unresolved approval, input, or failure;
- commit, push, and pull-request state; and
- the provider's conclusion, clearly attributed.

Each item opens the existing Diff, Preview, Review, terminal receipt, or Git surface. Croki never claims correctness because the provider stopped. Background workers keep the parent **Monitoring**. **Settle** is a lifecycle choice, not a correctness verdict, and new activity reactivates settled work.

## Identity and authority

### People and devices

- Croki owns a durable Person identity.
- A Person may link multiple External Identities and Devices.
- A Session binds one authenticated Person and Device to an Execution Environment.
- Revoking a Device closes and invalidates its Sessions and WebSocket tickets.
- Project membership and authority are checked live rather than embedded permanently in long-lived tokens.
- Existing environment bootstrap and maintainer credentials remain a separate administration plane.

### Membership lifecycle

A Project Invitation moves through `created -> accepted` or `expired/revoked`.

- Invitation secrets are hashed at rest, bounded, one-use, and absent from logs.
- Acceptance requires an authenticated Person and is atomic.
- Acceptance creates one active Project membership; reinvitation is idempotent or an explicit conflict.
- Invitation revocation blocks future acceptance but does not remove an accepted Member.
- Membership removal immediately blocks new Project actions and streams.
- A Project has exactly one Owner; transfer is atomic and cannot leave it ownerless.
- Anonymous guests and public magic links are not supported initially.

### Baseline authority

Project roles remain only Owner and Member. Consequence Grants handle exceptional actions.

| Action                                                  | Default authority                   |
| ------------------------------------------------------- | ----------------------------------- |
| Discover Threads, read timeline and evidence            | Member                              |
| Send ordinary messages and use approved provider policy | Member                              |
| Resolve ordinary approvals within policy                | Member                              |
| Read/write bounded Project files and local Git work     | Member                              |
| Create or control a terminal                            | Owner or explicit Consequence Grant |
| Change provider configuration or secrets                | Owner                               |
| Escalate provider to full host access                   | Owner confirmation                  |
| Push, publish, mutate external reviews or repositories  | Explicit grant; Owner default       |
| Deploy or change production                             | Owner plus explicit confirmation    |
| Restore destructively or force Git/worktree recovery    | Owner                               |
| Invite/remove Members or transfer ownership             | Owner                               |
| Change environment access, relay, or server updates     | Environment maintainer              |

Members never receive raw provider secrets. Member-triggered turns use an owner-approved Project provider policy rather than inheriting unrestricted host access.

### Resource enforcement

Every collaborative operation must resolve server-side through:

`Person -> active membership -> Project -> Thread/resource -> required authority`.

Client-provided paths, working directories, project/thread IDs, GitHub identity, relay identity, or token labels never authorize access by themselves.

- Filesystem paths and terminals remain beneath the authorized Project/worktree after resolving symlinks.
- Terminal environment input is allowlisted and terminal write control uses one explicit writer lease at a time.
- Assets are purpose-bound, Project-scoped, short-lived signed capabilities; sensitive assets revalidate membership or a revocation generation.
- Subscriptions and snapshots are filtered by live membership.
- Authorization is rechecked when intent is accepted and when a consequential side effect is dispatched.

### Revocation

Removing a Member closes their streams, terminal control, and ability to send further input immediately. An already-running provider turn may quiesce as a System actor; the Owner receives an explicit stop-and-rotate path for a security incident. Croki does not pretend it can roll back external effects already performed.

### Audit

A separate append-only security audit records actor, device, session, Project/resource, action, authority, outcome, timestamp, and causation for membership, provider configuration, secret lifecycle, terminals, file mutations, external Git, deployment, relay, revocation, and denials.

It never records tokens, secret values, raw prompts, source code, arbitrary terminal output, or unredacted environment variables.

## Runtime and concurrency

### Canonical authority

One Execution Environment server owns orchestration events, provider sessions, repositories, worktrees, terminals, Git, checkpoints, and evidence. Relay routes, SSH descriptors, repository URLs, and clients are access metadata—not alternate authorities. Two Croki servers may not mutate one state directory.

### Commands and effects

- Each client command carries a stable command ID and actor context.
- Per-Thread command acceptance is ordered, idempotent, and guarded by expected lane/turn/workspace revisions where relevant.
- Accepted intent is persisted before provider, terminal, Git, or external dispatch.
- Delivery becomes acknowledged, failed, stale, rejected, or unconfirmed.
- Unknown consequential outcomes are not retried blindly.
- A durable command inbox, side-effect outbox, and provider event journal become the recovery sources; process-local PubSub remains only a fast path.

Provider events carry enough identity to reject duplicates and late epochs: environment, provider instance/session, session epoch, Thread, Attempt, provider turn/item/request, event ID, and provider sequence when available.

### Busy-lane sequencing

- Only one primary turn-start intent can be accepted while idle.
- Ordinary Thread messages while running enter the next-turn FIFO.
- Live Guidance targets the exact active turn and gets its own delivery lifecycle.
- Person-addressed messages produce no provider effect.
- A stale interrupt cannot target a newer turn.
- Approval and user-input resolution use compare-and-set; one response wins.

### Restore and recovery

Restore is a durable saga, not an instant optimistic state change.

- It requires exclusive provider-lane, workspace, terminal, and process leases.
- Croki captures a pre-restore snapshot first.
- Historical checkpoints remain immutable.
- A restore creates a successor Attempt/workspace revision inside the same Thread rather than rewriting history.
- Filesystem and provider-conversation results are recorded independently.
- Partial restore stops further lane work and exposes recovery; it never reports atomic success.

### Offline and reconnect

The environment remains canonical while clients cache read models and sequence cursors.

- Reconnect replays durable events after the last applied sequence and reconciles command receipts.
- Cached content remains readable when the environment is unavailable.
- Explicitly queued ordinary Thread messages may remain in a client outbox and send once the live Thread is safe to mutate.
- Live Guidance, approvals, interrupts, restore, publication, deployment, permission changes, and other consequential actions never queue silently offline.
- Unknown commands are reconciled by command ID rather than replayed blindly.
- A surviving server may continue provider work with all clients disconnected; full process survival remains provider-specific and is reported honestly.

## Client contract

Web, desktop, and mobile share the same Project, Thread, Worker, Person, Addressing, ordering, approval, Current Reality, Turn Result, attention, and recovery semantics.

- Desktop and web carry the full Thread experience and supported contextual surfaces.
- Desktop may provide richer local Preview, terminal, and renderer recovery.
- Mobile can enter and direct the same Thread, resolve authorized judgment, inspect Worker Threads, Diff, Review, files, and checked screens, and recover through its explicit outbox.
- Mobile does not claim interactive live Preview until it truly supports it.
- Device navigation and presentation may differ; domain meaning may not.

## Failure states

Croki distinguishes:

- provider/session failure;
- environment offline, authentication failure, or version skew;
- command, terminal, Preview, Git, or external-action failure;
- approval decline;
- user Stop or interruption;
- Worker Thread failure;
- guidance delivery failure or unconfirmed delivery;
- stale command or already-resolved judgment;
- partial restore; and
- revoked membership or authority denial.

Each state keeps the nearest trustworthy work visible and offers the specific recovery action. Croki never auto-resends ambiguous provider input, combines transcript and filesystem undo, silently switches providers, or calls an unknown outcome successful.

## Competitive boundary

Current primary-source research on 2026-08-16 found real adjacent products:

| Product                                                            | Demonstrated strength                                                                                       | Remaining Croki opportunity                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Conductor](https://www.conductor.build/docs/cloud/collaboration)  | Named presence, shared live chat, follow/reassign, cloud agents, branches, tests, and PR evidence           | Provider-neutral/local-first execution and a stronger canonical evidence/authority model |
| [Superconductor](https://www.superconductor.com/docs/quick-start)  | Shared sessions, takeover language, isolated competing implementations, previews, artifacts, review, and QA | Clearly specified same-Thread human concurrency and local/provider choice                |
| [Coshell](https://coshell.ai/product)                              | Literal same-session prompting, presence/follow, redirect/handoff, shared files/terminal/browser            | Durable branch/Attempt/evidence lineage and provider breadth                             |
| [AQ](https://aq.dev/docs/)                                         | Shared cloud workspace, persistent CLIs, task worktrees, Preview comments and PR integration                | Proven named same-session behavior and canonical catch-up/authority semantics            |
| [Devin](https://docs.devin.ai/work-with-devin/devin-session-tools) | Shared sessions, live shell/IDE/browser observation, pause/takeover, isolated VMs                           | Proven simultaneous human prompting and native team presence                             |

Near-misses include Replit's separate per-human Agent Threads, GitHub Copilot sessions that only the owner can steer, VS Code Agent Host's multi-client protocol without a demonstrated team product, Claude Code Agent Teams for one human, and shared agent-definition editors rather than shared work.

Croki is not entering an empty category. Its defensible product thesis is the coherent combination of:

- literal shared human-agent work;
- one understandable canonical Thread;
- durable Worker Thread and Attempt lineage;
- source-grounded evidence and recovery;
- consequence-aware human authority;
- multiple native provider choices; and
- owner-hosted execution that can later move behind the same environment boundary.

## Validation and rollout

### P0: internal proof

- Three venture-separated Projects under Jacob's control.
- Two to four people per Project.
- Three real Mid-work Entry episodes per Project.
- Codex is the primary Live Guidance provider; Claude verifies honest provider-difference behavior before external pilot.
- At least one collaborator joins from another device or network.
- Desktop/web are primary; mobile must at least inspect, message, and resolve supported judgment truthfully.
- Owner-hosted environment, direct/private network, SSH, or tailnet.
- Concierge support, no SLA, no public signup, no cloud promise.

P0 wins only when:

- at least eight of nine episodes produce a useful intervention without a private briefing;
- all three Projects complete at least two episodes;
- median entry-to-useful-action is at most five minutes and P90 at most ten;
- at least two Projects repeat during the final study week without Jacob co-present;
- at least 80% of participants correctly identify outcome, current work, unresolved judgment, and evidence;
- refresh, reconnect, restart, revoke, provider failure, and stale-approval scripts recover correctly;
- no unrecoverable Thread/message loss or unauthorized cross-Project access occurs.

If only one Project produces value, teammates only arrive for final review, or collaboration still requires a private recap, stop the multiplayer expansion rather than building infrastructure around weak behavior.

### P1: invite-only external pilot

Only after P0 passes:

- five two-to-four-person software Product Teams;
- existing repositories and bring-your-own provider accounts;
- Croki-owned release artifacts and exact versioning;
- Project-scoped authority, durable delivery truth, revocation, audit, and documented recovery;
- no enterprise compliance, managed hosting, provider resale, or uptime commitment.

P1 continues when at least four of five teams complete three episodes, at least twelve of fifteen episodes produce useful intervention, three teams repeat in the final week, support falls below one hour per team per week after onboarding, and no critical data-integrity or authority incident occurs.

### P2: managed relay

Build a Croki-managed relay only after at least three retained teams encounter direct-network pain weekly and request a managed path.

The relay owns identity-assisted transport, endpoint discovery, short-lived credentials, and operational metadata. It does not store provider keys, prompts, transcripts, repository files, terminal output, or raw product evidence, and it never mints Project membership by itself. Owner-local execution continues during a relay outage.

### P3: managed persistent environments

Managed cloud execution is a separate product and operational decision requiring:

- retained owner-hosted or relay usage;
- at least three paid commitments or equivalent design-partner commitments;
- explicit willingness to pay for availability;
- persistent isolated compute and encrypted volumes;
- secret brokerage, backup/restore, deletion/export, incident response, tenant isolation, metering, billing, support, privacy, and legal readiness; and
- an explicit provider-account model, initially bring-your-own key.

Ephemeral CI jobs and browser-to-browser peer execution are not the canonical runtime.

## Provider and commercial boundary

- The Execution Environment owns configured Provider Instances.
- Provider credentials and subscription costs remain with the environment owner.
- Members receive Project authority, not provider secrets.
- Croki does not pool quotas, resell tokens, silently switch providers, or call provider-reported usage a Croki invoice.
- No pricing decision is required for P0 or P1.
- If managed transport or hosting proves valuable, a Project/team subscription with provider cost separate is the clean initial hypothesis; per-seat and per-token pricing require evidence.

## Instrumentation and privacy

Pilot instrumentation is factual, content-free, and opt-in where it leaves the environment.

Useful events include invitation acceptance/revocation, Thread entry, Current Reality viewing, intervention sent/acknowledged, result observed, connection recovery, authority denial, provider readiness changes, and support cases.

Export only pseudonymous IDs, platform/version, provider kind, connection target, factual state, and timestamps. Never export prompts, assistant text, code, repository paths, raw transcripts, terminal output, secrets, or private evidence.

Early useful interventions require lightweight human confirmation; telemetry cannot infer value by itself.

## Release and support boundary

Private proof may use explicitly labelled internal artifacts. Any external pilot needs Croki-owned artifacts, exact version reporting, a documented support path, and claims restricted to enabled Croki-owned destinations.

Before public release, reconcile marketing, downloads, mobile, hosted web, relay, package, signing, legal, and update claims with one Croki-owned release manifest. Inherited or disabled T3 destinations cannot be presented as Croki availability.

In owner-hosted stages:

- the customer owns machine uptime, network, repository backup, and provider subscription/authentication;
- Croki owns its persistence, Project authorization, runtime behavior, and truthful recovery claims; and
- support diagnostics never require raw transcripts, code, secrets, or unredacted traces.

## Acceptance criteria

The first trustworthy multiplayer release is acceptable only when:

- the Owner can invite a Person once and that Member can discover every Project Thread;
- solo Croki retains today's core experience without persistent multiplayer chrome;
- every message has author and Addressing;
- one Thread never has competing primary provider turns or checkpoints;
- running ordinary direction queues while explicit native Live Guidance reports durable delivery truth;
- Mid-work Entry exposes source-grounded Current Reality without a second status model;
- relevant Presence and typing appear and expire without persistence;
- Preview/Diff following is explicit, local, interruptible, and capability-honest;
- Worker Threads are durable/read-only and concurrently writing workers are isolated;
- approvals and user-input races are first-writer-wins and visibly idempotent;
- one factual Turn Result links to evidence and missing evidence;
- reconnect and offline behavior preserve cached work, drafts, order, and command identity without ambiguous replay;
- revoked Members lose streams and control immediately;
- files, terminals, assets, provider use, Git, and deployment remain inside server-derived Project authority;
- restore preserves history and exposes partial recovery;
- web, desktop, and mobile agree on domain state even where local capabilities differ; and
- every failure state offers a truthful, source-specific recovery path.

## Non-goals

- A separate Room, chat, channel, comments layer, dashboard, inbox, task board, or organization administration product.
- Private Threads, Thread-specific roles, anonymous guests, or public share links.
- Simultaneous independent primary agents inside one Thread.
- A Croki-authored agent harness, planner, scheduler, delegation policy, retry strategy, correctness judge, or hidden project context.
- Provider-neutral simulated steering.
- Collaborative text/code editing, CRDTs, remote cursor control, or automatic Preview following.
- Silent offline guidance, approval, interruption, deployment, restore, or permission changes.
- Active-active environment servers, peer-to-peer execution, or automatic cross-environment merge.
- Croki-owned inference billing, pooled provider quotas, or token resale in the proof stages.
- Managed cloud execution, enterprise SSO/compliance, regulated workloads, or uptime SLA before explicit gates pass.
- Deals, legal matters, campaigns, incidents, GTM systems, or generic autonomous workflows before the software Mid-work Entry loop repeatedly wins.

## Expansion gate

Software is the proving ground, not an accidental permanent ceiling. Expansion begins only after teams repeatedly inhabit the same consequential autonomous work and the shared model—not merely the repository tooling—causes the value.

Any later domain must supply its own authoritative objects, execution adapters, evidence, authority, recovery, and final-state semantics. Croki will not generalize by renaming repository concepts or creating a generic workflow engine.

## Implementation sequence after confirmation

1. Add Person, Device, authorship, Addressing, and relevant Presence to trusted local multiplayer.
2. Make the Canonical Provider Lane safe under concurrent human messages, guidance, approvals, interrupts, reconnect, and command retries.
3. Add deterministic Current Reality, factual Turn Result, Worker Attempt lineage, and isolated worker worktrees.
4. Add Project Invitations, membership, server-derived resource authorization, Consequence Grants, revocation, asset protection, and audit.
5. Complete the real web/desktop/mobile Mid-work Entry journey and recovery states.
6. Run P0 against three real Projects and promote, revise, or kill the direction from observed behavior.
7. Prepare an external pilot only if P0 passes and Jacob separately authorizes the support, release, privacy, and external-user obligations.

Implementation must not begin from this document until Jacob confirms that it represents the shared understanding reached through the grilling session.
