# Croki 0.4.7 workspace continuity

Croki 0.4.7 lets the founder use an existing Obsidian vault as an ordinary
Croki workspace without finding its filesystem path or configuring a harness.
The desktop reads Obsidian's local vault registry, presents valid vaults in the
existing Add Project flow, and starts the same native provider Thread Croki
uses for every other workspace.

Markdown files in a discovered vault can be opened directly in Obsidian from
Croki's file surface. Recognition changes only workspace presentation and app
handoff. It does not inject prompts, add a persona, start a provider turn, or
maintain a second knowledge model.

## Recovery for ordinary folders

Turn evidence and recovery no longer disappear when a workspace is not itself
a Git repository. Croki maintains a private Git object store under its own
application data, captures the same pre-turn and completed-turn checkpoints,
and exposes turn diffs and restore through the existing Thread experience. The
workspace receives no `.git` directory or Croki configuration.

Repository work continues to use the repository's existing hidden checkpoint
refs. Working-tree and branch review remain repository-only concepts; turn
diffs and turn restore now work for ordinary folders as well.

## Verification boundary

- Obsidian discovery ignores malformed registry entries, missing folders, and
  folders that are not vaults.
- The desktop external-link policy permits `obsidian:` while continuing to
  reject arbitrary protocols such as `file:`.
- Managed checkpoints capture, diff, and restore changed and newly created
  files without adding Git metadata to the workspace.
- The selected provider and its native runtime receive no Obsidian-specific
  behavioral context.
