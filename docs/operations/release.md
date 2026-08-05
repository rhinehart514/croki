# Release ownership and enablement

Croki production releases are disabled by default. Destinations are opt-in
independently: a Croki-owned GitHub release can publish desktop artifacts while
CLI, relay, hosted web, signing, Discord, and mobile destinations remain off.
Every enabled destination still fails closed unless its own Croki-owned
configuration is complete.

## 0.4.7 source candidate

The 0.4.7 source candidate aligns the four manifests updated by the release
workflow (`apps/server`, `apps/desktop`, `apps/web`, and `packages/contracts`).
It adds native Codex voice, completes worker Thread navigation, makes generated
titles durable and repairable, and incorporates the upstream runtime, Git,
preview, terminal, and compatibility fixes listed in the [0.4.7 release
candidate notes](../project/release-notes-0.4.7.md).

## Current behavior

- `croki/main` receives full CI and Croki overlay checks.
- Pushes to `croki/main` build an unsigned Windows x64 installer artifact.
- Manual release dispatch defaults to a dry-run destination plan.
- Tagged and scheduled GitHub release paths can be enabled with
  `CROKI_RELEASE_ENABLED=true`, `CROKI_RELEASE_REPOSITORY=rhinehart514/croki`,
  and `CROKI_RELEASE_BRANCH=croki/main`. CLI, relay, web, signing, Discord, and
  mobile paths remain skipped unless their specific enable flags are true and
  their destination configuration validates.
- The local server package is `croki-server` and its metadata points at the
  Croki repository. Publication is still disabled because the Croki-owned
  package destination and release variables are not configured.

## Ownership guard

`scripts/croki-release-plan.ts` is the authoritative destination validator.
Run its non-publishing plan locally with:

```sh
npm run release:croki:plan
```

Production enablement requires a destination flag and only the Croki-owned
values needed by that destination. Use `CROKI_RELEASE_ENABLED` for GitHub,
`CROKI_CLI_PUBLISH_ENABLED` for npm, `CROKI_RELAY_DEPLOY_ENABLED` for relay,
`CROKI_WEB_DEPLOY_ENABLED` for hosted web, `CROKI_SIGNING_ENABLED` for signed
desktop artifacts, `CROKI_DISCORD_RELEASE_ENABLED` for announcements, and the
existing mobile flags for EAS. The release plan reports each destination
independently.

The guard rejects:

- the inherited `pingdotgg/t3code` repository;
- release pushes to `main`;
- the inherited `t3` or `@t3tools/*` CLI package;
- inherited `t3.codes` service destinations;
- the inherited T3 EAS project;
- incomplete signing, hosted web, relay, Discord, or mobile ownership.

Do not bypass the guard. Compatibility identifiers such as `CROKI_*`,
`croki://`, `.t3`, and the current server binary name remain in the codebase to
preserve installed state and wire compatibility; they are not release authority.

## Enablement order

1. Configure the Croki GitHub repository and `croki/main` release branch.
2. Enable the GitHub destination and run its dry run; inspect every artifact.
3. Enable CLI, relay, web, signing, Discord, or mobile only after each
   destination has complete Croki-owned credentials and a passing plan.
4. Run the destination plan and release smoke checks after every enablement.
5. Test one controlled release before enabling additional destinations.

## Local verification

```sh
npm run release:croki:plan
npm run release:smoke
npm run check:croki
```

The Windows artifact workflow is safe for local testing because it omits
inherited updater repository metadata. It should remain unsigned until Croki's
Windows signing identity is configured.
