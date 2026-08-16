# Croki

Croki is the multiplayer development environment in which small product teams and their agents share consequential software work from direction through verified result.

## Language

**Multiplayer ADE**:
A development environment where a product team and its agents inhabit the same durable work, can enter while it is underway, and share direction, judgment, evidence, and results.
_Avoid_: Team IDE, agent orchestration platform, shared AI chat

**Product Team**:
A small group spanning the product, design, and engineering judgment required to take software from an intended outcome to a verified result.
_Avoid_: Users, seats, engineering department

**Mid-work Entry**:
The defining multiplayer event in which a teammate enters autonomous work already underway, understands its current reality without a private briefing, and makes a useful intervention.
_Avoid_: Handoff meeting, status update, transcript sharing

**Project**:
The collaboration boundary for one software product, establishing which product team shares its work.
_Avoid_: Room, organization, team mode

**Thread**:
The canonical shared work object for one intended outcome, containing the human direction, autonomous work, unresolved judgment, evidence, and result needed to understand and continue it.
_Avoid_: Chat, task, room, session

**Canonical Provider Lane**:
The single primary agent conversation that carries a Thread forward while delegated work remains attributable through Worker Threads.
_Avoid_: Main chat, controller agent, agent swarm

**Worker Thread**:
A durable child of a Thread that preserves one delegated agent conversation or attempt without creating a competing canonical account of the work.
_Avoid_: Subtask, hidden agent, participant

**Current Reality**:
A source-grounded compression of a Thread's outcome, active work, attempts, unresolved judgment, evidence, and final state, derived without a separately maintained status model.
_Avoid_: Status report, agent memory, project board

**Project Member**:
A person admitted to a Project who can discover its Threads and contribute to their shared work within consequence-specific authority boundaries.
_Avoid_: Seat, collaborator role, repository collaborator

**Project Owner**:
The Project Member responsible for membership and the consequential authority attached to the Project's execution environment.
_Avoid_: Administrator, controller, team lead

**Addressing**:
The indication of which participant should act on a Thread message; it changes who acts without moving the message outside the canonical Thread timeline.
_Avoid_: Channel, private comment, control mode

**Project Invitation**:
A revocable grant through which a person becomes a Project Member once, after which the Project's Threads are directly available without additional invitations.
_Avoid_: Thread share, public link, repository permission

**Person**:
A durable human identity whose Project membership, authorship, authority, and history remain consistent across revocable device sessions.
_Avoid_: User, device, session, account seat

**Device**:
A registered Croki installation or browser identity belonging to a Person whose access can be revoked independently.
_Avoid_: Person, Member, seat

**Session**:
One authenticated connection from a Device into an Execution Environment.
_Avoid_: Person, Device, Project membership

**External Identity**:
A verified identity from GitHub or another provider that may authenticate or describe a Person without owning Croki membership or authority.
_Avoid_: Croki Person, Project Member, permission source

**Execution Environment**:
The single authoritative place where a Project's provider processes, repository, worktrees, terminals, checkpoints, and durable Croki state run.
_Avoid_: Client, peer, workspace copy

**Provider Instance**:
A configured provider connection available to a Project through its Execution Environment rather than through an individual Project Member's client.
_Avoid_: Personal agent, member model account, Croki agent

**Presence**:
Ephemeral evidence that another Person is currently viewing or acting in the same relevant Project, Thread, Preview, or Diff surface.
_Avoid_: Online status, member roster, activity log

**Live Guidance**:
An explicitly agent-addressed message offered to the exact running canonical turn through a provider's native steering behavior.
_Avoid_: Follow-up turn, hidden prompt, provider-neutral steer

**Attempt**:
One execution of the same assigned work, preserving retries, interruption, failure, and recovery without erasing earlier outcomes.
_Avoid_: Worker Thread, version, run dashboard

**Workstream**:
Bounded provider-native agent activity that is visible within a Thread but does not have a durable child conversation of its own.
_Avoid_: Worker Thread, hidden agent, task

**Turn Result**:
The single factual projection of environment and Git evidence shown after a provider turn settles, including what remains unverified.
_Avoid_: Completion verdict, agent summary, score

**Consequence Grant**:
Explicit Project authority for an action whose risk exceeds ordinary Member collaboration, such as terminal control, publication, deployment, or destructive recovery.
_Avoid_: Role, admin mode, permission level
