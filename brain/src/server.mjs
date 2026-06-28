#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTrackingFix } from "./build.mjs";
import { getEngineState } from "./engine.mjs";
import { loadFlow, recordFlowRun, saveFlow } from "./flow-store.mjs";
import { listServers, getServer, recordServer, removeServer, reclassifyTool, serverView } from "./mcp-store.mjs";
import { connectStdioServer } from "./mcp-client.mjs";
import { applyGraphOperations, validateGraph } from "./graph-operations.mjs";
import { auditGraphContracts } from "./contracts.mjs";
import { pilotOutreachRecipe } from "./workflow-recipes.mjs";
import { extractDecisions, buildDraftMemory } from "./memory.mjs";
import { assembleContext } from "./context/assembler.mjs";
import { providersFromContext } from "./context/providers.mjs";
import {
  applySharedContextToGraph,
  createChannel,
  createProject,
  duplicateChannel,
  getChannel,
  getProjectWithChannels,
  listProjects,
  groundProjectInWorkspace,
  loadProject,
  setActiveChannel,
  setActiveWorkflow,
  setActiveProject,
  updateChannel,
  updateSharedContext,
} from "./project-store.mjs";
import { deleteProject, mergeProjects } from "./project-merge.mjs";
import {
  getOpportunityStudio,
  saveGeneratedOpportunities,
  updateOpportunity,
} from "./opportunity-engine.mjs";
import { composeOpportunityChannel, composeGraphForChannel, previewOpportunityChannel } from "./workflow-composer.mjs";
import { executeDomainCommand } from "./domain-commands.mjs";
import { getProductModel } from "./product-model-store.mjs";
import { getDesignState } from "./design-state-store.mjs";
import { createClaudeProductModeler } from "./product-model-generator.mjs";
import { listOutcomePrograms, syncProgramStoreFromEvents } from "./program-store.mjs";
import { runProgram, buildRunGrounding } from "./program-runtime.mjs";
import { appendDomainEvent, listDomainEvents } from "./domain-events.mjs";
import { listAgentCreationPolicies } from "./agent-policy-store.mjs";
import { loadCapabilityFoundry } from "./capability-foundry.mjs";
import { loadFeedbackLedger, recordFeedbackSignalsFromRun } from "./feedback-ledger.mjs";
import { listPeople, getPerson, promoteEntrantsFromRun } from "./person-store.mjs";
import { loadClarity, addClarity, removeClarity } from "./clarity-store.mjs";
import { findReferences, deriveChannelFeeds, deriveDirectedFeeds, createDerivedSourceLoader } from "./cross-reference.mjs";
import {
  compareChannelRuns,
  createPortfolioArtifact,
  derivePortfolioBrief,
  recordExperiment,
  recordObservedOutcome,
} from "./portfolio-intelligence.mjs";
import { listConnectors } from "./connectors/registry.mjs";
import { runGraph } from "./graph.mjs";
import { liveStepRuntime } from "./agent-bridge.mjs";
import { createClaudeIdeator } from "./ideation.mjs";
import { createClaudeComposer } from "./composition.mjs";
import { createClaudeEvaluator } from "./eval.mjs";
import { selectRuntime, authModeLabel } from "./runtimes/index.mjs";
import { listArtifacts, readArtifact, writeArtifact } from "./artifact-store.mjs";
import {
  cancelOperatorSession,
  launchOperatorSession,
  resolveOperatorGate,
  resolveOperatorProposal,
  resumeOperatorSession,
} from "./operator-runtime.mjs";
import {
  assertOperatorSessionProject,
  createOperatorSession,
  getActiveSessionForProject,
  getOperatorSession,
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

function expandHome(v) {
  if (typeof v !== "string") return "";
  if (v === "~") return process.env.HOME || v;
  if (v.startsWith("~/")) return path.join(process.env.HOME || "", v.slice(2));
  return v;
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

  // Health
  if (req.method === "GET" && url.pathname === "/api/health") {
    json(res, 200, { ok: true }); return;
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

  const projectOpportunitiesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/opportunities$/);
  if (req.method === "GET" && projectOpportunitiesMatch) {
    try {
      const projectId = decodeURIComponent(projectOpportunitiesMatch[1]);
      json(res, 200, { opportunities: getOpportunityStudio({ projectId }) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const projectProgramsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/programs$/);
  if (req.method === "GET" && projectProgramsMatch) {
    try {
      const projectId = decodeURIComponent(projectProgramsMatch[1]);
      json(res, 200, {
        programs: listOutcomePrograms(projectId),
        policies: listAgentCreationPolicies(projectId),
        foundry: loadCapabilityFoundry(projectId),
        feedback: loadFeedbackLedger(projectId),
        events: listDomainEvents(projectId),
      });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
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

  const projectProgramRunMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/programs\/([^/]+)\/run$/);
  if (req.method === "POST" && projectProgramRunMatch) {
    try {
      const projectId = decodeURIComponent(projectProgramRunMatch[1]);
      const programId = decodeURIComponent(projectProgramRunMatch[2]);
      const body = await readBody(req);
      const project = loadProject({ projectId });
      const run = await runProgram(programId, {
        ...body,
        projectId,
        stepRuntime: liveStepRuntime({ cwd: project.sharedContext?.repository?.repo || process.cwd() }),
      }, { projectId });
      json(res, 200, {
        programId: run.programId,
        graphId: run.graphId,
        programStatus: run.programStatus,
        storedRunCount: run.storedRunCount,
        feedbackSignals: run.feedback.signals.length,
        evaluations: run.evaluations.length,
        nextVersions: run.nextVersions.map((item) => ({
          policyId: item.policy.id,
          agentInstanceId: item.instance.id,
          previousInstanceId: item.instance.previousInstanceId,
          version: item.instance.version,
        })),
        result: run.result,
      });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Streaming program run — the program canvas's flagship "Run Program" lights up node-by-node like
  // the raw-graph path, instead of returning one batch at the end. runProgram already forwards the
  // onEvent callback to runGraph, so the steps stream; we add the program summary in run_done.
  const projectProgramRunStreamMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/programs\/([^/]+)\/run\/stream$/);
  if (req.method === "POST" && projectProgramRunStreamMatch) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const send = (event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); };
    try {
      const projectId = decodeURIComponent(projectProgramRunStreamMatch[1]);
      const programId = decodeURIComponent(projectProgramRunStreamMatch[2]);
      const body = await readBody(req);
      const project = loadProject({ projectId });
      const run = await runProgram(programId, {
        ...body,
        projectId,
        stepRuntime: liveStepRuntime({ cwd: project.sharedContext?.repository?.repo || process.cwd() }),
        onEvent: send,
      }, { projectId });
      send({
        type: "run_done",
        result: run.result,
        programStatus: run.programStatus,
        storedRunCount: run.storedRunCount,
        feedbackSignals: run.feedback.signals.length,
        evaluations: run.evaluations.length,
        nextVersions: run.nextVersions.map((item) => ({
          policyId: item.policy.id,
          agentInstanceId: item.instance.id,
          previousInstanceId: item.instance.previousInstanceId,
          version: item.instance.version,
        })),
      });
    } catch (err) {
      send({ type: "run_error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
    return;
  }

  const generateOpportunitiesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/opportunities\/generate$/);
  if (req.method === "POST" && generateOpportunitiesMatch) {
    try {
      const projectId = decodeURIComponent(generateOpportunitiesMatch[1]);
      const project = loadProject({ projectId });
      const workspaceId = project.sharedContext?.repository?.workspaceId;
      if (!workspaceId) throw new Error("This project has no repository scan.");
      const workspace = getWorkspace(workspaceId);
      const repo = project.sharedContext?.repository?.repo || process.cwd();
      const opportunities = await saveGeneratedOpportunities(workspace.report, {
        projectId,
        ideate: createClaudeIdeator({ cwd: repo }),
      });
      json(res, 200, { opportunities });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Streaming ideation — the canvas-of-workflows experience. Generate the channel proposals, then
  // compose EACH channel's real graph (model) and stream each completed workflow as it lands, so
  // the founder watches workflows build onto the canvas one at a time. Per-channel resilient: a
  // composer failure (e.g. a session limit) reports that lane's error and the rest keep going.
  const ideateStreamMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ideate\/stream$/);
  if (req.method === "POST" && ideateStreamMatch) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    try {
      const projectId = decodeURIComponent(ideateStreamMatch[1]);
      const project = loadProject({ projectId });
      const workspaceId = project.sharedContext?.repository?.workspaceId;
      if (!workspaceId) throw new Error("This project has no repository scan.");
      const workspace = getWorkspace(workspaceId);
      const repo = project.sharedContext?.repository?.repo || process.cwd();

      // Throttle token deltas into readable thinking frames — emit when the buffer grows enough or
      // a sentence closes, so the founder watches reasoning form without flooding the stream.
      const makeThinker = (channelId) => {
        let buf = "";
        return (delta) => {
          buf += delta;
          if (buf.length >= 40 || /[.!?\n]$/.test(delta)) {
            send({ type: "thinking", channelId: channelId ?? null, text: buf });
            buf = "";
          }
        };
      };

      send({ type: "status", message: "Ideating channels from grounded reality…" });
      const opportunities = await saveGeneratedOpportunities(workspace.report, {
        projectId,
        ideate: createClaudeIdeator({ cwd: repo, onText: makeThinker(null) }),
      });
      const channels = (opportunities.items ?? []).filter((i) => i.type === "channel" && i.status !== "rejected");
      const agents = (opportunities.items ?? []).filter((i) => i.type === "agent");
      const grounding = opportunities.understanding ?? null;
      send({ type: "proposals", channels, agents });

      // Compose each channel's real graph, streaming each onto the canvas as it completes, with
      // the model's live reasoning streamed per lane.
      for (const channel of channels) {
        send({ type: "composing", channelId: channel.id, title: channel.title });
        try {
          const pinned = channel.selectedAgentIds?.length
            ? agents.filter((a) => channel.selectedAgentIds.includes(a.id))
            : agents;
          const compose = createClaudeComposer({ cwd: repo, onText: makeThinker(channel.id) });
          const { nodes, edges } = await composeGraphForChannel({ channel, agents: pinned, grounding, compose });
          send({ type: "workflow", channelId: channel.id, title: channel.title, nodes, edges });
        } catch (err) {
          send({ type: "workflow_error", channelId: channel.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
      send({ type: "done" });
    } catch (err) {
      send({ type: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
    return;
  }

  const opportunityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/opportunities\/([^/]+)$/);
  if (req.method === "POST" && opportunityMatch) {
    try {
      const body = await readBody(req);
      const projectId = decodeURIComponent(opportunityMatch[1]);
      const opportunityId = decodeURIComponent(opportunityMatch[2]);
      json(res, 200, { opportunity: updateOpportunity(opportunityId, body.patch ?? body, { projectId }) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  // Preview: compose the channel's real graph and return it WITHOUT persisting — the founder reviews
  // it ghosted on the canvas, then the /compose apply path persists that exact previewed graph.
  const composePreviewMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/compose\/preview$/);
  if (req.method === "POST" && composePreviewMatch) {
    try {
      const body = await readBody(req);
      const projectId = decodeURIComponent(composePreviewMatch[1]);
      const composeProject = loadProject({ projectId });
      const composeRepo = composeProject.sharedContext?.repository?.repo || process.cwd();
      json(res, 200, await previewOpportunityChannel(body, {
        projectId,
        compose: createClaudeComposer({ cwd: composeRepo }),
      }));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const composeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/compose$/);
  if (req.method === "POST" && composeMatch) {
    try {
      const body = await readBody(req);
      const projectId = decodeURIComponent(composeMatch[1]);
      const composeProject = loadProject({ projectId });
      const composeRepo = composeProject.sharedContext?.repository?.repo || process.cwd();
      json(res, 201, await composeOpportunityChannel(body, {
        projectId,
        compose: createClaudeComposer({ cwd: composeRepo }),
        evaluate: createClaudeEvaluator({ cwd: composeRepo }),
      }));
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

  if (req.method === "GET" && url.pathname === "/api/project/brief") {
    json(res, 200, { brief: derivePortfolioBrief() }); return;
  }

  if (req.method === "POST" && url.pathname === "/api/project/artifacts/portfolio-brief") {
    try { json(res, 200, createPortfolioArtifact()); }
    catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/outcomes") {
    try {
      const body = await readBody(req);
      json(res, 200, recordObservedOutcome(body));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/experiments") {
    try {
      const body = await readBody(req);
      json(res, 200, recordExperiment(body));
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
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

  if (req.method === "POST" && url.pathname === "/api/program-workflows") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const created = await executeDomainCommand("CreateProgramWorkflow", {
        ...body,
        projectId: project.id,
      }, { projectId: project.id });
      const savedProject = setActiveChannel(created.channel.id);
      json(res, 201, {
        project: getProjectWithChannels(),
        program: created.program,
        workflow: created.channel,
        graph: created.workflowGraph,
        activeChannelId: savedProject.activeChannelId,
      });
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

  const updateProgramWorkflowMatch = url.pathname.match(/^\/api\/program-workflows\/([^/]+)\/update$/);
  if (req.method === "POST" && updateProgramWorkflowMatch) {
    try {
      const body = await readBody(req);
      const project = loadProject();
      const workflow = getChannel(project, decodeURIComponent(updateProgramWorkflowMatch[1]));
      if (!workflow.outcomeProgramId) throw new Error(`Workflow is not program-backed: ${workflow.id}`);
      const program = await executeDomainCommand("UpdateProgramWorkflowMetadata", {
        ...body,
        projectId: project.id,
        programId: workflow.outcomeProgramId,
        channelId: workflow.id,
      }, { projectId: project.id });
      const updatedProject = getProjectWithChannels();
      const updatedWorkflow = updatedProject.channels.find((item) => item.outcomeProgramId === program.id || item.id === workflow.id);
      json(res, 200, { project: updatedProject, program, workflow: updatedWorkflow });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const duplicateProgramWorkflowMatch = url.pathname.match(/^\/api\/program-workflows\/([^/]+)\/duplicate$/);
  if (req.method === "POST" && duplicateProgramWorkflowMatch) {
    try {
      const body = await readBody(req);
      const duplicated = duplicateChannel(decodeURIComponent(duplicateProgramWorkflowMatch[1]), body);
      json(res, 201, { ...duplicated, workflow: duplicated.channel });
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
        graph: applySharedContextToGraph(flow.graph, project.sharedContext),
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
      const graphId = body.graphId || project.activeChannelId || null;
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

  // Connection status — does the founder have a live Claude the operator/composer/ideator can use?
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

  const operatorActionMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)\/(resume|gate|proposal|cancel)$/);
  if (req.method === "POST" && operatorActionMatch) {
    try {
      const body = await readBody(req);
      const [, sessionId, action] = operatorActionMatch;
      // The session's stored projectId is authoritative. When the composer names the project it is
      // driving, reject a mismatch loudly rather than letting it resume/gate another project's session.
      if (body.projectId) assertOperatorSessionProject(sessionId, body.projectId);
      let session;
      if (action === "resume") session = resumeOperatorSession(sessionId, body.input);
      else if (action === "gate") session = await resolveOperatorGate(sessionId, body);
      else if (action === "proposal") session = resolveOperatorProposal(sessionId, body);
      else session = cancelOperatorSession(sessionId);
      json(res, action === "gate" || action === "proposal" ? 200 : 202, { session: publicOperatorSession(session) });
    } catch (err) {
      json(res, 409, { error: err instanceof Error ? err.message : String(err) });
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

      const memory = buildDraftMemory(extractDecisions(runs));
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
      const agentsDir = path.join(home, ".claude", "agents");
      const skillsDir = path.join(home, ".claude", "skills");
      let agents = [];
      try {
        agents = fs.readdirSync(agentsDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => {
            let description = "";
            try { description = firstDescription(fs.readFileSync(path.join(agentsDir, f), "utf8")); } catch { /* name only */ }
            return { ref: f.replace(/\.md$/, ""), description };
          })
          .sort((a, b) => a.ref.localeCompare(b.ref));
      } catch { /* no agents dir */ }
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

  // Funnel scan
  if (req.method === "POST" && url.pathname === "/api/scan") {
    try {
      const body = await readBody(req);
      const report = scanRepo(expandHome(body.repoPath), {
        winEvent: typeof body.winEvent === "string" && body.winEvent.trim() ? body.winEvent.trim() : "project_created",
      });
      json(res, 200, report);
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
    const ownedProgram = listOutcomePrograms(project.id).find((program) =>
      program.workflowGraph?.id === graphId || program.id === requested
    );
    const graph = ownedProgram?.workflowGraph ?? saved.graph ?? null;
    if (!graph) {
      json(res, 404, { error: `Graph not found: ${graphId}` });
      return;
    }
    json(res, 200, {
      graph: applySharedContextToGraph(graph, project.sharedContext),
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
      if (saved.graph.outcomeProgramId) {
        const project = loadProject();
        appendDomainEvent(project.id, {
          type: "WorkflowGraphUpdated",
          aggregateType: "OutcomeProgram",
          aggregateId: saved.graph.outcomeProgramId,
          data: { graphId: saved.graph.id, workflowGraph: saved.graph },
        });
        syncProgramStoreFromEvents(project.id);
      }
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

  if (req.method === "GET" && url.pathname === "/api/graph/recipes/pilot-outreach") {
    json(res, 200, { graph: pilotOutreachRecipe() });
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
      const runtimeGraph = applySharedContextToGraph(body.graph, project.sharedContext);
      const memory = buildDraftMemory(extractDecisions(prior.runs));
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
        // A derived source pulls another channel's last-run output (read-only, behind the gate).
        loadLastRunItems: createDerivedSourceLoader({ projectId: project.id }),
        // Feed the context substrate: prior runs become the "what's been tried" state layer.
        runs: prior.runs,
        resumeResult: resumeRecord?.result ?? null,
        // Open steps (agent/skill) reach the rented frontier model + skills on disk.
        stepRuntime: liveStepRuntime({ cwd: project.sharedContext?.repository?.repo || process.cwd() }),
      });
      const saved = recordFlowRun(body.graph, result);
      recordFeedbackSignalsFromRun({ projectId: project.id, graph: body.graph, result });
      promoteEntrantsFromRun({ projectId: project.id, channelId: body.graph.id, result });
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
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
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
      const runtimeGraph = applySharedContextToGraph(body.graph, project.sharedContext);
      const memory = buildDraftMemory(extractDecisions(prior.runs));
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
        // A derived source pulls another channel's last-run output (read-only, behind the gate).
        loadLastRunItems: createDerivedSourceLoader({ projectId: project.id }),
        // Feed the context substrate: prior runs become the "what's been tried" state layer.
        runs: prior.runs,
        resumeResult: resumeRecord?.result ?? null,
        stepRuntime: liveStepRuntime({ cwd: project.sharedContext?.repository?.repo || process.cwd() }),
        onEvent: send,
      });
      const saved = recordFlowRun(body.graph, result);
      recordFeedbackSignalsFromRun({ projectId: project.id, graph: body.graph, result });
      promoteEntrantsFromRun({ projectId: project.id, channelId: body.graph.id, result });
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

server.listen(port, host, () => {
  console.log(`GTM IDE running at http://${host}:${port}`);
  const connectors = listConnectors();
  const ready = connectors.filter((c) => c.configured && !c.stub);
  const stubs = connectors.filter((c) => c.stub);
  if (ready.length) console.log(`  Connectors ready: ${ready.map((c) => c.name).join(", ")}`);
  if (stubs.length) console.log(`  Connectors stubbed: ${stubs.map((c) => c.name).join(", ")}`);
  // When a team is configured, hydrate the local store root from the team's shared state on boot.
  // Best-effort and lazy-loaded — a local-only deployment never touches the sync layer.
  if (process.env.GTM_IDE_CONVEX_URL && process.env.GTM_IDE_TEAM_ID) {
    import("./convex-sync.mjs")
      .then((m) => m.pullTeamDocuments())
      .then((r) => r?.pulled != null && console.log(`  Team sync: pulled ${r.pulled} shared document(s) from Convex`))
      .catch(() => {});
  }
});
