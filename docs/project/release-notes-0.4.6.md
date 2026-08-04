# Croki 0.4.6 application lineage

Croki 0.4.6 establishes version-aware product and GTM inheritance for every
application without requiring Canvas, GitHub, or a second project system.

## Released reality and building intent

Projects may add `.croki/application.json` with the application state they have
released and the version they are currently building. Croki reads this bounded
founder-approved file from the canonical project root, so every native worktree
inherits the same application direction.

The composer now shows the transition directly, such as `0.4.5 → 0.4.6`, where
the stale Canvas context indicator previously showed `No context`, context
counts, or an old release candidate. If lineage is absent, the slot disappears.
A declared but invalid file produces a concise warning without blocking work.

## Native provider injection

Every provider turn receives released product reality, released GTM reality,
accumulated learnings, the version being built, its intent, expected product and
GTM changes, and success signals. This is factual context, not a harness: it
does not add a persona, planning loop, delegation policy, tool policy, or new
authority. The stored user message remains unchanged.

Source files are capped at 64 KiB and rendered provider context at 12,000
characters. Missing, malformed, unsupported, unreadable, or oversized lineage
fails open.

## GitHub is optional evidence

Released versions may cite local Git tags, hosted release URLs, and repository
files. Those sources are provenance only and are never fetched during a turn.
The same application contract therefore works for GitHub-hosted repositories,
local Git repositories without a remote, and non-Git projects.

## Canvas foundation

Canvas remains a possible future projection of application lineage, Senses,
evidence, and Thread activity. It is no longer required to manufacture or
inject product context. The legacy `.croki/context.json` release-board and node
model is removed from Croki's active project state while historical receipts
remain readable.

## Verification

The 0.4.6 boundary is covered by shared parser and rendering tests, server
loading and provider-turn tests, composer state and presentation tests, the web
production build, package typechecks, and `npm run check:croki`.
