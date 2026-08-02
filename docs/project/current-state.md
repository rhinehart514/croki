# Current project state

Last audited: 2026-08-02
Code baseline: Croki 0.4.1 on `croki/main`

Croki is Jacob's current ADE and daily development environment. The product is
a narrow Croki overlay on T3 Code rather than a second agent runtime.

## Working product

Croki currently provides:

- durable projects, threads, messages, activities, and checkpoints;
- native project and worktree execution with Git diff, restore, commit, push,
  and pull-request paths;
- terminal, files, preview, plans, approvals, project scripts, and recovery;
- web, Electron desktop, and mobile clients;
- multiple configured instances of Codex, Claude, Cursor, Grok Build,
  OpenCode, and OpenClaw;
- local and remote environment connection paths, including desktop-managed SSH
  and Croki Connect compatibility infrastructure;
- Croki branding and completion feedback;
- repository-owned Canvas context at `.croki/context.json`.

Provider support means that an adapter and product surface exist. A provider is
ready only when its required local CLI, authentication, model access, and
supporting process are available. OpenClaw additionally requires a running
Gateway and configured agent.

## Canvas

Canvas is optional repository context and a visual projection beside the
Thread. Version 1 stores `intent`, `decision`, `evidence`, and `work` nodes with
`current`, `provisional`, and `retired` authority states. Founder-approved
records are protected by product transitions; agent presentations remain
provisional. Web editing is conflict-safe, mobile presentation is read-only,
and provider context fails open when the source is absent or invalid.

Canvas does not own a conversation, provider, workflow runtime, scheduler,
memory database, Review system, or worktree system.

Approved `current` context is attached to every project turn whether or not the
Canvas panel is open. `provisional` proposals remain visible for review but are
excluded from provider context by default. The composer shows the approved
count, and each sent turn records an inspectable, content-free setup receipt.
The web Canvas navigation is `Product`, `Run`, and `Proposals`; Run projects the
current Thread plan and does not introduce another execution engine.

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
two one-turn behaviors: `Native`, the default, and `GTM v1`. Native adds no
Croki behavior prompt. GTM v1 adds one bounded strategy instruction and resets
to Native after a successful send. Both use the same provider runtime, Thread,
permissions, tools, and approved Canvas context.
OpenClaw follows the same rule: Croki passes prompts through ACP without a
persona, delegation policy, model requirement, or forced reasoning mode.

## Known implementation gaps

- The new behavior selector is web-only. Mobile remains a read-only Canvas
  projection and does not yet expose named harness selection.
- Turn setup inspection currently covers behavior, Canvas application,
  approved/proposed counts, capability, and snapshot identity. Provider/model
  and access controls remain visible in their existing native surfaces.
- Production releases, Croki CLI publication, Croki-owned relay and web
  destinations, signing, and mobile production deployment remain disabled by
  ownership guards.
- Remote self-update and copied CLI launch commands still target the inherited
  `t3@<version>` npm package. They are not Croki release paths until the CLI is
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
