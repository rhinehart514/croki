# Croki product design

Croki is for people directing serious software work across long-running Threads. It keeps the canonical conversation, the work happening around it, and the evidence needed to judge the result in one dense workspace.

The developer experience is a normal repository that has gained product awareness, not another framework. Files, Git, Threads, worktrees, terminals, Preview, Review, and PRs remain the work. Croki derives useful context from those sources without asking the founder to maintain a second product model.

## Product nouns and behavior

- A **Thread** is the canonical conversation and unit of work.
- Explicitly delegated parallel work creates durable **worker Threads** beneath the parent Thread. Worker Threads have their own transcript and lifecycle, survive reloads, and never become competing canonical conversations.
- The left rail nests worker Threads directly beneath their parent. Selecting a worker opens its read-only transcript; **Continue in parent** returns to the canonical Thread.
- After a parent has real worker Threads, **Workers** lets the founder choose one durable presentation: **Separate chats** nests those transcripts, while **In Thread** hides the child rows and shows bounded Workstreams at their spawn point. Croki never renders both full representations or copies worker messages into the parent.
- Ordinary work must not expose worker or orchestration chrome when no delegation exists.
- **UI history** is the durable record of screens Croki's models actually checked in Preview. It belongs to the originating Thread, preserves the observed image and bounded page evidence, and remains read-only. Its images follow normal Thread fork, revert, and deletion ownership. The founder sees **checked screens** and, later, **checked flows**; Croki does not expose a perception graph, authored state database, or design mode.
- A turn that changes likely user-visible files ends with at most one inline UI-check receipt. Same-turn snapshots collapse into **Checked _n_ screens** and open as one gallery; visible changes with no rendered evidence say **Not checked**. Nonvisual turns add no receipt. Checked means Croki preserved at least one screen the model inspected during that turn, not that every state, flow, breakpoint, or production condition passed.
- **Product** is the only active ideation behavior. It treats product, customer, market, positioning, and release direction as one reality; historical Venture and split GTM behavior IDs remain readable but are not offered for new turns.
- **Concurrent work awareness** is a bounded, source-labelled snapshot of other Threads in the same project. Before a provider turn, Croki may supply Thread identity, state, branch, latest checkpoint files, and exact file overlap. It never copies sibling transcripts or presents observed work as founder-approved direction.
- **Application awareness** is a bounded read of the invoking Thread's repository, checkpoint/files, source-attributed project evidence, and checked screens. The selected native model interprets user responsibility and product continuity.
- The **application brief** at `.croki/application.croki` is the single repository-owned statement of application identity, released reality, and current build intent. Croki reads it automatically as bounded, founder-approved direction for project Threads. It is edited through ordinary files, Git, and Review, never a setup form or parallel product database.
- Historical `.croki/application.json`, Concept, Release, and Venture schemas remain readable compatibility input. They do not create workspace navigation or dedicated product objects.
- Native Codex voice lives beside the Thread composer only for Codex Threads. Spoken turns act directly in the native realtime session; they do not populate the unsent draft. Croki exposes honest connecting, listening, stopping, and typing-fallback states without relaying or persisting raw audio.
- Croki's experimental native iOS client installs beside the React Native mobile app and uses the same server contracts. It has Croki-owned bundle, deep-link, storage, and App Group identities; inherited T3 destinations are never release defaults.

## Interface direction

- Preserve the existing true-black, dense workspace with white primary text.
- Mobile is a full-parity Croki client. Its navigation and controls may be
  native to iOS and Android, but founders must be able to direct, inspect,
  intervene in, and resume the same project and Thread work as desktop.
- Status belongs beside the work it describes. Avoid decorative pills and explanatory chrome.
- When an application brief exists, the Thread header shows one compact released-to-building focus beside the project. Opening it reveals the application promise and current intent, with one action to open `.croki/application.croki`. It does not show setup, progress, scores, or Concept scope.
- Opening a `.croki` file uses the ordinary file editor and ordinary panel size. Croki does not generate a second visual representation of repository metadata.
- Worker nesting uses indentation and a quiet rule, not a second navigation section or dashboard.
- The Workers choice lives in the Thread header only after delegation. **Separate chats** is never offered for inferred activity without real child Threads.
- Long titles truncate in the rail and remain available in the Thread view. Keyboard focus and status labels remain explicit.
- **Search** is one cross-environment entry point for Thread titles and canonical conversation content. Parent matches identify **You** or **Agent**; worker matches identify **Assignment** or **Worker**. Checked-screen/UI-history activity is evidence, not searchable conversation content.
- Pinning, title regeneration, settle, and snooze are lifecycle controls for canonical parent Threads only. Worker Threads remain nested beneath their parent and follow the parent lifecycle. Web and mobile expose the same parent-Thread navigation actions when the connected server supports them.
- Version-skew guidance is directional. An older server may offer its advertised server-update path; an older client tells the founder to update Croki on that device and never offers a server rollback. When an OTA cannot cross the installed native runtime, recovery points to the device's native build channel instead of repeating the same update check.
- After a recoverable desktop renderer crash, Croki reopens the last verified same-origin screen and waits for the server connection before showing one recovery receipt. The receipt distinguishes server-owned agent and terminal work that stayed attached, saved drafts that remain available, and browser-only state that reset. It never implies that provider processes, PTYs, or other runtime work survive a full Croki process exit.
- GitHub-only desktop releases update their bundled server with the desktop app. When no exact `croki-server` package was published, they describe remote version skew without offering remote update buttons or package commands that cannot succeed.
- UI history stays inside Preview and Review evidence. Its completion receipt sits directly after the answer, survives folded turn internals, and replaces duplicate raw snapshot rows. It must not become a dashboard or compete with the live result.
- Preview has one job: open, inspect, and capture the running product. Product creation and alternatives stay in the canonical Thread instead of creating App, Component, and Idea modes inside Preview.
- Application direction is visible through the compact header focus, its ordinary source file, and the model's source-grounded answer. Croki does not add a setup workflow, alignment score, progress model, or Croki-authored verdict.

## Stack

React, TypeScript, TanStack Router, Effect Atom state, Base UI primitives, Tailwind CSS, Lucide icons, React Native for the cross-platform mobile client, and SwiftUI for the experimental native iOS client. Existing sidebar, timeline, and typography tokens are the source of truth.
