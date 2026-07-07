#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTrackingFix } from "./build.mjs";
import { attachTerminalServer } from "./terminal-server.mjs";
import { getEngineState } from "./engine.mjs";
import { loadFlow, recordFlowRun, saveFlow } from "./flow-store.mjs";
import { listServers, getServer, recordServer, removeServer, reclassifyTool, serverView } from "./mcp-store.mjs";
import { connectStdioServer } from "./mcp-client.mjs";
import { applyGraphOperations, validateGraph } from "./graph-operations.mjs";
import { auditGraphContracts } from "./contracts.mjs";
import { extractDecisions, buildDraftMemory } from "./memory.mjs";
import { assembleContext } from "./context/assembler.mjs";
import { providersFromContext } from "./context/providers.mjs";
import {
  applySharedContextToGraph,
  createChannel,
  createProject,
  duplicateChannel,
  getAgentProfile,
  getAgentBench,
  getChannel,
  getProjectWithChannels,
  listProjects,
  groundProjectInWorkspace,
  loadProject,
  projectTeamId,
  promoteChannel,
  revokeChannel,
  setChannelIcp,
  setActiveChannel,
  setActiveWorkflow,
  setActiveProject,
  updateChannel,
  updateSharedContext,
} from "./project-store.mjs";
import { deleteProject, mergeProjects } from "./project-merge.mjs";
import {
  addMember,
  canApprove,
  createTeam,
  ensurePersonalTeam,
  getTeam,
  listMembers,
  listTeams,
  resolveCurrentUser,
  teamsForUser,
} from "./team-store.mjs";
import { executeDomainCommand } from "./domain-commands.mjs";
import { reportFriction, listFrictionQueue } from "./friction.mjs";
import { enqueueFeatureRequest, recoverStaleBuilds } from "./feature-builder.mjs";
import { getProductModel } from "./product-model-store.mjs";
import { getDesignState } from "./design-state-store.mjs";
import { createClaudeProductModeler } from "./product-model-generator.mjs";
import { buildRunGrounding } from "./run-grounding.mjs";
import {
  runMarketResearch,
  createClaudeMarketResearcher,
  researchMarketLayer,
  createClaudeMarketLayerResearcher,
  buildMarketContext,
  founderInputsFromSharedContext,
} from "./market-research.mjs";
import { compileRunFromPath, gateReviewForRun, approveCompiledRun } from "./run-compile.mjs";
import { ensureObjectGraphProductScan, objectGraphForProject } from "./object-graph-projection.mjs";
import { objectGraphLayoutStore, objectGraphStore } from "./object-graph-store.mjs";
import { applyObjectGraphOperations } from "./object-graph-operations.mjs";
import { outcomeReport, ingestOutcome, ingestBatch, OUTCOME_SOURCES } from "./outcome-ingest.mjs";
import { deriveRunSummary } from "./run-summary.mjs";
import { recordFounderOutcome } from "./outcome-capture.mjs";
import { ideaTasteForProject, recordIdeaDecisions } from "./feedback-ledger.mjs";
import { composeIdeas, createClaudeAngleProposer, createClaudeIdeaGenerator, createClaudeObjectIdeaGenerator, ideateObjectCandidates } from "./ideation.mjs";
import { createClaudeIdeaBar } from "./idea-bar.mjs";
import { createGtmIdea, getGtmIdea, saveGtmIdea, listGtmIdeas } from "./idea-store.mjs";
import { recordRunDerivations } from "./run-derivation.mjs";
import { getBoard, getPipelineBeliefSpine, getPipelineIcpGrouping } from "./board.mjs";
import {
  productTruthStore,
  marketObjectStore,
  gtmPathStore,
  measurementContractStore,
  persistProductTruthsFromScan,
  runStore,
} from "./gtm-store.mjs";
import { applyExperimentVerdict, suggestVerdictFromOutcomes } from "./belief-writeback.mjs";
import { upsertStatedExperiment } from "./stated-experiment.mjs";
import { listPeople, getPerson } from "./person-store.mjs";
import { loadClarity, addClarity, removeClarity } from "./clarity-store.mjs";
import { appendInput, listInputs, markRouted } from "./inputs-store.mjs";
import { routeUnroutedInputs } from "./input-routing.mjs";
import { findReferences, listSharedKernel, deriveChannelFeeds, deriveDirectedFeeds, createDerivedSourceLoader } from "./cross-reference.mjs";
import { compareChannelRuns } from "./run-compare.mjs";
import { listConnectors } from "./connectors/registry.mjs";
import { runGraph } from "./graph.mjs";
import { liveStepRuntime } from "./agent-bridge.mjs";
import { createClaudeComposer } from "./composition.mjs";
import { selectRuntime, authModeLabel } from "./runtimes/index.mjs";
import { listArtifacts, readArtifact, writeArtifact } from "./artifact-store.mjs";
import {
  cancelOperatorSession,
  executeOperatorTool,
  launchOperatorSession,
  resolveOperatorCandidates,
  resolveOperatorGate,
  resolveOperatorIdeas,
  resolveOperatorProposal,
  resumeOperatorSession,
  runDueAmbientTicks,
} from "./operator-runtime.mjs";
import {
  assertOperatorSessionProject,
  createOperatorSession,
  getActiveSessionForProject,
  getOperatorSession,
  listFlowsNeedingFounder,
  listOperatorSessions,
  publicOperatorSession,
  recoverInterruptedOperatorSessions,
} from "./operator-store.mjs";
import {
  applyRevision,
  createRevision,
  inspectApplyReadiness,
  reviewRevision,
  revertRevision,
} from "./revision.mjs";
import { runDueMotions, promoteRun } from "./promote-motion.mjs";
import { execFile } from "node:child_process";
import { scanRepo } from "./scan.mjs";
import {
  addDecision,
  addRevision,
  getWorkspace,
  listWorkspaces,
  openWorkspace,
  rescanWorkspace,
  updateRevision,
} from "./workspace.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.resolve(here, "../../ui/dist");

// Load <repoRoot>/.env.local so the team-sync config persists across restarts without exporting env by
// hand. Minimal KEY=VALUE parser; never overrides an already-set var. CONVEX_URL (written by
// `npx convex dev`) is mapped to GTM_IDE_CONVEX_URL when the latter isn't set, so wiring a team needs
// only GTM_IDE_TEAM_ID. With no .env.local and no env, the engine stays fully local — sync never engages.
(() => {
  try {
    const envPath = path.resolve(here, "../../.env.local");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
    if (!process.env.GTM_IDE_CONVEX_URL && process.env.CONVEX_URL) {
      process.env.GTM_IDE_CONVEX_URL = process.env.CONVEX_URL;
    }
  } catch {
    /* best-effort: a malformed .env.local never blocks boot */
  }
})();

const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || "127.0.0.1";
recoverInterruptedOperatorSessions();

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// The on-disk agent roster — every subagent definition with the one-line description from its
// frontmatter. Shared by the library listing and the bench so the two never drift on which agents
// exist or how they're named. Read-only; returns [] when there is no agents directory.
function listLibraryAgents() {
  const agentsDir = path.join(os.homedir(), ".claude", "agents");
  const firstDescription = (text) => {
    const m = text.match(/^description:\s*(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, "").slice(0, 160) : "";
  };
  try {
    return fs.readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        let description = "";
        try { description = firstDescription(fs.readFileSync(path.join(agentsDir, f), "utf8")); } catch { /* name only */ }
        return { ref: f.replace(/\.md$/, ""), description };
      })
      .sort((a, b) => a.ref.localeCompare(b.ref));
  } catch {
    return [];
  }
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) reject(new Error("Request body too large."));
    });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("Request body must be valid JSON.")); }
    });
    req.on("error", reject);
  });
}

// ── Founder-register summaries for the rebuilt GTM-engine rituals ─────────────────────────────────
// Plain-language one-liners the founder reads after invoking a ritual. No engine word (solidity,
// composite, joinKey) reaches these — the store's labels are translated to how-solid English here.
function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function marketResearchSummary(project, objects, meta = {}) {
  const name = project?.name || "your product";
  if (!objects.length) {
    return meta.blank
      ? `No live research ran, so nothing was added to the buyer picture for ${name} yet. Connect Claude and run it again.`
      : `Research ran but found nothing solid to add to the buyer picture for ${name} yet.`;
  }
  const backed = objects.filter((o) => ["observed", "researched"].includes(String(o.solidity))).length;
  const guesses = objects.filter((o) => String(o.solidity) === "speculative").length;
  const parts = [`Built the buyer picture for ${name}: ${plural(objects.length, "thing")} now known about who buys, why, and where they are`];
  if (backed) parts.push(`${backed} backed by a real source`);
  if (guesses) parts.push(`${guesses} still a hypothesis to confirm`);
  return `${parts.join(" — ")}.`;
}


// Ground the ProductTruth side from the project's own scanned repo, so the GTM map and the path
// portfolio rest on BOTH truths (product facts + market objects) instead of "0 product facts". Runs
// the same read-only scan the front door uses, adapts its cited claims into ProductTruth records, and
// persists any not already stored. Best-effort and idempotent: no configured repo, or a scan error,
// leaves the store as it was — grounding must never block or slow the research/generate ritual.
function groundProductTruthsForProject(project, projectId) {
  const repoPath = project?.sharedContext?.repository?.repo;
  if (!repoPath) return { created: [], skipped: 0, scanned: false };
  try {
    const winEvent = project.sharedContext.repository.outcome || "project_created";
    const report = scanRepo(expandHome(repoPath), { winEvent });
    return { ...persistProductTruthsFromScan(report, { projectId }), scanned: true };
  } catch {
    return { created: [], skipped: 0, scanned: false };
  }
}

const objectGraphMarketFills = new Set();

function scheduleObjectGraphMarketFill(project, scanReport = null) {
  const projectId = project?.id;
  const repo = project?.sharedContext?.repository?.repo;
  if (!projectId || !repo) return;
  if (marketObjectStore.list({ projectId }).length) return;
  if (objectGraphMarketFills.has(projectId)) return;
  objectGraphMarketFills.add(projectId);
  runMarketResearch({
    projectId,
    grounding: scanReport,
    founderInputs: founderInputsFromSharedContext(project.sharedContext),
    generator: createClaudeMarketResearcher({ cwd: repo }),
  })
    .catch(() => null)
    .finally(() => objectGraphMarketFills.delete(projectId));
}

function promoteSummary(motion) {
  const cadence = (motion?.cadence ?? "").trim();
  if (cadence) {
    return `Turned this run into a repeating motion — it re-stages ${cadence} and still stops at your gate every time. Nothing sends on its own.`;
  }
  return "Turned this run into a repeatable motion. It keeps score, but only re-runs when you ask — nothing fires on its own.";
}

// Read a request body as RAW text (no JSON.parse), for the CSV drop route where the body is a
// pasted/uploaded spreadsheet, not JSON. Same 100k guard as readBody.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) reject(new Error("Request body too large."));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Split one CSV line into fields, honoring double-quoted cells that contain commas or escaped quotes
// (`""`). A small, dependency-free parser — enough for a founder dropping an export, not a full RFC.
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

// Parse a CSV drop into a list of input descriptors — one per data row. The header row names the
// columns; each row becomes payload. A `kind`/`source` column overrides the route defaults per-row, so
// one file can carry mixed signals. Rows are NEVER routed or run here — the route appends them as
// 'unrouted' and stops. Returns the descriptors; an empty/headers-only file yields none.
function parseInputsCsv(text, { kind: defaultKind, source: defaultSource } = {}) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    header.forEach((col, i) => { if (col) row[col] = cells[i] ?? ""; });
    const kind = (row.kind || defaultKind || "").trim();
    const source = (row.source || defaultSource || "").trim();
    const payload = { ...row };
    delete payload.kind;
    delete payload.source;
    return { kind, source, payload };
  });
}

// Map one repo-signal emitted by the gtm-signal-github scout into an input descriptor. The host hook for
// that agent's output: a stargazer / forker / issue-opener becomes a captured world signal, provenance
// stamped source='gtm-signal-github' so the routing layer knows where it came from. ALWAYS lands
// unrouted — ingesting a pull-signal never replies, sends, or runs.
function githubSignalToInput(signal = {}, { runId } = {}) {
  const kind = String(signal.kind || signal.action || "repo-signal").trim() || "repo-signal";
  const source = String(signal.source || "github").trim() || "github";
  return {
    kind,
    source,
    payload: signal,
    provenance: {
      source: "gtm-signal-github",
      agent: "gtm-signal-github",
      ...(runId ? { runId } : {}),
      ...(signal.provenance && typeof signal.provenance === "object" ? signal.provenance : {}),
    },
  };
}

function expandHome(v) {
  if (typeof v !== "string") return "";
  if (v === "~") return process.env.HOME || v;
  if (v.startsWith("~/")) return path.join(process.env.HOME || "", v.slice(2));
  return v;
}

// The pipeline's own offer/deal for a graph, when the graph belongs to a channel that carries one.
// Passed into applySharedContextToGraph so a run's drafting steps honor the pipeline's deal without
// the founder restating it; null falls back to the project-level sharedContext.offer there.
function channelOfferFor(project, graphId) {
  if (!graphId) return null;
  const channel = (project?.channels ?? []).find((c) => c.graphId === graphId || c.id === graphId);
  return channel?.offer ?? null;
}

function serveFile(reqPath, res) {
  if (!fs.existsSync(uiRoot)) {
    json(res, 503, { error: "UI not built. Run `npm run build`." });
    return;
  }
  const relative = reqPath === "/" ? "index.html" : reqPath.replace(/^\/+/, "");
  let file = path.resolve(uiRoot, relative);
  if (!file.startsWith(uiRoot)) { json(res, 403, { error: "Forbidden." }); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(uiRoot, "index.html");
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    "Cache-Control": file.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
  });
  fs.createReadStream(file).pipe(res);
}

// The release-authority guard for a raw graph run (/api/graph/run + /stream). A gate approval is a
// human-only act — the agent front door (mcp.mjs) stamps every request `x-gtm-actor: agent`, and an
// approval carrying that stamp is refused here, closing the MCP self-approval hole (approve_workflow_gate
// posted `approvals: { nodeId: true }` and the route honored it unchecked). This extends the EXISTING
// authorizeRelease seam runGraph already honors: the returned function is invoked ONLY when the run
// actually carries an approval/release intent, so an agent run that merely reaches a gate still works —
// only an agent-originated APPROVAL throws. The founder's browser sends no such header, so the local
// canvas gate is unchanged (no new friction). The thrown error maps to 403, like the operator gate.
function authorizeReleaseForRequest(req) {
  const isAgent = String(req?.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase() === "agent";
  return () => {
    if (!isAgent) return;
    const error = new Error(
      "Gate approval is human-only. An agent/MCP session cannot approve a founder gate — a person must approve it at the canvas gate.",
    );
    error.code = "gate_release_forbidden";
    error.status = 403;
    throw error;
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

  // Health
  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, { ok: true }); return;
  }

  // Dogfood friction capture — feedback about GTM IDE itself (a bug, rough edge, or wish noticed
  // mid-flow), filed into the repo's dogfood/queue/ as agent-readable markdown with the current
  // object-model state auto-attached. This is the BUILD loop, not the taste loop: it never touches
  // GTM memory, and nothing here approves, sends, or merges — a nightly agent works the queue into
  // PRs that wait at founder review. Snapshot pieces that can't be read stay absent, never invented.
  if (req.method === "POST" && url.pathname === "/api/friction") {
    try {
      const body = await readBody(req);
      const report = String(body?.report || "").trim();
      if (!report) { json(res, 400, { error: "A friction report needs the words — what got in the way?" }); return; }
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
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/friction") {
    try { json(res, 200, listFrictionQueue()); }
    catch (err) { json(res, 500, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // Feature request — "the house fixes itself": the founder, from any codebase, asks GTM IDE for a
  // new capability. The request lands in the same dogfood queue (the receipt returns immediately),
  // then a builder agent works it headless in an ISOLATED worktree on a dogfood/* branch, one build
  // at a time. The branch WAITS for founder review — this route can build, never merge or ship.
  if (req.method === "POST" && url.pathname === "/api/feature-request") {
    try {
      const body = await readBody(req);
      const report = String(body?.report || "").trim();
      if (!report) { json(res, 400, { error: "A feature request needs the words — what should Drover be able to do?" }); return; }
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
    return;
  }

  // Native folder picker. The server runs locally, so it pops the OS folder dialog and returns the
  // real absolute path — a browser folder picker can't expose the filesystem path the scanner needs.
  // No typing, no GitHub: you point Finder at your product. macOS via osascript; other platforms
  // report unsupported so the UI can fall back. Read-only; it only returns the chosen path.
  if (req.method === "POST" && url.pathname === "/api/pick-folder") {
    if (process.platform !== "darwin") { json(res, 200, { unsupported: true }); return; }
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
    return;
  }

  // Multi-channel project
  if (req.method === "GET" && url.pathname === "/api/projects") {
    try { json(res, 200, listProjects()); }
    catch (err) { json(res, 500, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    try {
      const body = await readBody(req);
      const workspace = openWorkspace(expandHome(body.repoPath), body.outcome || body.winEvent);
      const name = String(body.name || path.basename(workspace.repo)).trim();
      // Reuse an existing project for the same repo instead of spawning a duplicate (rodentradar-2,
      // -3…). Pointing twice at the same product re-grounds and re-activates the one project.
      const existing = (listProjects().projects || []).find((p) => p.repo === workspace.repo);
      if (existing) {
        setActiveProject(existing.id);
        const project = groundProjectInWorkspace(workspace, { projectId: existing.id });
        json(res, 200, { project, workspace, activeProjectId: existing.id });
        return;
      }
      const created = createProject({ name });
      const project = groundProjectInWorkspace(workspace, { projectId: created.project.id });
      json(res, 201, { project, workspace, activeProjectId: created.project.id });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const activateProjectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/activate$/);
  if (req.method === "POST" && activateProjectMatch) {
    try {
      const project = setActiveProject(decodeURIComponent(activateProjectMatch[1]));
      json(res, 200, { project, activeProjectId: project.id });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Identity + teams. Local-first stays the base: with no signed-in user every request resolves to the
  // founder, so a solo founder sees no login wall. Real multi-user auth rides on Convex in the other
  // lane; these routes only model identity-as-data and membership.

  // The current user and the teams they belong to. The personal team is created lazily so this never
  // returns an empty list for a fresh founder.
  if (req.method === "GET" && url.pathname === "/api/me") {
    try {
      const user = resolveCurrentUser({ request: req });
      ensurePersonalTeam(user, { request: req });
      json(res, 200, { user, teams: teamsForUser(user.userId, { request: req }) });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/teams") {
    try { json(res, 200, { teams: listTeams() }); }
    catch (err) { json(res, 500, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/teams") {
    try {
      const body = await readBody(req);
      const team = createTeam({ ...body, owner: body.owner ?? resolveCurrentUser({ request: req }) }, { request: req });
      json(res, 201, { team });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const teamMatch = url.pathname.match(/^\/api\/teams\/([^/]+)$/);
  if (req.method === "GET" && teamMatch) {
    try { json(res, 200, { team: getTeam(decodeURIComponent(teamMatch[1])) }); }
    catch (err) { json(res, 404, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const teamMembersMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/members$/);
  if (req.method === "GET" && teamMembersMatch) {
    try { json(res, 200, { members: listMembers(decodeURIComponent(teamMembersMatch[1])) }); }
    catch (err) { json(res, 404, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  if (req.method === "POST" && teamMembersMatch) {
    try {
      const body = await readBody(req);
      const team = addMember(decodeURIComponent(teamMembersMatch[1]), body);
      json(res, 201, { team, members: team.members });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Whether a user may clear a founder gate on a team (owner/approver yes, member no). The gate lane
  // reads this; the gate itself still owns the wall.
  const teamApproveMatch = url.pathname.match(/^\/api\/teams\/([^/]+)\/can-approve\/([^/]+)$/);
  if (req.method === "GET" && teamApproveMatch) {
    try {
      const teamId = decodeURIComponent(teamApproveMatch[1]);
      const userId = decodeURIComponent(teamApproveMatch[2]);
      json(res, 200, { teamId, userId, canApprove: canApprove(teamId, userId) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Fold duplicate projects into one (one project per repo). Records move; sources are dropped.
  if (req.method === "POST" && url.pathname === "/api/projects/merge") {
    try {
      const body = await readBody(req);
      const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds : [body.sourceId].filter(Boolean);
      mergeProjects(sourceIds, body.targetId, { projectId: body.targetId });
      json(res, 200, listProjects());
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Remove a project and purge its per-project stores. The last project can't be deleted.
  const deleteProjectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === "DELETE" && deleteProjectMatch) {
    try {
      deleteProject(decodeURIComponent(deleteProjectMatch[1]));
      json(res, 200, listProjects());
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // People — the keystone object, promoted from real run entrants. Read-only: the canvas reads
  // appearances, dedup, and fatigue from here; nothing here writes or sends.
  const projectPeopleMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/people$/);
  if (req.method === "GET" && projectPeopleMatch) {
    try {
      const projectId = decodeURIComponent(projectPeopleMatch[1]);
      json(res, 200, { projectId, people: listPeople(projectId) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const projectPersonMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/people\/([^/]+)$/);
  if (req.method === "GET" && projectPersonMatch) {
    try {
      const projectId = decodeURIComponent(projectPersonMatch[1]);
      const personId = decodeURIComponent(projectPersonMatch[2]);
      const person = getPerson(projectId, personId);
      if (!person) { json(res, 404, { error: `Person not found: ${personId}` }); return; }
      json(res, 200, { projectId, person });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // GTM Board — the nine belief layers (Strategy / Motion / Loop), derived purely from real state.
  // Read-only: it never writes, never triggers a run, and never gates one.
  const projectBoardMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/board$/);
  if (req.method === "GET" && projectBoardMatch) {
    try {
      const projectId = decodeURIComponent(projectBoardMatch[1]);
      // The board carries the nine belief layers PLUS the L0 ground: which ICP each pipeline tests.
      json(res, 200, { ...getBoard({ projectId }), icpGrouping: getPipelineIcpGrouping({ projectId }) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // "What happened" — the latest run's real numbers (what went out, and what joined back to it),
  // derived purely from real state and null where no run has happened. Read-only: it never writes,
  // never triggers a run, never gates one.
  const projectRunSummaryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/run-summary$/);
  if (req.method === "GET" && projectRunSummaryMatch) {
    try {
      const projectId = decodeURIComponent(projectRunSummaryMatch[1]);
      json(res, 200, { run: deriveRunSummary(projectId) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // The founder's manual outcome door — record what actually happened on a run plus the lesson, through
  // the existing outcome-ingest path (a Result + its Learning). Records what ALREADY happened; it never
  // sends, publishes, or runs anything, so the wall is untouched. Body: { runId, happened, learned }.
  const projectOutcomeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/outcome$/);
  if (req.method === "POST" && projectOutcomeMatch) {
    try {
      const projectId = decodeURIComponent(projectOutcomeMatch[1]);
      const body = (await readBody(req)) ?? {};
      recordFounderOutcome(projectId, { runId: body.runId ?? null, happened: body.happened, learned: body.learned }, { projectId });
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // GTM map — the read-only portfolio projection (the rebuilt engine's four record lists).
  // Returns product truths, market objects, GTM paths, and measurement contracts for the project;
  // the UI derives the ranked portfolio, its buckets, and each path's weak links in code. Pure read:
  // it lists already-persisted records, never writes, never triggers or gates a run.
  const projectGtmMapMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/gtm-map$/);
  if (req.method === "GET" && projectGtmMapMatch) {
    try {
      const projectId = decodeURIComponent(projectGtmMapMatch[1]);
      json(res, 200, {
        projectId,
        productTruths: productTruthStore.list({ projectId }),
        marketObjects: marketObjectStore.list({ projectId }),
        paths: gtmPathStore.list({ projectId }),
        contracts: measurementContractStore.list({ projectId }),
      });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Object graph — the phase-1 GTM graph projection. It reads the new object-graph store plus the
  // existing durable GTM records, derives weakness from real signals, and highlights exactly one
  // strongest current testable path. Opening a project may run the read-only product scan so the
  // graph is populated with cited product cards immediately; market research is scheduled behind it.
  const projectObjectGraphMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/object-graph$/);
  if (req.method === "GET" && projectObjectGraphMatch) {
    try {
      const projectId = decodeURIComponent(projectObjectGraphMatch[1]);
      const project = loadProject({ projectId });
      const scan = ensureObjectGraphProductScan(project, { projectId });
      if (scan.scanned || marketObjectStore.list({ projectId }).length === 0) {
        scheduleObjectGraphMarketFill(project, scan.report);
      }
      json(res, 200, {
        projectId,
        scanOnOpen: {
          scanned: scan.scanned,
          reason: scan.reason,
          created: scan.created?.length ?? 0,
          skipped: scan.skipped ?? 0,
        },
        ...objectGraphForProject(projectId, {
          expandRun: url.searchParams.get("expandRun"),
          includeRetired: url.searchParams.get("includeRetired") === "true",
        }),
      });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const projectObjectGraphPositionsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/object-graph\/positions$/);
  if (req.method === "POST" && projectObjectGraphPositionsMatch) {
    try {
      const projectId = decodeURIComponent(projectObjectGraphPositionsMatch[1]);
      loadProject({ projectId });
      const body = await readBody(req);
      const layout = objectGraphLayoutStore.merge(projectId, body?.positions ?? body ?? {});
      json(res, 200, { projectId, positions: layout.positions, savedAt: layout.updatedAt });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "POST" && projectObjectGraphMatch) {
    try {
      const projectId = decodeURIComponent(projectObjectGraphMatch[1]);
      const body = await readBody(req);
      const current = objectGraphStore.load(projectId);
      const applied = applyObjectGraphOperations(current, body?.operations ?? []);
      objectGraphStore.save(applied.graph, { projectId });
      json(res, 200, { projectId, changes: applied.changes, ...objectGraphForProject(projectId) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Compile a highlighted object-graph path through the existing run compiler and Wall. This route
  // translates the object path node back to the stored GTMPath id; a graph walk with no stored path is
  // not compiled in phase 1 because compile needs the existing run spine and gate primitive.
  const projectObjectGraphCompileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/object-graph\/compile$/);
  if (req.method === "POST" && projectObjectGraphCompileMatch) {
    try {
      const projectId = decodeURIComponent(projectObjectGraphCompileMatch[1]);
      const body = await readBody(req);
      const { graph, recommendation } = objectGraphForProject(projectId);
      const requestedPathId = String(body?.pathId || recommendation.highlighted?.[0]?.pathId || "").trim();
      const pathNode = graph.nodes.find((node) => node.id === requestedPathId || node.payload?.gtmPathId === requestedPathId);
      const gtmPathId = pathNode?.payload?.gtmPathId || (requestedPathId.startsWith("path-") ? requestedPathId : null);
      const recommendedPath = recommendation.rankedPaths?.find((path) => path.pathId === requestedPathId)
        || recommendation.highlighted?.[0]
        || null;
      const recommendedNodes = (recommendedPath?.nodeIds ?? [])
        .map((id) => graph.nodes.find((node) => node.id === id))
        .filter(Boolean);
      const injectedPath = gtmPathId ? null : {
        id: requestedPathId || `graph-${Date.now()}`,
        projectId,
        summary: recommendedNodes.map((node) => node.statement).filter(Boolean).slice(0, 3).join(" → ") || "Highlighted graph path",
        bet: {
          buyer: recommendedNodes.find((node) => node.domain === "market" && ["buyer", "icp"].includes(node.type))?.statement,
          channel: recommendedNodes.find((node) => node.type === "channel")?.statement,
          offer: recommendedNodes.find((node) => node.type === "offer" || node.type === "value_prop")?.statement,
          message: recommendedNodes.find((node) => node.type === "message" || node.type === "positioning")?.statement,
          proof: recommendedNodes.find((node) => node.domain === "product" || node.type === "proof_point")?.statement,
        },
        restsOn: recommendedNodes
          .map((node) => {
            const sourceId = node.payload?.productTruthId || node.payload?.marketObjectId || node.originRef;
            if (!sourceId) return null;
            const type = node.domain === "product" ? "productTruth" : node.domain === "market" || node.domain === "strategy" ? "marketObject" : null;
            return type ? { type, id: sourceId } : null;
          })
          .filter(Boolean),
        status: "selected",
      };
      const project = loadProject({ projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const result = await compileRunFromPath({
        projectId,
        pathId: gtmPathId,
        path: injectedPath,
        runPlan: body?.runPlan ?? null,
        input: body?.input ?? null,
        output: body?.output ?? null,
        compose: createClaudeComposer({ cwd: repo }),
      });
      json(res, 200, { projectId, ...result });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Ideate provisional object candidates off one selected card + a plain founder target ("new buyers",
  // "new offers", a free prompt). This calls the SAME live grounded generator the ideas/round route uses
  // (createClaudeIdeaGenerator on the founder's subscription), frames a goal from the selected card's
  // statement and the product grounding, and maps each returned idea to a decidable candidate object.
  // It persists NOTHING and sends nothing — candidates stay provisional until the founder accepts one.
  const projectObjectGraphIdeateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/object-graph\/ideate$/);
  if (req.method === "POST" && projectObjectGraphIdeateMatch) {
    try {
      const projectId = decodeURIComponent(projectObjectGraphIdeateMatch[1]);
      const body = await readBody(req);
      const target = String(body?.target || "").trim();
      if (!target) { json(res, 400, { error: "Ideation needs a target — what kind of new card to explore." }); return; }
      const project = loadProject({ projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const sourceNodeId = String(body?.sourceNodeId || "").trim() || null;
      const source = sourceNodeId
        ? (objectGraphStore.load(projectId).nodes.find((node) => node.id === sourceNodeId) || null)
        : null;
      const candidates = await ideateObjectCandidates({
        target,
        source,
        grounding: buildRunGrounding(project),
        generate: createClaudeIdeaGenerator({ cwd: repo }),
      });
      json(res, 200, { candidates });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Streaming twin of the ideate route: the founder WATCHES Claude think. Same live grounded generator,
  // but the object-ideate variant narrates its reasoning in plain words first, and we stream those text
  // deltas to the chat as `reasoning` events before emitting the `candidates` at the end. Real streaming
  // off the founder's subscription — no fake ticker. Persists nothing, sends nothing.
  const projectObjectGraphIdeateStreamMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/object-graph\/ideate\/stream$/);
  if (req.method === "POST" && projectObjectGraphIdeateStreamMatch) {
    let body;
    try {
      body = await readBody(req);
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); return; }
    const target = String(body?.target || "").trim();
    if (!target) { json(res, 400, { error: "Ideation needs a target — what kind of new card to explore." }); return; }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const send = (event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); };

    try {
      const projectId = decodeURIComponent(projectObjectGraphIdeateStreamMatch[1]);
      const project = loadProject({ projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const sourceNodeId = String(body?.sourceNodeId || "").trim() || null;
      const source = sourceNodeId
        ? (objectGraphStore.load(projectId).nodes.find((node) => node.id === sourceNodeId) || null)
        : null;
      // The generator's onText forwards each model text delta straight into the chat as it writes — this
      // is the real "watch it think" stream. The frontend stops appending at the JSON fence so only the
      // plain reasoning shows; the candidates are parsed from the fenced block by ideateObjectCandidates.
      const generate = createClaudeObjectIdeaGenerator({
        cwd: repo,
        onText: (delta) => send({ type: "reasoning", text: delta }),
      });
      const candidates = await ideateObjectCandidates({
        target,
        source,
        grounding: buildRunGrounding(project),
        generate,
      });
      send({ type: "candidates", candidates });
    } catch (err) {
      send({ type: "ideate_error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
    return;
  }

  // Reopen a staged compiled run's founder gate. Pure read: projects the run's staged items into the
  // review cards the UI reopens (same gateReviewForRun the compile route returns), so a founder can come
  // back to a run staged earlier and decide it. It approves nothing and sends nothing.
  const projectRunGateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runs\/([^/]+)\/gate$/);
  if (req.method === "GET" && projectRunGateMatch) {
    try {
      const projectId = decodeURIComponent(projectRunGateMatch[1]);
      const runId = decodeURIComponent(projectRunGateMatch[2]);
      const run = runStore.get(runId, { projectId });
      json(res, 200, { projectId, ...gateReviewForRun(run) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Approve a staged compiled run at the founder gate and RELEASE it through the same engine (not a
  // parallel runtime). The founder's per-item decisions (approve / reject / edit) drive the gate; the
  // approved items continue downstream to the execute node, which stages them LOCALLY by default and
  // never sends. The wall is untouched — only items the founder approved carry `approved`, and the run
  // is persisted back onto the runStore record while recordRunDerivations fires the taste / people /
  // experiment / idea / outcome loop exactly as an operator run does.
  const projectRunApproveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runs\/([^/]+)\/approve$/);
  if (req.method === "POST" && projectRunApproveMatch) {
    try {
      const projectId = decodeURIComponent(projectRunApproveMatch[1]);
      const runId = decodeURIComponent(projectRunApproveMatch[2]);
      const body = (await readBody(req)) ?? {};
      const project = loadProject({ projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const { run, gate, result } = await approveCompiledRun({
        projectId,
        runId,
        decisions: body.decisions && typeof body.decisions === "object" ? body.decisions : {},
        approvals: body.approvals && typeof body.approvals === "object" ? body.approvals : {},
        // The same runtime dependencies executeGraphRun assembles for an operator run, so a released
        // compiled run grounds on the researched buyer picture and product truths and runs its open steps.
        stepRuntime: liveStepRuntime({ cwd: repo }),
        market: buildMarketContext(marketObjectStore.list({ projectId })),
        grounding: buildRunGrounding(project),
        loadLastRunItems: createDerivedSourceLoader({ projectId }),
        options: { projectId },
      });
      json(res, 200, { projectId, run, gate, ok: result.ok, pendingGates: result.pendingGates });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Market research ritual — the buyer-side twin of scanning the repo (GTM-ENGINE-REBUILD Phase 1).
  // The founder invokes it for a project; rented intelligence host-side (like derive_product_model)
  // researches who buys and where they gather and persists the MarketObjects, then a plain-language
  // summary comes back. Honest-blank when no live Claude is connected — it never fabricates a buyer.
  // Read-only against the outside world: it researches and stores; it never sends, publishes, or charges.
  const projectMarketResearchMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/market-research$/);
  if (req.method === "POST" && projectMarketResearchMatch) {
    try {
      const projectId = decodeURIComponent(projectMarketResearchMatch[1]);
      const project = loadProject({ projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      // Ground the PRODUCT-truth side from the scan while researching the buyer side, so the map rests
      // on both truths (product facts + market objects), not "0 product facts". Best-effort, idempotent.
      groundProductTruthsForProject(project, projectId);
      const grounding = buildRunGrounding(project);
      const founderInputs = founderInputsFromSharedContext(project.sharedContext);
      const connected = !!selectRuntime({}).adapter;
      const { ok, objects, meta } = await runMarketResearch({
        // Live generator when Claude is connected; the module's honest-blank default otherwise.
        generator: connected ? createClaudeMarketResearcher({ cwd: repo }) : undefined,
        projectId,
        grounding,
        founderInputs,
      });
      json(res, 200, {
        projectId,
        ok,
        objects,
        count: objects.length,
        summary: marketResearchSummary(project, objects, meta),
        meta: { ...meta, connected },
      });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Per-layer market research — the steerable twin of the whole-picture ritual above. Instead of the
  // model guessing every buyer facet at once, the founder builds the picture ONE kind at a time: this
  // researches candidates for the NEXT kind only, grounded on the kinds already settled (their picks so
  // far). It returns a spread the founder chooses between and PERSISTS NOTHING — the pick alone reaches
  // the store, through the same market-research persistence path, and shows up as a domain:"market" node.
  // Read-only against the outside world, exactly like run_market_research: it researches, never sends.
  const projectMarketLayerMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/market-layer$/);
  if (req.method === "POST" && projectMarketLayerMatch) {
    try {
      const projectId = decodeURIComponent(projectMarketLayerMatch[1]);
      const body = await readBody(req);
      const project = loadProject({ projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      // The founder's already-settled picks ground the next layer. Default to what is stored when the
      // caller sends nothing, so the next facet rests on the picture built so far. `kind` is optional —
      // omit it to take the next hinted facet, or name any kind (on or off the hint list) to steer.
      const upstream = Array.isArray(body?.upstream)
        ? body.upstream
        : marketObjectStore.list({ projectId });
      const grounding = buildRunGrounding(project);
      const founderInputs = founderInputsFromSharedContext(project.sharedContext);
      const connected = !!selectRuntime({}).adapter;
      const { ok, kind, candidates, meta } = await researchMarketLayer({
        // Live per-layer generator when Claude is connected; the module's honest-blank default otherwise.
        generator: connected ? createClaudeMarketLayerResearcher({ cwd: repo }) : undefined,
        projectId,
        kind: body?.kind ?? null,
        upstream,
        grounding,
        founderInputs,
      });
      json(res, 200, {
        projectId,
        ok,
        kind,
        candidates,
        count: candidates.length,
        meta: { ...meta, connected },
      });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Persist ONE picked market-layer candidate. The per-layer flow above researches a spread and stores
  // nothing; when the founder picks (or sharpens) one facet, this is the door that commits just that one
  // to the store, so it lands as a domain:"market" node on the graph. Research only — it never sends.
  const projectMarketObjectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/market-object$/);
  if (req.method === "POST" && projectMarketObjectMatch) {
    try {
      const projectId = decodeURIComponent(projectMarketObjectMatch[1]);
      const body = await readBody(req);
      const object = body?.object;
      if (!object || typeof object !== "object") { json(res, 400, { error: "a picked market object is required" }); return; }
      const stored = marketObjectStore.create({ ...object, projectId }, {});
      json(res, 200, { projectId, object: stored });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }


  // Outcomes — the Result-based report (GTM-ENGINE-REBUILD Phase 5). Replaces the legacy
  // systems/channels outcome view: it folds the run ledger and the joined Results into a per-path
  // picture in plain language, honest about what is unmeasured. Pure read: never writes, never sends.
  const projectOutcomesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/outcomes$/);
  if (req.method === "GET" && projectOutcomesMatch) {
    try {
      const projectId = decodeURIComponent(projectOutcomesMatch[1]);
      json(res, 200, outcomeReport({ projectId }));
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // The outcome door — record what actually happened (GTM-ENGINE-REBUILD Phase 5, the write route).
  // A founder (or a connected source) posts one outcome or a batch; it JOINS on the item's joinKey back
  // to the run + path that produced it and lands a Result the GET report then reads. This records what
  // ALREADY happened — it never sends, publishes, or runs anything, so the wall is untouched. A single
  // outcome is `{ joinKey, outcomeKind, value, source, observedAt }`; a batch is either
  // `{ outcomes: [...] }` (each stamped founder-entered unless it names its own source) or
  // `{ sources: { <label>: [...] } }`.
  if (req.method === "POST" && projectOutcomesMatch) {
    try {
      const projectId = decodeURIComponent(projectOutcomesMatch[1]);
      const body = (await readBody(req)) ?? {};
      let result;
      if (body.sources && typeof body.sources === "object") {
        result = ingestBatch({ projectId, sources: body.sources }, { projectId });
      } else if (Array.isArray(body.outcomes)) {
        // A flat list defaults to the founder-entered source; any outcome naming its own source wins.
        result = ingestBatch(
          { projectId, sources: { [OUTCOME_SOURCES.founderEntered]: body.outcomes } },
          { projectId },
        );
      } else {
        const source = body.source ?? OUTCOME_SOURCES.founderEntered;
        result = ingestOutcome({ ...body, source, projectId }, { projectId });
      }
      json(res, 200, result);
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Promote a proven run into a repeatable motion (GTM-ENGINE-REBUILD Phase 6) — the founder's one
  // light touch. THE WALL IS UNTOUCHED: a promoted motion re-stages fresh runs at the founder gate on
  // cadence and never sends. An absent/unparseable cadence leaves the motion manual (fires only when
  // asked). This wraps a run that already worked; it never composes or sends anything.
  const projectRunPromoteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runs\/([^/]+)\/promote$/);
  if (req.method === "POST" && projectRunPromoteMatch) {
    try {
      const projectId = decodeURIComponent(projectRunPromoteMatch[1]);
      const runId = decodeURIComponent(projectRunPromoteMatch[2]);
      const body = await readBody(req);
      const { motion, learning } = promoteRun(runId, { cadence: body?.cadence ?? null }, { projectId });
      json(res, 200, { motion, learning, summary: promoteSummary(motion) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // L1 — one pipeline's belief spine: the five faces (Who / What you say / Who you reached / Did it
  // work / Verdict) derived purely from THIS pipeline's real state. Read-only: never writes, never
  // triggers or gates a run.
  const projectPipelineSpineMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/pipelines\/([^/]+)\/spine$/);
  if (req.method === "GET" && projectPipelineSpineMatch) {
    try {
      const projectId = decodeURIComponent(projectPipelineSpineMatch[1]);
      const channelId = decodeURIComponent(projectPipelineSpineMatch[2]);
      json(res, 200, getPipelineBeliefSpine({ projectId, channelId }));
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Stated experiment — the founder (or the operator as a SUGGESTION the founder confirms) GROUPS
  // existing motions into the arms of one belief test. Post-hoc context, never a precondition and never
  // a gate: it records a relationship, it does not block, trigger, or shape any run, and it NEVER sets a
  // verdict. Grouping is founder-confirmed, never auto-inferred from channel-name similarity.
  const projectExperimentsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/experiments$/);
  if (req.method === "POST" && projectExperimentsMatch) {
    try {
      const projectId = decodeURIComponent(projectExperimentsMatch[1]);
      const body = await readBody(req);
      const saved = upsertStatedExperiment({ projectId, experiment: body?.experiment ?? body });
      json(res, 200, saved);
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Suggested verdict — a deterministic READ of the outcome ledger that PROPOSES a verdict from observed
  // results against the experiment's success criteria. It never writes: the founder accepts by POSTing to
  // the verdict route below (with provenance "derived"). This is the "3 signups observed — keep?" prompt.
  const projectSuggestVerdictMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/experiments\/([^/]+)\/suggested-verdict$/,
  );
  if (req.method === "GET" && projectSuggestVerdictMatch) {
    try {
      const projectId = decodeURIComponent(projectSuggestVerdictMatch[1]);
      const experimentId = decodeURIComponent(projectSuggestVerdictMatch[2]);
      json(res, 200, suggestVerdictFromOutcomes({ experimentId, projectId }));
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Belief write-back — the founder resolves an experiment with a verdict. STRICTLY post-gate: this only
  // records a decision the founder has already made; it never gates or triggers a run.
  const projectVerdictMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/experiments\/([^/]+)\/verdict$/);
  if (req.method === "POST" && projectVerdictMatch) {
    try {
      const projectId = decodeURIComponent(projectVerdictMatch[1]);
      const experimentId = decodeURIComponent(projectVerdictMatch[2]);
      const body = await readBody(req);
      const saved = applyExperimentVerdict({ projectId, experimentId, verdict: body?.verdict ?? body });
      json(res, 200, { experiments: saved.sharedContext.experiments, updatedAt: saved.updatedAt });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Clarity — the durable output of an Ideate thinking-posture conversation, pinned onto the canvas by
  // the founder as a claim / direction / icp / question. Real GTM state captured from the founder's
  // own pins, never seeded. List, pin one, unpin one.
  const projectClarityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/clarity$/);
  if (req.method === "GET" && projectClarityMatch) {
    try {
      const projectId = decodeURIComponent(projectClarityMatch[1]);
      json(res, 200, { items: loadClarity(projectId) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (req.method === "POST" && projectClarityMatch) {
    try {
      const body = await readBody(req);
      const projectId = decodeURIComponent(projectClarityMatch[1]);
      json(res, 200, { item: addClarity(projectId, body ?? {}) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const projectClarityItemMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/clarity\/([^/]+)$/);
  if (req.method === "DELETE" && projectClarityItemMatch) {
    try {
      const projectId = decodeURIComponent(projectClarityItemMatch[1]);
      const itemId = decodeURIComponent(projectClarityItemMatch[2]);
      const removed = removeClarity(projectId, itemId);
      if (!removed) { json(res, 404, { error: `Clarity object not found: ${itemId}` }); return; }
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Inputs — the world-signal inbox (inputs-store.mjs). These routes only CAPTURE: a captured input lands
  // 'unrouted' and nothing more happens. Routing it into a run, a person, or an experiment is a separate,
  // downstream founder/operator act that still hits the gate. Ingestion NEVER sends, runs, routes, or
  // auto-approves — it is the front door of the inbox, not a trigger.
  const projectInputsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/inputs$/);
  if (req.method === "GET" && projectInputsMatch) {
    try {
      const projectId = decodeURIComponent(projectInputsMatch[1]);
      const status = url.searchParams.get("status") || undefined;
      const kind = url.searchParams.get("kind") || undefined;
      const source = url.searchParams.get("source") || undefined;
      json(res, 200, { projectId, inputs: listInputs(projectId, { status, kind, source }) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Webhook — append ONE world signal (a commit, a signup, a reply, a star). Body names the kind and
  // source; provenance defaults to a webhook stamp. The record lands 'unrouted'; appendInput forces that
  // status, so a webhook can never push a signal past the inbox into a run.
  if (req.method === "POST" && projectInputsMatch) {
    try {
      const projectId = decodeURIComponent(projectInputsMatch[1]);
      const body = await readBody(req);
      const input = appendInput(projectId, {
        kind: body?.kind,
        source: body?.source,
        payload: body?.payload ?? {},
        provenance: body?.provenance ?? { source: "webhook", via: "POST /api/projects/:id/inputs" },
        receivedAt: body?.receivedAt,
      });
      json(res, 201, { input });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // CSV drop — parse a dropped/pasted spreadsheet into N inputs, one per data row. Body is raw CSV text;
  // default kind/source come from the query string (`?kind=signup&source=landing-page`), a per-row
  // kind/source column overrides them. Every row lands 'unrouted' — a 500-row file imports 500 captured
  // signals and triggers nothing.
  const projectInputsCsvMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/inputs\/csv$/);
  if (req.method === "POST" && projectInputsCsvMatch) {
    try {
      const projectId = decodeURIComponent(projectInputsCsvMatch[1]);
      const text = await readRawBody(req);
      const descriptors = parseInputsCsv(text, {
        kind: url.searchParams.get("kind") || undefined,
        source: url.searchParams.get("source") || "csv-import",
      });
      if (!descriptors.length) { json(res, 400, { error: "No CSV data rows found (need a header row plus at least one row)." }); return; }
      const provenance = { source: "csv-drop", via: "POST /api/projects/:id/inputs/csv" };
      const inputs = descriptors.map((d) => appendInput(projectId, { ...d, provenance }));
      json(res, 201, { count: inputs.length, inputs });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // GitHub pull-signals — the host hook for the gtm-signal-github scout's output. The agent lists recent
  // stargazers / forkers / issue-openers on the founder's repos (read-only, never sends); its found
  // signals POST here and become captured inputs stamped provenance source='gtm-signal-github'. Each lands
  // 'unrouted' — ingesting a pull-signal never replies to it, never runs a workflow, never routes.
  const projectGithubSignalsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/inputs\/github-signals$/);
  if (req.method === "POST" && projectGithubSignalsMatch) {
    try {
      const projectId = decodeURIComponent(projectGithubSignalsMatch[1]);
      const body = await readBody(req);
      const signals = Array.isArray(body?.signals) ? body.signals : (Array.isArray(body) ? body : []);
      if (!signals.length) { json(res, 400, { error: "No github signals provided (expected { signals: [...] })." }); return; }
      const inputs = signals.map((signal) =>
        appendInput(projectId, githubSignalToInput(signal, { runId: body?.runId })));
      json(res, 201, { count: inputs.length, inputs });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Route the inbox — the EXPLICIT, separate door that turns captured signals into action. It is its own
  // route precisely so ingestion stays pure: capturing a signal never routes it; only this call does. For
  // each still-unrouted input the pure router decides one of three things and the actor (input-routing.mjs)
  // acts: a channel match is recorded against the channel, an ambient-wake drives a standing-brief operator
  // session TO THE FOUNDER GATE and stops, and anything else is set aside. THE WALL HOLDS: the only run this
  // can start is an ambient wake, which composes and runs only to the gate — nothing sends, deploys, or
  // auto-approves. (No model-backed wake scorer is wired here, so the router's blank default refuses to
  // wake; a flow match or an ignore is all this door does until a scorer is injected.)
  const projectInputsRouteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/inputs\/route$/);
  if (req.method === "POST" && projectInputsRouteMatch) {
    try {
      const projectId = decodeURIComponent(projectInputsRouteMatch[1]);
      const body = await readBody(req);
      // Per-input founder decision: the inbox's quiet "route this one to a channel/flow, or set it
      // aside." markRouted ONLY records the decision on the append-only record — it never runs, sends,
      // or auto-approves. Any run a routed signal later feeds still hits the founder gate. With no
      // inputId the call falls through to the bulk router below (unchanged).
      if (body && typeof body.inputId === "string" && body.inputId.trim()) {
        const target = body.ignore === true ? "ignored" : body.routedTo;
        const input = markRouted(projectId, body.inputId, target);
        json(res, 200, { input });
        return;
      }
      const results = routeUnroutedInputs(projectId);
      json(res, 200, {
        count: results.length,
        results: results.map((r) => ({ inputId: r.input.id, route: r.decision.route, sessionId: r.sessionId ?? null })),
      });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Ideas — the durable home for graded ideation output (idea-store.mjs). This is the FOUNDER door:
  // list what was generated, kill the weak ones, keep the strong ones, and trigger a fresh round. Killing
  // and keeping are founder acts — they bank an IdeaKill / IdeaKeep FeedbackSignal so idea-taste rides the
  // feedback rail. These routes are deliberately ABSENT from the MCP agent surface: the generator never
  // grades, kills, or keeps its own ideas — only the founder does.
  const projectIdeasMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ideas$/);
  if (req.method === "GET" && projectIdeasMatch) {
    try {
      const projectId = decodeURIComponent(projectIdeasMatch[1]);
      const goal = url.searchParams.get("goal");
      const ideas = listGtmIdeas({ projectId })
        .filter((idea) => !goal || idea.goal === goal);
      json(res, 200, { ideas });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Trigger an ideation round for a goal — delegates to the ideate path (composeIdeas): derive this
  // goal's own angles, generate wide across them, measure distinctiveness, then a SEPARATE bar grades
  // the survivors. Each graded idea is persisted as a durable GtmIdea (cut ideas keep their plain cut
  // reason). Nothing sends; this only generates and grades.
  const projectIdeaRoundMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ideas\/round$/);
  if (req.method === "POST" && projectIdeaRoundMatch) {
    try {
      const projectId = decodeURIComponent(projectIdeaRoundMatch[1]);
      const body = await readBody(req);
      const goal = String(body?.goal || "").trim();
      if (!goal) { json(res, 400, { error: "An ideation round needs a goal." }); return; }
      const project = loadProject({ projectId });
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const result = await composeIdeas({
        goal,
        grounding: buildRunGrounding(project),
        proposeAngles: createClaudeAngleProposer({ cwd: repo }),
        generate: createClaudeIdeaGenerator({ cwd: repo }),
        bar: createClaudeIdeaBar({ cwd: repo }),
      });
      const ideas = result.ideas.map((graded) => createGtmIdea({
        projectId,
        goal,
        angle: graded.angle,
        pitch: graded.pitch,
        what: graded.what,
        upside: graded.upside,
        risk: graded.risk,
        take: graded.take,
        killReason: graded.killReason,
        barScore: graded.barScore,
        axes: graded.axes,
        verdict: graded.verdict,
        killed: graded.killed,
      }));
      json(res, 200, { ideas, distinctiveness: result.distinctiveness, regenerated: result.regenerated });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Kill an idea — a FOUNDER act. The idea is marked dead in its durable store AND an IdeaKill
  // FeedbackSignal is banked on the feedback rail. A kill is dead, not deprioritized.
  const projectIdeaKillMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ideas\/([^/]+)\/kill$/);
  if (req.method === "POST" && projectIdeaKillMatch) {
    try {
      const projectId = decodeURIComponent(projectIdeaKillMatch[1]);
      const ideaId = decodeURIComponent(projectIdeaKillMatch[2]);
      const idea = getGtmIdea(ideaId);
      const updated = saveGtmIdea({ ...idea, verdict: "killed", killed: true });
      recordIdeaDecisions({ projectId, decisions: [{ idea: updated, decision: "kill" }] }, { projectId });
      json(res, 200, { idea: updated });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Keep an idea — a FOUNDER act that affirms a survivor and banks an IdeaKeep FeedbackSignal. It refuses
  // to keep a killed idea: a kill is dead, and keep never resurrects it.
  const projectIdeaKeepMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ideas\/([^/]+)\/keep$/);
  if (req.method === "POST" && projectIdeaKeepMatch) {
    try {
      const projectId = decodeURIComponent(projectIdeaKeepMatch[1]);
      const ideaId = decodeURIComponent(projectIdeaKeepMatch[2]);
      const idea = getGtmIdea(ideaId);
      if (idea.killed) {
        json(res, 409, { error: `GtmIdea ${ideaId} was killed; a killed idea is not kept.` });
        return;
      }
      const updated = saveGtmIdea({ ...idea, verdict: "survived", killed: false });
      recordIdeaDecisions({ projectId, decisions: [{ idea: updated, decision: "keep" }] }, { projectId });
      json(res, 200, { idea: updated });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Channel autonomy — PROMOTE a channel up the ladder (draft → trusted → autonomous). This is a FOUNDER
  // act and the standing form of a gate approval: from now on the channel's gate auto-approves the clean
  // items against the blessed pattern and holds only the exceptions. It is never reachable from the agent
  // (MCP) surface and never fired by a run. The Wall does NOT disappear — the gate node stays present on
  // every path, the promotion is itself an explicit founder click, and `revoke` drops it back in one call.
  // promoteChannel itself refuses a missing blessed pattern and refuses a promote-to-draft; we reject the
  // draft target here too, loudly, so the founder gets a clear message instead of a generic throw.
  const projectChannelPromoteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/channels\/([^/]+)\/promote$/);
  if (req.method === "POST" && projectChannelPromoteMatch) {
    try {
      const projectId = decodeURIComponent(projectChannelPromoteMatch[1]);
      const channelId = decodeURIComponent(projectChannelPromoteMatch[2]);
      const body = await readBody(req);
      const autonomy = String(body?.autonomy || "trusted").trim();
      if (autonomy === "draft") {
        json(res, 400, { error: "Promote targets trusted or autonomous. To drop a channel back to draft, use revoke." });
        return;
      }
      if (!body?.blessedPattern) {
        json(res, 400, { error: "Promoting a channel requires a blessed pattern — the standing approval the gate applies." });
        return;
      }
      const { channel } = promoteChannel(channelId, { autonomy, blessedPattern: body.blessedPattern }, { projectId });
      json(res, 200, { channel });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Channel autonomy — REVOKE: drop a channel back to "draft" in one call, instantly reverting to
  // hold-everything at the gate and clearing the standing pattern off its gate nodes. Always available;
  // the founder can revoke trust the moment a run surprises them. Also a founder act, never an agent path.
  const projectChannelRevokeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/channels\/([^/]+)\/revoke$/);
  if (req.method === "POST" && projectChannelRevokeMatch) {
    try {
      const projectId = decodeURIComponent(projectChannelRevokeMatch[1]);
      const channelId = decodeURIComponent(projectChannelRevokeMatch[2]);
      const { channel } = revokeChannel(channelId, { projectId });
      json(res, 200, { channel });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // "Which flows need you" — the read side of the Wall. Every operator session currently PAUSED at a
  // founder gate across this project (a goal thread and an ambient wake both surface here when their run
  // stops). Strictly READ-ONLY: it never approves, resolves, or advances a gate — it only tells the
  // founder where their approval is the blocker. Ordered most-recently-updated first.
  const projectNeedsYouMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/needs-you$/);
  if (req.method === "GET" && projectNeedsYouMatch) {
    try {
      const projectId = decodeURIComponent(projectNeedsYouMatch[1]);
      json(res, 200, { projectId, flows: listFlowsNeedingFounder({ projectId }) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Microproduct build-and-ship door — the deployable twin of compose_and_run. It delegates to the
  // operator's compose_microproduct path: a read-only, scan-grounded producer cuts a working artifact
  // from the real product, the host composes a graph whose deploy step is an `execute` node behind a
  // founder `gate`, and the run STOPS at that gate. Nothing deploys: the deploy connector ships only with
  // BOTH the gate stamp AND an explicit founder deploy confirmation, neither of which this route can forge.
  // A goal is required — this is the founder input the door represents; without it we refuse.
  const projectMicroproductMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/microproduct$/);
  if (req.method === "POST" && projectMicroproductMatch) {
    try {
      const projectId = decodeURIComponent(projectMicroproductMatch[1]);
      const body = await readBody(req);
      const goal = String(body?.goal || "").trim();
      if (!goal) { json(res, 400, { error: "A microproduct needs a goal — what should the artifact do?" }); return; }
      const project = loadProject({ projectId });
      const session = createOperatorSession({ goal, projectId: project.id });
      const result = await executeOperatorTool(session, { name: "compose_microproduct", input: { goal, title: body?.title } });
      json(res, 202, {
        session: publicOperatorSession(result.session),
        staged: result.result ?? null,
        pause: result.pause === true,
      });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Cross-reference index — "where does X appear across channels" for person / icp / claim / experiment.
  const projectReferencesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/references$/);
  if (req.method === "GET" && projectReferencesMatch) {
    try {
      const projectId = decodeURIComponent(projectReferencesMatch[1]);
      const kind = url.searchParams.get("kind");
      const id = url.searchParams.get("id");
      json(res, 200, findReferences(projectId, { kind, id }));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Shared kernel — the project's real cross-pipeline object model in one read: durable People (with
  // their pipeline appearances + fatigue), the stated + founder-linked ICPs, and the structured Claims,
  // each pointing at the pipelines that carry it. Read-only; honest-blind on an empty project.
  const projectSharedMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/shared$/);
  if (req.method === "GET" && projectSharedMatch) {
    try {
      const projectId = decodeURIComponent(projectSharedMatch[1]);
      json(res, 200, listSharedKernel(projectId));
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Explicit pipeline→ICP link — the founder-set counterpart to experiment-derived ICP grounds. POST
  // sets the link ({ key, label? }); DELETE (or POST with no/blank key) clears it back to the base ICP
  // ground. Typed and reversible; it writes ONLY the channel's `icp` link and NEVER autonomy/blessedPattern,
  // so linking an ICP can never move a pipeline up the wall.
  const projectChannelIcpMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/channels\/([^/]+)\/icp$/);
  if ((req.method === "POST" || req.method === "DELETE") && projectChannelIcpMatch) {
    try {
      const projectId = decodeURIComponent(projectChannelIcpMatch[1]);
      const channelId = decodeURIComponent(projectChannelIcpMatch[2]);
      const icp = req.method === "DELETE" ? null : await readBody(req);
      const { channel } = setChannelIcp(channelId, icp, { projectId });
      json(res, 200, { channel });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Channel feeds — undirected linkage between channels that share the same people, claims, or
  // experiment variables. One feed per channel pair, sorted by total shared entities descending.
  const projectChannelFeedsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/channel-feeds$/);
  if (req.method === "GET" && projectChannelFeedsMatch) {
    try {
      const projectId = decodeURIComponent(projectChannelFeedsMatch[1]);
      const { feeds } = deriveChannelFeeds(projectId);
      json(res, 200, { feeds });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Directional feeds — the founder-drawn links where one channel pulls another channel's output.
  const projectDirectedFeedsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/directed-feeds$/);
  if (req.method === "GET" && projectDirectedFeedsMatch) {
    try {
      const projectId = decodeURIComponent(projectDirectedFeedsMatch[1]);
      const { feeds } = deriveDirectedFeeds(projectId, { projectId });
      json(res, 200, { feeds });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/project") {
    try {
      json(res, 200, { project: getProjectWithChannels() });
    } catch (err) { json(res, 500, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/project/context") {
    const project = loadProject();
    // The `contacts` stub is now backed by the durable Person store. We surface People as a derived,
    // read-only field on shared context (never persisted into the project file, so it can never be
    // seeded) while keeping the legacy `contacts` shape intact for existing readers.
    const people = listPeople(project.id);
    json(res, 200, { sharedContext: { ...project.sharedContext, people } }); return;
  }

  if (req.method === "POST" && url.pathname === "/api/project/context") {
    try {
      const body = await readBody(req);
      const project = updateSharedContext(body.patch ?? body);
      json(res, 200, { sharedContext: project.sharedContext, updatedAt: project.updatedAt });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/project/active-channel") {
    try {
      const body = await readBody(req);
      const project = setActiveChannel(body.channelId);
      json(res, 200, { activeChannelId: project.activeChannelId });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/project/active-workflow") {
    try {
      const body = await readBody(req);
      const project = setActiveWorkflow(body.workflowId ?? body.channelId);
      json(res, 200, { activeWorkflowId: project.activeChannelId, activeChannelId: project.activeChannelId });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }


  // Living Product Picture — the founder-editable interpretation aggregate. Three state-changing
  // commands funnel through executeDomainCommand (the single chokepoint), plus a read. derive injects
  // the live createClaudeProductModeler generator; revise/signal are pure host state moves. This is
  // Door 1 (human HTTP); the brain MCP is an HTTP client to these routes, so they exist first.
  if (req.method === "GET" && url.pathname === "/api/product-model") {
    try {
      const project = loadProject();
      json(res, 200, { productModel: getProductModel(project.id) ?? null });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/product-model/derive") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const productModel = await executeDomainCommand("DeriveProductModel", {
        ...body,
        projectId: project.id,
      }, { projectId: project.id, generate: createClaudeProductModeler({ cwd: repo }) });
      json(res, 200, { productModel });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/product-model/revise") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const productModel = await executeDomainCommand("ReviseProductModel", {
        ...body,
        projectId: project.id,
      }, { projectId: project.id });
      json(res, 200, { productModel });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/product-model/signal") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const productModel = await executeDomainCommand("RecordProductSignal", {
        ...body,
        projectId: project.id,
      }, { projectId: project.id });
      json(res, 200, { productModel });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }



  if (req.method === "POST" && url.pathname === "/api/channels") {
    try {
      const body = await readBody(req);
      json(res, 201, createChannel(body));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const duplicateChannelMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/duplicate$/);
  if (req.method === "POST" && duplicateChannelMatch) {
    try {
      const body = await readBody(req);
      json(res, 201, duplicateChannel(decodeURIComponent(duplicateChannelMatch[1]), body));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const updateChannelMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/update$/);
  if (req.method === "POST" && updateChannelMatch) {
    try {
      const body = await readBody(req);
      json(res, 200, updateChannel(decodeURIComponent(updateChannelMatch[1]), body));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const channelMatch = url.pathname.match(/^\/api\/channels\/([^/]+)$/);
  if (req.method === "GET" && channelMatch) {
    try {
      const project = loadProject();
      const channel = getChannel(project, decodeURIComponent(channelMatch[1]));
      const flow = loadFlow(channel.graphId, null);
      json(res, 200, {
        channel,
        graph: applySharedContextToGraph(flow.graph, project.sharedContext, { channelOffer: channel.offer ?? null }),
        runs: flow.runs.slice(-10).map((run) => run.result),
      });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Drag-to-connect: wire this channel's source to pull from ANOTHER channel's output. Sets the
  // source node's config.sourceChannelId (the "derived" mode), validates, and persists. Read-only at
  // run time and still behind the founder gate — it only declares where the channel's input comes from.
  const channelDeriveMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/derive$/);
  if (req.method === "POST" && channelDeriveMatch) {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const channel = getChannel(project, decodeURIComponent(channelDeriveMatch[1]));
      const sourceChannelId = typeof body.sourceChannelId === "string" ? body.sourceChannelId : "";
      if (!sourceChannelId) { json(res, 400, { error: "sourceChannelId is required." }); return; }
      if (sourceChannelId === channel.id) { json(res, 400, { error: "A channel cannot feed itself." }); return; }
      getChannel(project, sourceChannelId); // throws 404 below if the source channel doesn't exist
      const flow = loadFlow(channel.graphId, null);
      const source = (flow.graph?.nodes ?? []).find((n) => n.category === "source" && n.kind !== "agent");
      if (!source) { json(res, 400, { error: "This channel has no connector source to wire a feed into." }); return; }
      const applied = applyGraphOperations(flow.graph, [
        { type: "update_node", nodeId: source.id, patch: { config: { ...source.config, sourceChannelId } } },
      ]);
      const validation = validateGraph(applied.graph);
      if (!validation.ok) { json(res, 400, { error: `Invalid after wiring the feed: ${validation.errors.join(" ")}` }); return; }
      const saved = saveFlow(applied.graph);
      json(res, 200, { ok: true, channelId: channel.id, sourceChannelId, sourceNodeId: source.id, graph: saved.graph });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const compareRunsMatch = url.pathname.match(/^\/api\/channels\/([^/]+)\/runs\/compare$/);
  if (req.method === "GET" && compareRunsMatch) {
    try {
      const project = loadProject();
      const channel = getChannel(project, decodeURIComponent(compareRunsMatch[1]));
      const flow = loadFlow(channel.graphId, null);
      const beforeId = url.searchParams.get("before");
      const afterId = url.searchParams.get("after");
      const before = beforeId ? flow.runs.find((run) => run.id === beforeId) : flow.runs.at(-2);
      const after = afterId ? flow.runs.find((run) => run.id === afterId) : flow.runs.at(-1);
      json(res, 200, { diff: compareChannelRuns(before, after) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Durable resident GTM operator sessions
  if (req.method === "GET" && url.pathname === "/api/operator/sessions") {
    const projectId = url.searchParams.get("project") || undefined;
    json(res, 200, { sessions: listOperatorSessions({ projectId }) }); return;
  }

  if (req.method === "POST" && url.pathname === "/api/operator/sessions") {
    try {
      const body = await readBody(req);
      // projectId comes from the REQUEST (the active project the canvas is showing), not from mutable
      // global active-project state. Fall back to loadProject() only when the client omits it
      // (back-compat). Resolving the project by explicit id is what removes the composer↔canvas drift.
      const project = loadProject(body.projectId ? { projectId: body.projectId } : {});
      // The dock is LOCKED to one durable conversation per project. When the client asks to reuse the
      // project's thread, return its current non-terminal session if one exists instead of spawning a
      // parallel conversation; only create when there is no live thread. Default (reuse omitted) keeps
      // the historical "always create a fresh session" behavior for back-compat callers.
      if (body.reuse === true) {
        const existing = getActiveSessionForProject(project.id);
        if (existing) {
          json(res, 200, { session: publicOperatorSession(existing), reused: true });
          return;
        }
      }
      // `fresh: true` starts a session bound to NO pipeline, so compose_and_run composes a brand-new
      // one — this is how a founder builds an ADDITIONAL pipeline for a product (the "New channel"
      // action) without re-driving the active pipeline. Otherwise bind to the requested/active channel.
      const graphId = body.fresh ? null : (body.graphId || project.activeChannelId || null);
      const flow = graphId ? loadFlow(graphId, null) : { graph: null };
      const session = createOperatorSession({
        goal: body.goal,
        graphId: flow.graph?.id ?? null,
        programId: body.programId ?? null,
        projectId: project.id,
        graphRevision: flow.graph?.revision ?? 0,
        workspaceId: body.workspaceId,
        model: body.model,
        maxSteps: body.maxSteps,
      });
      launchOperatorSession(session.id);
      json(res, 202, { session: publicOperatorSession(session), reused: false });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // The scheduler heartbeat — the ONE server-callable hook (an external cron/scheduler POSTs here on its
  // interval; there is deliberately NO module-scope setInterval, so importing the server never spins a
  // live timer). It drives BOTH standing work off the same real caller: it wakes every ambient session
  // whose standing brief is DUE, and it re-stages every promoted motion whose cadence is DUE (Phase 6).
  // Both only DRIVE/STAGE — never send — and each due item that throws is skipped, never breaking the
  // tick. A re-staged motion stops at the founder gate exactly like a first run.
  if (req.method === "POST" && url.pathname === "/api/operator/ambient/tick") {
    try {
      const woken = runDueAmbientTicks();
      const motions = runDueMotions();
      json(res, 200, { woken, motions });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const operatorSessionMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)$/);
  if (req.method === "GET" && operatorSessionMatch) {
    try {
      // When the canvas names the project it is showing, confirm the session belongs to it before
      // handing it back — the session's stored projectId is authoritative. Omitting ?project keeps the
      // unscoped lookup for back-compat readers.
      const scopedProject = url.searchParams.get("project");
      if (scopedProject) assertOperatorSessionProject(operatorSessionMatch[1], scopedProject);
      json(res, 200, { session: publicOperatorSession(getOperatorSession(operatorSessionMatch[1])) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Connection status — does the founder have a live Claude the operator/composer can use?
  // Drives the cold-start state so an unconnected user gets a clear path, not a dead-end error.
  if (req.method === "GET" && url.pathname === "/api/connection") {
    const selection = selectRuntime({});
    json(res, 200, {
      connected: !!selection.adapter,
      label: selection.adapter ? (selection.auth ? authModeLabel(selection.auth) : selection.adapter.label) : null,
      reason: selection.adapter ? null : selection.reason,
    });
    return;
  }

  const operatorActionMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)\/(resume|gate|proposal|ideas|candidates|cancel)$/);
  if (req.method === "POST" && operatorActionMatch) {
    try {
      const body = await readBody(req);
      const [, sessionId, action] = operatorActionMatch;
      // The session's stored projectId is authoritative. When the composer names the project it is
      // driving, reject a mismatch loudly rather than letting it resume/gate another project's session.
      if (body.projectId) assertOperatorSessionProject(sessionId, body.projectId);
      let session;
      if (action === "resume") session = resumeOperatorSession(sessionId, body.input);
      // Role-gated release: pass the acting user (request headers, else founder) so resolveOperatorGate
      // can authorize the send. A viewer/member release throws gate_release_forbidden → 403.
      else if (action === "gate") session = await resolveOperatorGate(sessionId, { ...body, request: req });
      else if (action === "proposal") session = resolveOperatorProposal(sessionId, body);
      // The founder kills/keeps the paused ideas — a founder act, never an agent tool. Picking ideas
      // resumes the operator to build each kept survivor through its pre-wired compose_and_run.
      else if (action === "ideas") session = resolveOperatorIdeas(sessionId, body);
      // The founder picks ONE candidate pipeline — a founder act that builds the chosen shape through
      // compose_and_run and drives it to the gate. Never an agent tool.
      else if (action === "candidates") session = await resolveOperatorCandidates(sessionId, body);
      else session = cancelOperatorSession(sessionId);
      json(res, action === "gate" || action === "proposal" || action === "ideas" || action === "candidates" ? 200 : 202, { session: publicOperatorSession(session) });
    } catch (err) {
      const status = err?.code === "gate_release_forbidden" ? 403 : 409;
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Per-agent taste profile — the "how it learned" panel behind an agent's face. DERIVED-ONLY from
  // this project's run ledger: how many runs the agent produced items in, the founder's approve/reject/
  // edit counts on those items, the last few before/after edits (the strongest learning signal), and a
  // rendered current-voice summary. An agent the founder has never run reads honestly ("no runs yet"),
  // never a fabricated zero. Read-only.
  const agentProfileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/agents\/([^/]+)\/profile$/);
  if (req.method === "GET" && agentProfileMatch) {
    try {
      const projectId = decodeURIComponent(agentProfileMatch[1]);
      const agentRef = decodeURIComponent(agentProfileMatch[2]);
      json(res, 200, { profile: getAgentProfile(projectId, agentRef) });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // GTM Engine OS — the Measure subsystem is derived from the active workspace's
  // scanned win event + the default channel's run ledger + live connector state.
  // Scope to a specific workspace with ?workspace=<id>; otherwise the most
  // recently updated workspace is the active outcome.
  if (req.method === "GET" && url.pathname === "/api/engine") {
    try {
      const requested = url.searchParams.get("workspace");
      const summaries = listWorkspaces();
      const target = requested
        ? summaries.find((w) => w.id === requested)
        : summaries[0];
      let report = null;
      if (target) {
        try { report = getWorkspace(target.id).report ?? null; } catch { report = null; }
      }
      const project = loadProject();
      const requestedChannel = url.searchParams.get("channel") || project.activeChannelId;
      let graphId = requestedChannel;
      try { graphId = getChannel(project, requestedChannel).graphId; } catch { /* legacy graph id */ }
      const { graph, runs } = graphId ? loadFlow(graphId, null) : { graph: null, runs: [] };
      json(res, 200, { engine: getEngineState({ report, runs, graph, connectors: listConnectors() }) });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // The context substrate, made visible. Assembles what the model would actually receive for a
  // channel — the multiplier — and returns the manifest so the UI can show it always, not just
  // after a run. Same providers the live agent calls use (agent-bridge), so the pill never lies.
  if (req.method === "GET" && url.pathname === "/api/context") {
    try {
      const project = loadProject();
      const requestedChannel = url.searchParams.get("channel") || project.activeChannelId;
      let graphId = requestedChannel;
      try { graphId = getChannel(project, requestedChannel).graphId; } catch { /* legacy graph id */ }
      const { runs } = graphId ? loadFlow(graphId, null) : { runs: [] };

      // Product grounding from the durable workspace scan when present, else the shared-context
      // repository facts. evidenceState stays conservatively "blind" unless the scan proves it.
      const repo = project.sharedContext?.repository ?? {};
      let report = null;
      const ws = listWorkspaces()[0];
      if (ws) { try { report = getWorkspace(ws.id).report ?? null; } catch { report = null; } }
      const grounding = repo.repo ? {
        productName: project.name || "product",
        headline: repo.headline || report?.headline || "",
        winEvent: repo.outcome ? { name: repo.outcome } : (report?.winEvent ?? null),
        stack: report?.stack ?? [],
        evidenceState: report?.winEvent?.found ? "proven" : "blind",
        evidence: Array.isArray(repo.evidence) ? repo.evidence : (report?.winEvent?.citations ?? []),
        blindSpots: (report?.gaps ?? []).map((g) => ({ title: g.title })),
      } : null;

      const memory = buildDraftMemory(extractDecisions(runs), { ideaTaste: ideaTasteForProject(project.id) });
      // The editable interpretation rides alongside the cited grounding. The product-model provider
      // emits the founder-editable shape (things/relationships/goals/states + pinned signals); the
      // product provider keeps emitting cited truth. Both run — they answer different questions.
      const productModel = getProductModel(project.id) ?? null;
      const providers = providersFromContext({ grounding, productModel, __memory: memory, __state: runs, designState: getDesignState(project.id) });
      const assembled = assembleContext({ providers, intent: `assemble context for channel ${requestedChannel}` });
      json(res, 200, { channelId: requestedChannel, manifest: assembled.manifest, text: assembled.text });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // The agent bench — the whole roster as ONE lens over the run ledger: every on-disk agent with its
  // real, derived track record (runs, approvals, rejections). A never-run agent reads honestly ("no
  // runs yet"), never a seeded number. Mirrors the board route: read-only, derived, never gates a run.
  const benchMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/bench$/);
  if (req.method === "GET" && benchMatch) {
    try {
      const projectId = decodeURIComponent(benchMatch[1]);
      json(res, 200, { bench: getAgentBench(projectId, { agents: listLibraryAgents() }) });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // The library — the real artifacts of GTM engineering on disk (subagents and skills), so the
  // explorer can show the parts of the system, not just channels. Read-only listing; names plus
  // the one-line description from each file's frontmatter.
  if (req.method === "GET" && url.pathname === "/api/library") {
    try {
      const home = os.homedir();
      const firstDescription = (text) => {
        const m = text.match(/^description:\s*(.+)$/m);
        return m ? m[1].trim().replace(/^["']|["']$/g, "").slice(0, 160) : "";
      };
      const skillsDir = path.join(home, ".claude", "skills");
      const agents = listLibraryAgents();
      let skills = [];
      try {
        skills = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith("."))
          .filter((d) => fs.existsSync(path.join(skillsDir, d.name, "SKILL.md")))
          .map((d) => {
            let description = "";
            try { description = firstDescription(fs.readFileSync(path.join(skillsDir, d.name, "SKILL.md"), "utf8")); } catch { /* name only */ }
            return { name: d.name, description };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch { /* no skills dir */ }
      json(res, 200, { agents, skills });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Durable GTM workspaces
  if (req.method === "GET" && url.pathname === "/api/workspaces") {
    json(res, 200, { workspaces: listWorkspaces() }); return;
  }

  if (req.method === "POST" && url.pathname === "/api/workspaces/open") {
    try {
      const body = await readBody(req);
      const workspace = openWorkspace(expandHome(body.repoPath), body.outcome || body.winEvent);
      groundProjectInWorkspace(workspace);
      json(res, 200, { workspace });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const workspaceMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);
  if (req.method === "GET" && workspaceMatch) {
    try { json(res, 200, { workspace: getWorkspace(workspaceMatch[1]) }); }
    catch (err) { json(res, 404, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const rescanMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/rescan$/);
  if (req.method === "POST" && rescanMatch) {
    try {
      const workspace = rescanWorkspace(rescanMatch[1]);
      groundProjectInWorkspace(workspace);
      json(res, 200, { workspace });
    }
    catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const revisionsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions$/);
  if (req.method === "POST" && revisionsMatch) {
    try {
      const workspace = getWorkspace(revisionsMatch[1]);
      if (!workspace.report.gaps?.some((gap) => gap.status === "proven")) {
        throw new Error("A proven repository gap is required before creating a change set.");
      }
      const revision = await createRevision(workspace);
      json(res, 200, {
        workspace: addRevision(workspace.id, revision),
        revision,
        error: revision.error,
      });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const reviewMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions\/([^/]+)\/review$/);
  if (req.method === "POST" && reviewMatch) {
    try {
      const body = await readBody(req);
      const workspace = updateRevision(
        reviewMatch[1],
        reviewMatch[2],
        (revision) => reviewRevision(revision, body.decision, body.note),
      );
      const reviewed = workspace.revisions.find((revision) => revision.id === reviewMatch[2]);
      const withDecision = addDecision(workspace.id, {
        type: "revision_review",
        revisionId: reviewMatch[2],
        decision: body.decision,
        note: String(body.note || "").trim(),
        summary: `${body.decision === "approve" ? "Approved" : "Rejected"} ${reviewMatch[2]}.`,
      });
      json(res, 200, { workspace: withDecision, revision: reviewed });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const readinessMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions\/([^/]+)\/readiness$/);
  if (req.method === "GET" && readinessMatch) {
    try {
      const workspace = getWorkspace(readinessMatch[1]);
      const revision = workspace.revisions.find((item) => item.id === readinessMatch[2]);
      if (!revision) throw new Error(`Revision not found: ${readinessMatch[2]}`);
      json(res, 200, { readiness: inspectApplyReadiness(workspace, revision) });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  const revisionActionMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/revisions\/([^/]+)\/(apply|revert)$/);
  if (req.method === "POST" && revisionActionMatch) {
    try {
      const body = await readBody(req);
      const workspace = getWorkspace(revisionActionMatch[1]);
      const revision = workspace.revisions.find((item) => item.id === revisionActionMatch[2]);
      if (!revision) throw new Error(`Revision not found: ${revisionActionMatch[2]}`);
      const action = revisionActionMatch[3];
      const nextRevision = action === "apply"
        ? applyRevision(workspace, revision, body.confirm === true)
        : revertRevision(workspace, revision, body.confirm === true);
      const updated = updateRevision(workspace.id, revision.id, () => nextRevision);
      const withDecision = addDecision(updated.id, {
        type: `revision_${action}`,
        revisionId: revision.id,
        decision: action,
        summary: `${action === "apply" ? "Applied" : "Reverted"} ${revision.id}.`,
      });
      json(res, 200, { workspace: withDecision, revision: nextRevision });
    } catch (err) { json(res, 409, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // Funnel scan — PREVIEW ONLY. This route shows what the scan found BEFORE a
  // project is created or composed. It is read-only by construction: scanRepo is
  // read-only and nothing here persists. Project creation is the separate confirm
  // step (POST /api/projects). Do NOT add a project-creation side effect here.
  if (req.method === "POST" && url.pathname === "/api/scan") {
    try {
      const body = await readBody(req);
      const report = scanRepo(expandHome(body.repoPath), {
        winEvent: typeof body.winEvent === "string" && body.winEvent.trim() ? body.winEvent.trim() : "project_created",
      });

      // Project the scan report into the named front-door preview contract. These
      // fields are derived from the report (never invented) so the UI lane has a
      // stable shape; the full unflattened `report` rides along for everything else.
      const winFound = report.winEvent?.found === true;
      const attributionCaptured = report.attribution?.captured === true;
      // file:line evidence citations for the detected win event.
      const winEventEvidence = report.winEvent?.citations ?? [];
      // Honest blind-attribution state: blind when the win event is unproven, or
      // proven but emitted with no captured acquisition source. The reason mirrors
      // the scanner's own headline logic so the preview can never disagree with it.
      const blindAttribution = !winFound
        ? { blind: true, reason: `The win event “${report.winEvent?.name}” could not be confirmed in production code.` }
        : !attributionCaptured
          ? { blind: true, reason: `“${report.winEvent?.name}” is emitted, but no acquisition source is captured to attribute it.` }
          : { blind: false, reason: `“${report.winEvent?.name}” carries ${report.winEvent.attributionProperties.join(", ") || "no attribution properties"}.` };
      // One honest plain-language line about the product, derived from real scan
      // signal (detected stack + files scanned) — no invented traction or claims.
      const productLine = report.stack?.length
        ? `${report.stack.join(", ")} project, ${report.filesScanned} files scanned.`
        : `${report.filesScanned} files scanned; no framework manifest detected.`;

      json(res, 200, {
        headline: report.headline,
        stack: report.stack,
        winEvent: report.winEvent,
        winEventEvidence,
        blindAttribution,
        productLine,
        // The full grounded report, unflattened, for any field the lane also needs
        // (analytics, attribution, funnel stages/edges, gaps, citations).
        report,
      });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // Code repair
  if (req.method === "POST" && url.pathname === "/api/build") {
    try {
      const body = await readBody(req);
      if (!body.report || typeof body.report !== "object") throw new Error("A grounded scan report is required.");
      const result = await buildTrackingFix(body.report);
      json(res, result.ok ? 200 : 422, result);
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // Connector registry
  if (req.method === "GET" && url.pathname === "/api/connectors") {
    json(res, 200, { connectors: listConnectors() }); return;
  }

  // Artifacts — the real GTM-engineering files (subagents + skills). Full markdown
  // editing: the raw .md is the source of truth. This is the P3 authoring surface.
  if (req.method === "GET" && url.pathname === "/api/artifacts") {
    json(res, 200, listArtifacts()); return;
  }
  if (req.method === "GET" && url.pathname === "/api/artifact") {
    const type = url.searchParams.get("type");
    const ref = url.searchParams.get("ref");
    if (type !== "agent" && type !== "skill") { json(res, 400, { error: "type must be 'agent' or 'skill'." }); return; }
    try { json(res, 200, readArtifact(type, ref)); }
    catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/artifact/save") {
    try {
      const body = await readBody(req);
      if (body.type !== "agent" && body.type !== "skill") throw new Error("type must be 'agent' or 'skill'.");
      const saved = writeArtifact(body.type, body.ref, body.content);
      json(res, 200, saved);
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // GTM Graph — default template
  if (req.method === "GET" && url.pathname === "/api/graph/template") {
    const project = loadProject();
    const requested = url.searchParams.get("channel") || project.activeChannelId;
    if (!requested) {
      json(res, 404, { error: "No channel exists yet. Create one before opening a graph." });
      return;
    }
    let graphId = requested;
    try { graphId = getChannel(project, requested).graphId; } catch { /* legacy graph id */ }
    const saved = loadFlow(graphId, null);
    const graph = saved.graph ?? null;
    if (!graph) {
      json(res, 404, { error: `Graph not found: ${graphId}` });
      return;
    }
    json(res, 200, {
      graph: applySharedContextToGraph(graph, project.sharedContext, { channelOffer: channelOfferFor(project, graphId) }),
      runs: saved.runs.slice(-10).map((run) => run.result),
    }); return;
  }

  if (req.method === "POST" && url.pathname === "/api/graph/save") {
    try {
      const body = await readBody(req);
      if (!body.graph || !Array.isArray(body.graph.nodes)) {
        throw new Error("Request must include a graph object with a nodes array.");
      }
      const validation = validateGraph(body.graph);
      if (!validation.ok) throw new Error(`Graph is invalid: ${validation.errors.join(" ")}`);
      const saved = saveFlow(body.graph);
      json(res, 200, { graph: saved.graph, savedAt: saved.updatedAt });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/graph/operations") {
    try {
      const body = await readBody(req);
      if (!body.graph || !Array.isArray(body.graph.nodes)) {
        throw new Error("Request must include a graph object with a nodes array.");
      }
      json(res, 200, applyGraphOperations(body.graph, body.operations));
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/graph/audit") {
    try {
      const body = await readBody(req);
      if (!body.graph || !Array.isArray(body.graph.nodes)) {
        throw new Error("Request must include a graph object with a nodes array.");
      }
      const validation = validateGraph(body.graph);
      if (!validation.ok) throw new Error(`Graph is invalid: ${validation.errors.join(" ")}`);
      json(res, 200, { audits: auditGraphContracts(body.graph, body.runResult ?? null) });
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  // GTM Graph — run
  if (req.method === "POST" && url.pathname === "/api/graph/run") {
    try {
      const body = await readBody(req);
      if (!body.graph || !Array.isArray(body.graph.nodes)) {
        throw new Error("Request must include a graph object with a nodes array.");
      }
      // Close the loop: read this channel's prior runs and feed the founder's
      // recorded gate decisions back into this run as memory.
      const prior = loadFlow(body.graph.id, body.graph);
      const project = loadProject();
      const runtimeGraph = applySharedContextToGraph(body.graph, project.sharedContext, { channelOffer: channelOfferFor(project, body.graph.id) });
      const memory = buildDraftMemory(extractDecisions(prior.runs), { ideaTaste: ideaTasteForProject(project.id) });
      const resumeRecord = typeof body.resumeRunId === "string"
        ? prior.runs.find((run) => run.id === body.resumeRunId)
        : null;
      if (body.resumeRunId && !resumeRecord) {
        throw new Error(`Run not found for gate resume: ${body.resumeRunId}`);
      }
      const result = await runGraph(runtimeGraph, {
        targetNodeId: typeof body.targetNodeId === "string" ? body.targetNodeId : undefined,
        approvals: body.approvals && typeof body.approvals === "object" ? body.approvals : {},
        decisions: body.decisions && typeof body.decisions === "object" ? body.decisions : {},
        memory,
        designState: getDesignState(project.id),
        grounding: buildRunGrounding(project),
        // The researched buyer picture — the run grounds on real MarketObjects, not just founder-typed
        // guesses. A projection over the stored objects; null (an honest blank) when none are researched.
        market: buildMarketContext(marketObjectStore.list({ projectId: project.id })),
        // A derived source pulls another channel's last-run output (read-only, behind the gate).
        loadLastRunItems: createDerivedSourceLoader({ projectId: project.id }),
        // Feed the context substrate: prior runs become the "what's been tried" state layer.
        runs: prior.runs,
        resumeResult: resumeRecord?.result ?? null,
        // BYO credentials: a founder-pasted Clay/Exa/send-auth key for this project wins over env.
        projectId: project.id,
        // Open steps (agent/skill) reach the rented frontier model + skills on disk.
        stepRuntime: liveStepRuntime({ cwd: project.sharedContext?.repository?.repo || process.cwd() }),
        // Gate approval is human-only: refuse an approval arriving through the agent/MCP door. Fires
        // only on an actual approval intent, so agent runs that merely reach a gate are unaffected.
        authorizeRelease: authorizeReleaseForRequest(req),
      });
      const saved = recordFlowRun(body.graph, result);
      // One seam fires all three run-completion derivations: taste ledger, People promotion, and the
      // per-channel experiment. Read-derived GTM state only — never health, never a gate.
      recordRunDerivations({ projectId: project.id, graph: body.graph, result });
      // Graph failures are domain results. Return the full per-node result so
      // the client can render partial success, blocked nodes, and recovery.
      json(res, 200, {
        ...result,
        memoryApplied: memory
          ? { approved: memory.approved.length, rejected: memory.rejected.length, edits: memory.edits.length }
          : null,
        storedRunCount: saved.runs.length,
        storedAt: saved.updatedAt,
      });
    } catch (err) {
      // A refused agent-originated gate approval is a 403 (authority), everything else a 400 (bad run).
      const status = err?.code === "gate_release_forbidden" ? 403 : 400;
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // GTM Graph — run with streaming (SSE). Same engine + memory + ledger as /run, but
  // emits one event per step so the UI animates the flow and reveals content as each
  // step succeeds. "Latency is design material" — real steps shown as they happen.
  if (req.method === "POST" && url.pathname === "/api/graph/run/stream") {
    let body;
    try {
      body = await readBody(req);
      if (!body.graph || !Array.isArray(body.graph.nodes)) throw new Error("Request must include a graph object with a nodes array.");
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); return; }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const send = (event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); };

    try {
      const prior = loadFlow(body.graph.id, body.graph);
      const project = loadProject();
      const runtimeGraph = applySharedContextToGraph(body.graph, project.sharedContext, { channelOffer: channelOfferFor(project, body.graph.id) });
      const memory = buildDraftMemory(extractDecisions(prior.runs), { ideaTaste: ideaTasteForProject(project.id) });
      const resumeRecord = typeof body.resumeRunId === "string"
        ? prior.runs.find((run) => run.id === body.resumeRunId)
        : null;
      if (body.resumeRunId && !resumeRecord) throw new Error(`Run not found for gate resume: ${body.resumeRunId}`);

      send({ type: "run_start", nodeIds: runtimeGraph.nodes.map((n) => n.id) });
      const result = await runGraph(runtimeGraph, {
        targetNodeId: typeof body.targetNodeId === "string" ? body.targetNodeId : undefined,
        approvals: body.approvals && typeof body.approvals === "object" ? body.approvals : {},
        decisions: body.decisions && typeof body.decisions === "object" ? body.decisions : {},
        memory,
        designState: getDesignState(project.id),
        grounding: buildRunGrounding(project),
        // The researched buyer picture — same projection the non-streaming run uses; honest blank when
        // nothing has been researched yet.
        market: buildMarketContext(marketObjectStore.list({ projectId: project.id })),
        // A derived source pulls another channel's last-run output (read-only, behind the gate).
        loadLastRunItems: createDerivedSourceLoader({ projectId: project.id }),
        // Feed the context substrate: prior runs become the "what's been tried" state layer.
        runs: prior.runs,
        resumeResult: resumeRecord?.result ?? null,
        // BYO credentials: a founder-pasted Clay/Exa/send-auth key for this project wins over env.
        projectId: project.id,
        stepRuntime: liveStepRuntime({ cwd: project.sharedContext?.repository?.repo || process.cwd() }),
        // Same human-only gate rule on the streaming path: an agent-originated approval is refused.
        authorizeRelease: authorizeReleaseForRequest(req),
        onEvent: send,
      });
      const saved = recordFlowRun(body.graph, result);
      recordRunDerivations({ projectId: project.id, graph: body.graph, result });
      send({
        type: "run_done",
        result: {
          ...result,
          memoryApplied: memory
            ? { approved: memory.approved.length, rejected: memory.rejected.length, edits: memory.edits.length }
            : null,
          storedRunCount: saved.runs.length,
          storedAt: saved.updatedAt,
        },
      });
    } catch (err) {
      send({ type: "run_error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
    return;
  }

  // ── Capabilities (external MCP servers) ──────────────────────────────────
  // Connectors are MCP servers Claude calls. The host lists them, classifies each
  // tool read/write, and holds the writes behind the gate. See mcp-store / mcp-client.
  if (req.method === "GET" && url.pathname === "/api/capabilities") {
    json(res, 200, { servers: listServers().map(serverView) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/capabilities/connect") {
    try {
      const body = await readBody(req);
      if (!body.id && !body.name) throw new Error("connect requires an id or name");
      let tools = Array.isArray(body.tools) ? body.tools : null;
      // The bundled local demo MCP server — a real stdio connection (not seeded data),
      // resolved server-side so the browser never needs the absolute path.
      if (body.demo) {
        body.command = process.execPath;
        body.args = [path.join(here, "demo", "mcp-demo-server.mjs")];
      }
      // A live stdio server: actually connect, handshake, and discover its tools.
      // A catalog/registry entry with tools already known skips the spawn.
      if (!tools && body.command) {
        const result = await connectStdioServer({ command: body.command, args: body.args, env: body.env });
        tools = result.tools;
        body.auth = body.auth ?? { status: "authed", method: "stdio" };
        // Connect only needs to discover tools; close the spawned process so it
        // doesn't leak. A persistent connection for calling tools is a run-path concern.
        result.client.close();
      }
      if (!tools) throw new Error("connect needs a live `command` to discover tools, or a `tools` list");
      const server = recordServer({ ...body, tools }, {});
      json(res, 200, { server: serverView(server) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const reclassifyMatch = url.pathname.match(/^\/api\/capabilities\/([^/]+)\/reclassify$/);
  if (req.method === "POST" && reclassifyMatch) {
    try {
      const body = await readBody(req);
      const serverId = decodeURIComponent(reclassifyMatch[1]);
      const existing = getServer(serverId, {});
      const tool = existing?.tools.find((t) => t.name === body.tool);
      const loosening = body.lane === "read" && tool && tool.class === "write";
      // Loosening the wall is the weighty act — the founder must confirm explicitly.
      if (loosening && body.confirm !== true) {
        json(res, 409, { error: "Loosening the wall needs confirmation", needsConfirm: true });
        return;
      }
      const { server, loosenedWall } = reclassifyTool(serverId, body.tool, body.lane, {});
      json(res, 200, { server: serverView(server), loosenedWall });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const capabilityMatch = url.pathname.match(/^\/api\/capabilities\/([^/]+)$/);
  if (req.method === "DELETE" && capabilityMatch) {
    try {
      removeServer(decodeURIComponent(capabilityMatch[1]), {});
      json(res, 200, { servers: listServers().map(serverView) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Static files
  if (req.method === "GET") { serveFile(url.pathname, res); return; }

  json(res, 405, { error: "Method not allowed." });
});

// Live terminal sessions for canvas terminal nodes (WebSocket on /api/terminal). Loopback-only.
attachTerminalServer(server);

// Exported so a test can boot the real route handler on an ephemeral port and close it cleanly.
export { server };

server.listen(port, host, () => {
  console.log(`Drover running at http://${host}:${port}`);
  // Dogfood crash recovery: no feature build survives a restart, so flip stale queued/building
  // items to `interrupted` and salvage any orphaned worktree work onto its branch. Best-effort.
  try {
    const recovered = recoverStaleBuilds();
    if (recovered.length) console.log(`  Dogfood recovery: ${recovered.map((r) => r.item ?? r.worktree).join(", ")}`);
  } catch (err) {
    console.log(`  Dogfood recovery skipped: ${err instanceof Error ? err.message : err}`);
  }
  const connectors = listConnectors();
  const ready = connectors.filter((c) => c.configured && !c.stub);
  const stubs = connectors.filter((c) => c.stub);
  if (ready.length) console.log(`  Connectors ready: ${ready.map((c) => c.name).join(", ")}`);
  if (stubs.length) console.log(`  Connectors stubbed: ${stubs.map((c) => c.name).join(", ")}`);
  // When a team is configured, hydrate the local store root from the team's shared state on boot.
  // Best-effort and lazy-loaded — a local-only deployment never touches the sync layer, and prints
  // nothing alarming: an unconfigured pull reports `disabled` and we stay quiet rather than logging
  // a "pulled 0" or "pull failed" line for a deployment that never opted into team sync.
  if (process.env.GTM_IDE_CONVEX_URL && process.env.GTM_IDE_TEAM_ID) {
    import("./convex-backend.mjs")
      .then((m) => m.hydrateTeamDocuments())
      .then((r) => {
        if (r?.disabled) return;
        if (r?.pulled != null) console.log(`  Team sync: pulled ${r.pulled} shared document(s) from Convex`);
      })
      .catch(() => {});
  }
});
