# Convex — the team sync layer

This folder is the team's shared GTM brain-state. The engine stays local-first and synchronous; these
functions are its shared **mirror**, so a team works one set of programs, graphs, runs, gate decisions
and taste together. Nothing here sends or replaces the local founder gate — it only syncs the state
around it. The push/pull syncer lives in `brain/src/convex-sync.mjs`; the seam it hooks is the single
`atomicWrite` in `brain/src/store-fs.mjs`.

## Tables

- `teams`, `members` — identity + membership (the onboarding flow). `role` gates who can approve.
- `documents` — the thin layer: every local store file mirrored as one row, keyed by its path
  relative to `~/.gtm-ide`. Backs the whole engine with no per-store schema.
- `approvals` — the first reactive multiplayer surface: the gate queue an approver resolves from the web.

## Activate it (one-time, ~2 min — needs your login)

This is the one step I can't run for you (it opens a browser to authenticate and provisions your
deployment):

```
! npx convex dev
```

That logs you in (GitHub), creates a dev deployment, writes `CONVEX_DEPLOYMENT` + `CONVEX_URL` to
`.env.local`, generates `convex/_generated/`, and pushes this schema + functions. Leave it running; it
hot-pushes function edits.

## Point the engine at a team

Once you have a team id (the onboarding flow creates one, or read it from the Convex dashboard), the
brain mirrors to it when these are set:

```
GTM_IDE_CONVEX_URL=<your deployment URL, e.g. https://xxx.convex.cloud>
GTM_IDE_TEAM_ID=<a teams._id>
GTM_IDE_USER=<your email>      # optional; labels who wrote each document
```

With none set, GTM IDE runs exactly as before — fully local, no Convex dependency loaded.
