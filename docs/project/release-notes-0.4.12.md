# Croki 0.4.12 — Current T3 Code Foundation

Status: stable release
Date: August 12, 2026

Croki 0.4.12 incorporates T3 Code through upstream commit `e321667b` while
keeping Croki's identity, installed-state compatibility, provider boundary, and
release ownership intact.

## Product result

- The current T3 web and desktop interaction style carries forward, including
  theme search and OKLCH palettes, clearer sidebar and composer behavior,
  project icons, draft recovery, improved empty states, and reliable changed-file
  and pull-request layouts.
- Pull requests work across GitHub, GitLab, Bitbucket, and Azure DevOps with
  in-app review behavior and better self-hosted remote routing.
- Usage reporting adds a cross-platform mobile view and hourly recent-usage
  detail while avoiding duplicate forked-session totals.
- Mobile gains title regeneration, steadier composer and thread interactions,
  tablet rotation support, ordered-list rendering fixes, and production-release
  reconciliation guarded by Croki-owned configuration.
- Server and platform fixes cover unborn Git repositories, Windows terminals
  and provider discovery, Azure SSH remotes, project favicons, oversized image
  handling, resource isolation, and provider model parsing.

## Codex behavior

Every Codex `turn/start` receives T3's Default or Plan host developer
instructions, adapted only for Croki's runtime identity and product-native
Preview/MCP routes. No separate Croki application, strategy, persona, or
workflow prompt is prepended. Presentation-only Croki state is stripped before
the turn reaches the provider.

## Compatibility and ownership

- Existing Croki database migrations 39–42 remain immutable. The overlapping
  T3 project-environment and favicon migrations move to idempotent Croki
  migrations 43–44 so both installed histories converge safely.
- Croki package names, schema route, storage keys, CORS origins, resource
  monitor identity, and user-facing branding remain Croki-owned.
- GitHub desktop publication is enabled only for `rhinehart514/croki` on
  `croki/main`. CLI, relay, hosted web, signing, Discord, and mobile production
  destinations remain independently disabled.

## Verification

- full 16-workspace typecheck and production build;
- complete server suite: 2,457 tests passed, 7 skipped;
- all non-server workspace suites passed;
- repository formatting and lint (warnings only);
- `npm run check:croki`, `npm run release:smoke`, release destination planning,
  migration compatibility tests, and the generated `/schema/croki.json` route.
