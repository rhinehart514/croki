# Croki product context

Croki is a narrow product overlay on the native coding-agent environment.
Threads, providers, worktrees, recovery, terminal, preview, files, plans, Git,
and Review remain native surfaces.

## Application lineage

Projects may declare application lineage in `.croki/application.json`. Version
1 contains:

- the application name;
- optional released reality: version, summary, product facts, GTM facts,
  learnings, and release provenance;
- optional building intent: version, intent, expected product and GTM changes,
  and success signals.

At least one released or building state is required. A building-only file is
valid for an application approaching its first declared version.

The file is optional. Absence adds no prompt, warning, setup flow, or negative
composer status. Invalid, unsupported, unreadable, or oversized lineage also
fails open so native provider work can continue.

Released reality and building intent are founder-approved application facts.
Agents may inspect evidence and propose a change through an ordinary Thread and
Review, but must never silently establish or rewrite lineage.

## Provider behavior

Before every provider turn, the server reads a fresh application snapshot from
the canonical project root, including when the Thread executes in a worktree.
It prepends a bounded factual block to provider input and leaves the stored user
message unchanged.

The block distinguishes inherited released reality from the version currently
being built. It supplies no persona, planning loop, tool policy, delegation
policy, or additional authority. Native remains the default provider behavior;
Product, GTM, and Venture remain explicit one-turn harnesses.

The source is limited to 64 KiB and the rendered block to 12,000 characters.
Repository values are JSON escaped and identified as data rather than
behavioral instructions.

## Release infrastructure

Application lineage does not require Git or a repository host.

- A GitHub-hosted project may cite its release URL and local tag.
- A local Git repository may cite only its tag and release-note files.
- A non-Git project may declare released or building reality without sources.

Hosted URLs and tags are provenance metadata. Provider injection never fetches
them, and a missing remote, GitHub CLI, credential, or network connection cannot
prevent a turn.

## Composer

When lineage is loaded, the composer shows the application transition, for
example `0.4.5 → 0.4.6`. Its inspection popover names released state, building
state, current intent, and available provenance.

When lineage is absent, the old `No context` slot disappears. A declared but
unusable file produces a concise nonblocking warning.

## Canvas and legacy context

Canvas remains a possible projection of application lineage, Senses, evidence,
and Thread activity. It is not required to establish or inject lineage and must
not become a second memory, runtime, task board, conversation store, or
manually maintained scene.

`.croki/context.json`, its release candidate, and node-authoring model are
legacy compatibility formats. Historical `croki.context.applied` receipts stay
content-free and readable, but new provider turns and the composer do not use
that file.

## Verification

Run the focused application parser, provider, and composer tests, then:

```sh
npm run check:croki
```
