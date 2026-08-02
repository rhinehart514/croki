# Current project state

Last audited: 2026-08-02
Code baseline: Croki 0.4.2 release candidate on `croki/main`

Croki is Jacob's current ADE and daily development environment. The product is
a narrow Croki overlay on Croki rather than a second agent runtime.

The 0.4.2 source candidate is prepared but is not tagged or published. See the
[0.4.2 release notes](./release-notes-0.4.2.md) and [release ownership
contract](../operations/release.md) for the remaining external gates.

## Working product

Croki currently provides:

- durable projects, threads, messages, activities, and checkpoints;
- native project and worktree execution with Git diff, restore, commit, push,
  and pull-request paths;
- terminal, files, preview, plans, approvals, project scripts, and recovery;
- web, Electron desktop, and mobile clients;
- multiple configured instances of Codex, Claude, Cursor, Grok Build,
  OpenCode, and OpenClaw;
- OpenClaw instances can connect to any agent already configured in the user's
  Gateway. Croki stores the selected agent identity and preserves that agent's
  workspace, memory, skills, model, tools, and delegation settings; it does not
  provision or replace an agent.
- local and remote environment connection paths, including desktop-managed SSH
  and Croki Connect compatibility infrastructure;
- Croki branding and completion feedback;
- repository-owned Canvas context at `.croki/context.json`.

Provider support means that an adapter and product surface exist. A provider is
ready only when its required local CLI, authentication, model access, and
supporting process are available. OpenClaw additionally requires a running
Gateway and configured agent.

## Canvas

Croki 0.4.2 introduces Release Canvas as the default Canvas view. It shows one
project-owned next-release candidate with proposed, working, candidate,
blocked, verified, and deferred items. Each item can link native source Threads,
state an outcome, declare acceptance criteria, and attach portable evidence.
Verification is valid only when every criterion passes.

The Thread remains the work and evidence spine. Release Canvas is the spatial
view of scope and readiness, not a conversation, provider, workflow runtime,
scheduler, memory database, Review system, or worktree system. Coordination
Workstreams remain compact Thread-native runtime activity.

The secondary Context view retains repository-owned product truth. Version 1
stores `intent`, `decision`, `evidence`, and `work` nodes with `current`,
`provisional`, and `retired` authority states. Existing file, diff, and preview
evidence capture lands there. Product and GTM harnesses may also create bounded
immutable visual artifacts, but those remain Thread-scoped presentations and
never become release state or canon.

Approved `current` context and a bounded projection of the active release are
attached to every project turn whether or not Canvas is open. Proposals and
deferred release items are excluded by default. The composer and content-free
turn receipt expose the active release version without leaking Canvas bodies.
Large releases are summarized; malformed release data can be omitted without
discarding valid canon or blocking the provider turn.

See the [Release Canvas specification](./release-canvas-spec.md) for the selected
0.4.2 boundary.

## Selected native-provider rule

The default Croki experience must preserve each provider's native behavior.
Croki-specific personas, planning loops, delegation policies, tool policies,
and behavioral prompts belong only to explicit named harnesses. Harnesses are
off by default, visible, scoped to a turn or thread, reversible, and unable to
silently modify founder-approved Canvas truth.

Runtime, context, tools, and harnesses are separate:

- the provider runtime performs the work;
- context supplies visible facts and constraints;
- tools expose actions;
- a harness deliberately changes how an agent approaches a task.

Canvas is context and visualization, not a harness. The web composer now ships
three one-turn behaviors: `Native`, the default, `Product`, and `GTM v1`.
Native adds no Croki behavior prompt. Product adds bounded product judgment with
optional Canvas presentation. GTM v1 adds one bounded strategy instruction.
Product and GTM reset to Native after a successful send. All three use the same
provider runtime, Thread, permissions, tools, and approved Canvas context.
OpenClaw follows the same rule: Croki passes prompts through ACP without a
persona, delegation policy, model requirement, or forced reasoning mode. The
selected OpenClaw agent remains user-owned and native; Croki never asks it to
use a Croki-owned workspace, memory, skills, or model.

## Known implementation gaps

- Release Canvas editing and the new behavior selector are web-only. Mobile
  does not yet expose the full candidate board or named harness selection.
- Turn setup inspection currently covers behavior, Canvas application,
  approved/proposed counts, capability, and snapshot identity. Provider/model
  and access controls remain visible in their existing native surfaces.
- Production releases, Croki CLI publication, Croki-owned relay and web
  destinations, signing, and mobile production deployment remain disabled by
  ownership guards.
- Remote self-update and copied CLI launch commands still target the inherited
  `croki-server@<version>` npm package. They are not Croki release paths until the CLI is
  renamed and published under Croki ownership.
- Several deep subsystem documents originated upstream. Compatibility names are
  intentional, but any instructions that publish to inherited T3 destinations
  are reference material rather than active Croki operations.

## Repository and release contract

- `main` mirrors `upstream/main`.
- `croki/main` carries the Croki overlay and is the active product branch.
- Production release jobs fail closed until Croki owns the repository, release
  branch, CLI package, relay domain, web domains, Vercel project, signing
  credentials, and any enabled mobile destinations.
- Pushes to `croki/main` can build an unsigned Windows x64 installer artifact.
  That artifact is not a production update channel.

## Verification

Run the Croki boundary after Croki changes:

```sh
npm run check:croki
```

Run focused tests for each touched owner. Before syncing upstream, report the
overlay against the exact reviewed upstream commit:

```sh
npm run report:croki-overlay -- --base <known-upstream-sha>
```
