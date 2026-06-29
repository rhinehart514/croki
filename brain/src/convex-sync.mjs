// Compatibility shim for the team-sync layer.
//
// The team-sync write-behind queue AND the boot pull now live in ONE place — convex-backend.mjs (the
// SQLite-era mirror, the single seam). This module used to carry a SECOND, path-keyed write-behind queue
// plus its own raw-JSON boot pull; that duplicate implementation is retired. Only these thin delegators
// remain so existing callers and tests keep working while everything converges on the one seam.
//
// Importing this module also arms the persistence Convex backend as a side effect: convex-backend.mjs
// runs registerConvexBackend at import time, so any boot path that imports this file makes
// `persistence({ backend: "convex" })` (and the env-driven auto-select) available without an ESM cycle.
import { hydrateTeamDocuments, teamSyncEnabled } from "./convex-backend.mjs";

// True only when a team deployment is configured (Convex URL + team id). With neither set the engine is
// pure local-first SQLite and this stays false — no network, ever.
export function syncEnabled() {
  return teamSyncEnabled();
}

// Boot hydration: pull the team's shared documents into the local SQLite store. Delegates to the one
// seam. Returns { pulled } / { pulled, disabled } / { pulled, error } exactly as the boot path expects,
// and — when no team is configured — returns { pulled: 0, disabled: true } without touching the network.
export function pullTeamDocuments(options = {}) {
  return hydrateTeamDocuments(options);
}
