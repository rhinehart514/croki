#!/usr/bin/env node

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recoverStaleBuilds } from "./feature-builder.mjs";
import { startHeatScheduler } from "./firm/heat.mjs";
import { devFounderAuthorityEnabled } from "./routes/founder-authority.mjs";
import { json, serveFile } from "./routes/util.mjs";

// Per-domain route modules. The single request handler this file used to hold was split into these
// cohesive groups (behavior-preserving, W8): each exports `handle({ req, res, url })` that runs its
// slice of the original if-chain and returns `true` when it handled the request. The dispatch below
// calls them in the original route order, then falls through to the static-file + 405 tail — so the
// FIRST matching route still wins, exactly as when every route lived inline.
import systemRoutes, { shellStatus } from "./routes/system.mjs";
import presenceRoutes from "./routes/presence.mjs";
import credentialRoutes from "./routes/credentials.mjs";
import firmRoutes from "./firm/routes.mjs";
import firmHeatRoutes from "./firm/heat-routes.mjs";
import firmLensRoutes from "./firm/lens-routes.mjs";
import firmProductChangeRoutes from "./firm/product-routes.mjs";
import firmWorkRoutes from "./firm/work-routes.mjs";
import firmDialogueRoutes from "./firm/dialogue-routes.mjs";
import firmVentureRoutes from "./firm/venture-routes.mjs";
import firmConfigurationRoutes from "./firm/configuration-routes.mjs";
import firmArchitectureRoutes from "./firm/architecture-routes.mjs";

const port = Number(process.env.PORT || 4317);
const host = "127.0.0.1";
const serverInstance = shellStatus().instanceId;

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
  firmDialogueRoutes,
  firmConfigurationRoutes,
  firmArchitectureRoutes,
  firmVentureRoutes,
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

  if (url.pathname.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Drover-Server-Instance", serverInstance);
    res.setHeader("X-Drover-Responded-At", new Date().toISOString());
  }

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
let shutdownPromise = null;
let shutdownFailSafe = null;

const SHUTDOWN_GRACE_MS = 5_000;

function stopHeatScheduler() {
  const scheduler = heatScheduler;
  heatScheduler = null;
  try {
    scheduler?.stop();
  } catch {
    /* best-effort: never block shutdown on the heat scheduler timer */
  }
}

function closeHttpServer() {
  if (!server.listening) return Promise.resolve();

  return new Promise((resolve, reject) => {
    // Let in-flight requests finish, but do not let a stuck connection pin Drover forever.
    const forceClose = setTimeout(() => server.closeAllConnections?.(), SHUTDOWN_GRACE_MS);
    forceClose.unref();

    server.close((err) => {
      clearTimeout(forceClose);
      if (err && err.code !== "ERR_SERVER_NOT_RUNNING") reject(err);
      else resolve();
    });
    server.closeIdleConnections?.();
  });
}

function shutdownServer() {
  if (shutdownPromise) return shutdownPromise;

  stopHeatScheduler();
  shutdownPromise = closeHttpServer().catch((err) => {
    server.closeAllConnections?.();
    process.exitCode = 1;
    console.error(`Drover shutdown failed: ${err instanceof Error ? err.message : err}`);
    throw err;
  });
  return shutdownPromise;
}

function shutdownAfterSignal() {
  // This timer is unref'd so a healthy shutdown still exits naturally. If a broken listener or
  // connection keeps the event loop alive past the drain window, fail closed instead of pinning the
  // old Drover process and port forever.
  if (!shutdownFailSafe) {
    shutdownFailSafe = setTimeout(() => {
      console.error("Drover shutdown timed out; forcing exit.");
      process.exit(1);
    }, SHUTDOWN_GRACE_MS + 1_000);
    shutdownFailSafe.unref();
  }

  void shutdownServer()
    .then(() => {
      clearTimeout(shutdownFailSafe);
      shutdownFailSafe = null;
    })
    .catch(() => {});
}

function startServer() {
  server.listen(port, host, () => {
    console.log(`Drover running at http://${host}:${port}`);
    if (devFounderAuthorityEnabled()) {
      console.warn("  Development founder writes enabled for non-agent loopback browser requests.");
    }
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
  // Stop recurring work and release the listening socket. The shared promise makes repeated signals
  // join the same shutdown instead of racing multiple server.close() calls.
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, shutdownAfterSignal);
  }
}

export { shutdownServer, startServer };
