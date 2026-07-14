#!/usr/bin/env node

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recoverStaleBuilds } from "./feature-builder.mjs";
import { startHeatScheduler } from "./firm/heat.mjs";
import { json, serveFile } from "./routes/util.mjs";
import { founderBootstrapCode } from "./routes/session-guard.mjs";

// Per-domain route modules. The single request handler this file used to hold was split into these
// cohesive groups (behavior-preserving, W8): each exports `handle({ req, res, url })` that runs its
// slice of the original if-chain and returns `true` when it handled the request. The dispatch below
// calls them in the original route order, then falls through to the static-file + 405 tail — so the
// FIRST matching route still wins, exactly as when every route lived inline.
import systemRoutes from "./routes/system.mjs";
import presenceRoutes from "./routes/presence.mjs";
import credentialRoutes from "./routes/credentials.mjs";
import firmRoutes from "./firm/routes.mjs";
import firmHeatRoutes from "./firm/heat-routes.mjs";
import firmLensRoutes from "./firm/lens-routes.mjs";
import firmProductChangeRoutes from "./firm/product-routes.mjs";
import firmWorkRoutes from "./firm/work-routes.mjs";
import firmVentureRoutes from "./firm/venture-routes.mjs";

const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || "127.0.0.1";

// Surviving harness routes plus the firm's live venture/bet/wall surface.
const ROUTE_GROUPS = [
  systemRoutes,
  presenceRoutes,
  credentialRoutes,
  firmRoutes,
  firmHeatRoutes,
  firmLensRoutes,
  firmProductChangeRoutes,
  firmWorkRoutes,
  firmVentureRoutes,
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

  const ctx = { req, res, url };
  for (const group of ROUTE_GROUPS) {
    if (await group(ctx)) return;
  }

  if (url.pathname.startsWith("/api/")) {
    json(res, 404, { error: "API route not found." });
    return;
  }

  // Static files
  if (req.method === "GET") { serveFile(url.pathname, res); return; }

  json(res, 405, { error: "Method not allowed." });
});

// Exported so a test can boot the real route handler on an ephemeral port and close it cleanly.
export { server };

// The firm's always-on heat scheduler (F7) handle, so shutdown can clear the timer cleanly.
let heatScheduler = null;

function startServer() {
  server.listen(port, host, () => {
  console.log(`Drover running at http://${host}:${port}`);
  console.log(`Founder action code: ${founderBootstrapCode()}`);
  // Start the firm's always-on loop. Every open venture's heat dial defaults to "off" (getHeatSettings)
  // until the founder turns it up, so a fresh install wakes nothing until explicitly asked to.
  heatScheduler = startHeatScheduler();
  // Dogfood crash recovery: no feature build survives a restart, so flip stale queued/building
  // items to `interrupted` and salvage any orphaned worktree work onto its branch. Best-effort.
  try {
    const recovered = recoverStaleBuilds();
    if (recovered.length) console.log(`  Dogfood recovery: ${recovered.map((r) => r.item ?? r.worktree).join(", ")}`);
  } catch (err) {
    console.log(`  Dogfood recovery skipped: ${err instanceof Error ? err.message : err}`);
  }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
  // Clear the heat scheduler timer on shutdown so the process can exit cleanly.
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      try {
        heatScheduler?.stop();
      } catch {
        /* best-effort: never block shutdown on the heat scheduler timer */
      }
    });
  }
}

export { startServer };
