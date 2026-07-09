// Front-door + dogfood routes: health, friction/feature-request capture, the native folder picker, and
// the bundled sample product. Moved verbatim out of server.mjs.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { json, readBody, srcDir } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { reportFriction, listFrictionQueue, DEFAULT_QUEUE_DIR } from "../friction.mjs";
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

  // GET /api/friction — the founder surface reads the auto-logged failure queue here, GROUPED by dedup
  // signature and SPLIT self-inflicted vs transient (see ui/src/api.ts FailureLogView — the frozen shape).
  // A self-observed failure carries a signature/failureClass in its frontmatter; a manual friction report
  // (no signature) is not a self-observed failure and is left OUT of the groups. Read-only; never runs.
  //
  // SCAFFOLD (lane: SURFACE): this shapes listFrictionQueue()'s raw reports into { groups, selfInflictedCount,
  // transientCount }. The grouping is by signature — dedup already collapsed recurrences into one file with
  // an occurrences count, so one open self-observed file == one group. Newest lastSeen first.
  if (req.method === "GET" && url.pathname === "/api/friction") {
    try {
      const queue = listFrictionQueue();
      json(res, 200, buildFailureLogView({ reports: enrichWithContext(queue) }));
    }
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

// Read the "## Context" JSON block a self-observed failure wrote (see logFailure in failure-log.mjs) off
// each queue file and attach its reproducible fields — the pipeline label, the step label, and the
// normalized errorKind — onto the report. listFrictionQueue parses only the frontmatter + the one-line
// errorSnippet; the richer context lives in the body, so this is where the surface picks it up. Read-only,
// best-effort: a file that can't be read or has no Context block just keeps the null defaults (honest
// absence, never invented). Manual friction (no signature) is skipped entirely.
function enrichWithContext(queue) {
  const { queueDir = DEFAULT_QUEUE_DIR, reports = [] } = queue ?? {};
  return reports.map((r) => {
    if (!r.signature) return r;
    let context = null;
    try {
      const text = fs.readFileSync(path.join(queueDir, r.file), "utf8");
      // Grab the JSON fenced block that follows the "## Context" heading.
      const m = text.match(/##\s*Context\s*\n+```json\s*\n([\s\S]*?)\n```/);
      if (m) context = JSON.parse(m[1]);
    } catch { /* unreadable / malformed — leave the context null, fields stay their honest defaults */ }
    return {
      ...r,
      pipeline: context?.pipeline?.label ?? context?.pipeline?.id ?? null,
      step: context?.step?.label ?? null,
      errorKind: context?.errorKind ?? null,
    };
  });
}

// Shape the raw friction queue into the FailureLogView the founder surface reads (ui/src/api.ts). Only
// self-observed failures (those carrying a signature) become groups; manual friction is excluded. Dedup
// already collapsed recurrences into one file per signature, so this maps one open self-observed report to
// one group, sorts newest lastSeen first, and counts the self-inflicted vs transient split.
//
// Pure and deterministic — no model, no IO. The route reads each item's Context JSON via enrichWithContext
// above and hands the reports in already carrying pipeline / step / errorKind. Keep the returned shape
// byte-compatible with FailureLogView (ui/src/api.ts).
export function buildFailureLogView({ reports = [] } = {}) {
  const failures = reports.filter((r) => r.signature && r.status !== "resolved");
  const groups = failures
    .map((r) => ({
      signature: r.signature,
      category: r.category ?? null,
      failureClass: r.failureClass === "transient" ? "transient" : "self_inflicted",
      // The normalized errorKind token (code_throw, timeout, unparseable_output, …), read off the item's
      // Context JSON by enrichWithContext; null when the item predates that field or couldn't be read.
      errorKind: r.errorKind ?? null,
      occurrences: Number.isFinite(r.occurrences) ? r.occurrences : 1,
      firstSeen: r.firstSeen ?? null,
      lastSeen: r.lastSeen ?? r.capturedAt ?? null,
      // The pipeline it happened in + the step that failed — from the Context JSON, so the surface names
      // "which pipeline, which step" instead of just a signature. Null stays null (a crash/stall has no step).
      pipeline: r.pipeline ?? null,
      step: r.step ?? null,
      errorSnippet: r.errorSnippet ?? null,
      file: r.file,
      status: r.status ?? "open",
    }))
    .sort((a, b) => String(b.lastSeen ?? "").localeCompare(String(a.lastSeen ?? "")));
  return {
    groups,
    selfInflictedCount: groups.filter((g) => g.failureClass === "self_inflicted").length,
    transientCount: groups.filter((g) => g.failureClass === "transient").length,
  };
}
