# Croki product design

Croki is for people directing serious software work across long-running Threads. It keeps the canonical conversation, the work happening around it, and the evidence needed to judge the result in one dense workspace.

The developer experience is a normal repository that has gained product awareness, not another framework. Files, Git, Threads, worktrees, terminals, Preview, Review, and PRs remain the work. Croki derives useful founder-facing awareness from those sources without asking the founder to maintain a second product model or silently sending that awareness to a provider.

Croki is a harness host, not a harness. A fresh Thread uses the selected
provider's native behavior and native project configuration. Croki adds no
persona, task strategy, workflow, delegation policy, or hidden application,
sibling-Thread, progress, or project context by default. Codex retains T3
Code's thin host contract for collaboration-mode semantics, tool availability,
product-native Preview routing, and honest runtime identity. That stable host
contract explains the environment; it must never direct the substance or
sequence of the user's work. Any task-specific instruction or context Croki
applies is chosen by the user, visible before sending, scoped, recorded with
the turn, removable, and reversible.

## Product nouns and behavior

- A **Thread** is the canonical conversation and unit of work.
- A **View** is an automatic, source-grounded visual representation placed directly after the relevant user message when bounded project perception contains structure that linear text hides. Croki chooses comparison, causal, temporal, evidence, experience, system, counterfactual, or possible-world structure without a mode or destination. A View is ephemeral and locally interactive; only explicit **Use in next message** returns selected source IDs to the native composer. Historical Canvas identifiers remain readable but are not choices or navigation for new work.
- **Edit from here** creates a successor Thread immediately before the selected
  completed user message, then reopens that message's authored text and
  supported image attachments in the new composer. The original Thread and
  filesystem remain unchanged. Providers that cannot prove a native fork at
  that exact boundary show the action as unavailable rather than simulating it.
- Explicitly delegated parallel work creates durable **worker Threads** beneath the parent Thread. Worker Threads have their own transcript and lifecycle, survive reloads, and never become competing canonical conversations.
- The left rail nests worker Threads directly beneath their parent. Selecting a worker opens its read-only transcript; **Continue in parent** returns to the canonical Thread.
- After a parent has real worker Threads, **Workers** lets the founder choose one durable presentation: **Separate chats** nests those transcripts, while **In Thread** hides the child rows and shows bounded Workstreams at their spawn point. Croki never renders both full representations or copies worker messages into the parent.
- Ordinary work must not expose worker or orchestration chrome when no delegation exists.
- **UI history** is the durable record of screens Croki's models actually checked in Preview. It belongs to the originating Thread, preserves the observed image and bounded page evidence, and remains read-only. Its images follow normal Thread fork, revert, and deletion ownership. The founder sees **checked screens** and, later, **checked flows**; Croki does not expose a perception graph, authored state database, or design mode.
- A turn that changes likely user-visible files ends with at most one inline UI-check receipt. Same-turn snapshots collapse into **Checked _n_ screens** and open as one gallery; visible changes with no rendered evidence say **Not checked**. Nonvisual turns add no receipt. Checked means Croki preserved at least one screen the model inspected during that turn, not that every state, flow, breakpoint, or production condition passed.
- **Applied to this turn** is the visible record of user-selected instructions,
  context attachments, skills, and Croki-added tool access. Each item retains
  its source and scope, can be removed before sending, and remains inspectable
  on the sent turn. It describes only what Croki applied and never claims to
  reveal provider-owned system instructions.
- Provider runtime, instructions, context, tools, and senses are distinct.
  Enabling a tool changes tool availability only; it does not add a Croki tool
  policy or task strategy. The fixed Codex host contract may explain how to
  reach product-native Preview tools; opening Preview, a project, or an
  application brief never applies task context to the model.
- Persistent model configuration uses provider- or repository-native mechanisms
  such as `AGENTS.md`, skills, plugins, MCP configuration, and provider-owned
  project instructions. Croki may make these easy to discover, inspect, install,
  enable, and invoke; it does not simulate persistence by silently repeating a
  proprietary prompt on every turn.
- Product, GTM, Venture, Parallel Threads, and all former Croki behavior IDs are
  legacy compatibility data only. Historical turns remain readable, but these
  behaviors are not offered or executable for new turns.
- Concurrent work and application awareness remain founder-facing projections.
  Croki may show source-labelled Thread, checkpoint, file, progress, and project
  evidence in its UI, but it never sends those projections to a provider unless
  the user visibly attaches the specific context.
- The **application brief** at `.croki/application.croki` is the repository-owned
  statement of application identity, released reality, and current build intent.
  Croki may display and edit it through ordinary files, Git, and Review. Its
  existence never adds it to a provider turn; the founder may attach it for one
  turn or reference it from provider-native project instructions.
- Historical `.croki/application.json`, Concept, Release, and Venture schemas remain readable compatibility input. They do not create workspace navigation or dedicated product objects.
- A running Codex Thread keeps its composer available for native turn guidance. Guidance is attached to the exact active turn and reports **Delivering guidance**, **Guidance delivered**, **Guidance not delivered**, or **Guidance delivery unconfirmed** beside the sent message. Providers without native steering keep the text as an editable draft and expose no simulated send path.
- Native Codex voice lives beside the Thread composer only for Codex Threads. Spoken turns act directly in the native realtime session; they do not populate the unsent draft. Croki exposes honest connecting, listening, stopping, and typing-fallback states without relaying or persisting raw audio.
- Croki's experimental native iOS client installs beside the React Native mobile app and uses the same server contracts. It has Croki-owned bundle, deep-link, storage, and App Group identities; inherited T3 destinations are never release defaults.

## Interface direction

- Preserve the existing true-black, dense workspace with white primary text.
- Mobile is a full-parity Croki client. Its navigation and controls may be
  native to iOS and Android, but founders must be able to direct, inspect,
  intervene in, and resume the same project and Thread work as desktop.
- Status belongs beside the work it describes. Avoid decorative pills and explanatory chrome.
- Thread navigation says **Needs Approval**, **Needs Input**, or names a fresh terminal failure when the founder must act. Project navigation may summarize those unresolved states as **_n_ need you**. Ordinary completion is never included in that count, and a visited failure stops raising its hand.
- Activating a Thread that needs the founder opens the existing Thread view at the unresolved approval, question, or failure. Attention routing does not create an inbox, dashboard, or duplicate task surface.
- When an application brief exists, the Thread header shows one compact released-to-building focus beside the project. Opening it reveals the application promise and current intent, with one action to open `.croki/application.croki`. It does not show setup, progress, scores, or Concept scope.
- Opening a `.croki` file uses the ordinary file editor and ordinary panel size. Croki does not generate a second visual representation of repository metadata.
- Views are part of the Thread, not a separate workspace. A qualifying View appears inline without stealing focus; a non-qualifying turn adds nothing. It never becomes project truth, executes work, or changes the selected provider. Every important statement exposes whether it is observed, attributed, derived, inferred, hypothetical, contradicted, or uncovered. Framing and omissions remain inspectable through **Basis**.
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
- Application direction is visible through the compact header focus and its
  ordinary source file. A model answer is application-grounded only when the
  founder attached that source or configured it through a provider-native
  mechanism. Croki does not add a setup workflow, alignment score, progress
  model, hidden context, or Croki-authored verdict.
- Do not create a Canvas destination, manually maintained visual scene, or second product workspace for Views.

## Stack

React, TypeScript, TanStack Router, Effect Atom state, Base UI primitives, Tailwind CSS, Lucide icons, React Native for the cross-platform mobile client, and SwiftUI for the experimental native iOS client. Existing sidebar, timeline, and typography tokens are the source of truth.
