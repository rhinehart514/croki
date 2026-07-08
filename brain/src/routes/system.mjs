// Front-door + dogfood routes: health, friction/feature-request capture, the native folder picker, and
// the bundled sample product. Moved verbatim out of server.mjs.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { json, readBody, srcDir } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { reportFriction, listFrictionQueue } from "../friction.mjs";
import { enqueueFeatureRequest } from "../feature-builder.mjs";
import { listFlowsNeedingFounder } from "../operator-store.mjs";

export default async function handle({ req, res, url }) {
  // Health
  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, { ok: true }); return true;
  }

  // Dogfood friction capture — feedback about GTM IDE itself (a bug, rough edge, or wish noticed
  // mid-flow), filed into the repo's dogfood/queue/ as agent-readable markdown with the current
  // object-model state auto-attached. This is the BUILD loop, not the taste loop: it never touches
  // GTM memory, and nothing here approves, sends, or merges. The item is captured for an agent to
  // work later into a PR that waits at founder review; nothing auto-drains the queue on a schedule.
  // Snapshot pieces that can't be read stay absent, never invented.
  if (req.method === "POST" && url.pathname === "/api/friction") {
    try {
      const body = await readBody(req);
      const report = String(body?.report || "").trim();
      if (!report) { json(res, 400, { error: "A friction report needs the words — what got in the way?" }); return true; }
      const snapshot = {};
      try {
        const project = loadProject(body?.projectId ? { projectId: body.projectId } : {});
        snapshot.project = { id: project.id, activeChannelId: project.activeChannelId ?? null };
        try {
          snapshot.needsFounder = listFlowsNeedingFounder({ projectId: project.id }).map((flow) => ({
            sessionId: flow.sessionId, graphId: flow.graphId, runId: flow.runId ?? null, gateNodeIds: flow.gateNodeIds ?? [],
          }));
        } catch { /* gate state unreadable — leave absent */ }
      } catch { /* no active project — leave absent */ }
      if (body?.snapshot && typeof body.snapshot === "object") snapshot.caller = body.snapshot;
      const record = reportFriction({
        report,
        kind: body?.kind,
        context: body?.context,
        snapshot,
        source: body?.source ?? "api",
      });
      json(res, 201, record);
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/friction") {
    try { json(res, 200, listFrictionQueue()); }
    catch (err) { json(res, 500, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  // Feature request — "the house fixes itself": the founder, from any codebase, asks GTM IDE for a
  // new capability. The request lands in the same dogfood queue (the receipt returns immediately),
  // then a builder agent works it headless in an ISOLATED worktree on a dogfood/* branch, one build
  // at a time. The branch WAITS for founder review — this route can build, never merge or ship.
  if (req.method === "POST" && url.pathname === "/api/feature-request") {
    try {
      const body = await readBody(req);
      const report = String(body?.report || "").trim();
      if (!report) { json(res, 400, { error: "A feature request needs the words — what should Drover be able to do?" }); return true; }
      const snapshot = {};
      try {
        const project = loadProject(body?.projectId ? { projectId: body.projectId } : {});
        snapshot.project = { id: project.id, activeChannelId: project.activeChannelId ?? null };
      } catch { /* no active project — leave absent */ }
      if (body?.snapshot && typeof body.snapshot === "object") snapshot.caller = body.snapshot;
      const record = enqueueFeatureRequest({ report, context: body?.context, snapshot, source: body?.source ?? "api" });
      json(res, 202, {
        file: record.file,
        status: record.status,
        capturedAt: record.capturedAt,
        note: "Build queued. Track it via GET /api/friction; the result is a dogfood/* branch waiting for your review — nothing merges without you.",
      });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Native folder picker. The server runs locally, so it pops the OS folder dialog and returns the
  // real absolute path — a browser folder picker can't expose the filesystem path the scanner needs.
  // No typing, no GitHub: you point Finder at your product. macOS via osascript; other platforms
  // report unsupported so the UI can fall back. Read-only; it only returns the chosen path.
  if (req.method === "POST" && url.pathname === "/api/pick-folder") {
    if (process.platform !== "darwin") { json(res, 200, { unsupported: true }); return true; }
    // Bring the chooser to the FRONT: activate System Events (so a real app is frontmost), then run
    // `choose folder` OUTSIDE that tell block — it's a Standard Additions command the running script
    // owns, NOT a System Events verb, so nesting it errors with no dialog. Distinguish a real cancel
    // (AppleScript error -128) from an actual failure so "not opening" can never silently swallow it.
    execFile("osascript", [
      "-e", 'tell application "System Events" to activate',
      "-e", 'POSIX path of (choose folder with prompt "Choose your product folder")',
    ], (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message || "");
        if (/-128/.test(msg)) { json(res, 200, { cancelled: true }); return; } // user pressed Cancel
        json(res, 200, { error: msg.trim() || "folder picker failed" }); return;
      }
      const picked = String(stdout || "").trim().replace(/\/$/, "");
      json(res, 200, picked ? { path: picked } : { cancelled: true });
    });
    return true;
  }

  // The bundled sample product — the "try it without your own repo" path. A stranger with no
  // instrumented codebase still gets the scan's first-impression: this points them at a small, real
  // sample app that ships in the repo (samples/acme-saas) and reproduces the attribution gap from
  // honest code. The server resolves the absolute path relative to its own module so it survives
  // packaging; the UI drives it through the SAME /api/scan → /api/projects flow a real repo uses.
  if (req.method === "GET" && url.pathname === "/api/sample-product") {
    const repoPath = path.resolve(srcDir, "../../samples/acme-saas");
    json(res, fs.existsSync(repoPath) ? 200 : 404, fs.existsSync(repoPath)
      ? {
          repoPath,
          winEvent: "signup_completed",
          name: "Acme",
          blurb: "A small team task tracker — a stand-in product so you can watch the scan before pointing it at your own.",
        }
      : { error: "Bundled sample product not found." });
    return true;
  }

  return false;
}
