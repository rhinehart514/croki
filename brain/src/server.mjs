#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTrackingFix } from "./build.mjs";
import { getEngineState } from "./engine.mjs";
import { loadFlow, recordFlowRun, saveFlow } from "./flow-store.mjs";
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
  setActiveProject,
  updateChannel,
  updateSharedContext,
} from "./project-store.mjs";
import {
  getOpportunityStudio,
  saveGeneratedOpportunities,
  updateOpportunity,
} from "./opportunity-engine.mjs";
import { composeOpportunityChannel, composeGraphForChannel } from "./workflow-composer.mjs";
import {
  compareChannelRuns,
  createPortfolioArtifact,
  derivePortfolioBrief,
  recordExperiment,
  recordObservedOutcome,
} from "./portfolio-intelligence.mjs";
import { defaultTemplate, listConnectors, runPipeline } from "./pipeline.mjs";
import { runGraph } from "./graph.mjs";
import { liveStepRuntime } from "./agent-bridge.mjs";
import { createClaudeIdeator } from "./ideation.mjs";
import { createClaudeComposer } from "./composition.mjs";
import { listArtifacts, readArtifact, writeArtifact } from "./artifact-store.mjs";
import {
  cancelOperatorSession,
  launchOperatorSession,
  resolveOperatorGate,
  resumeOperatorSession,
} from "./operator-runtime.mjs";
import {
  createOperatorSession,
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
    json(res, 200, { sharedContext: project.sharedContext }); return;
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
      const project = loadProject();
      const graphId = body.graphId || project.activeChannelId || null;
      const flow = graphId ? loadFlow(graphId, null) : { graph: null };
      const session = createOperatorSession({
        goal: body.goal,
        graphId: flow.graph?.id ?? null,
        projectId: project.id,
        graphRevision: flow.graph?.revision ?? 0,
        workspaceId: body.workspaceId,
        model: body.model,
        maxSteps: body.maxSteps,
      });
      launchOperatorSession(session.id);
      json(res, 202, { session: publicOperatorSession(session) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const operatorSessionMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)$/);
  if (req.method === "GET" && operatorSessionMatch) {
    try {
      json(res, 200, { session: publicOperatorSession(getOperatorSession(operatorSessionMatch[1])) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const operatorActionMatch = url.pathname.match(/^\/api\/operator\/sessions\/([^/]+)\/(resume|gate|cancel)$/);
  if (req.method === "POST" && operatorActionMatch) {
    try {
      const body = await readBody(req);
      const [, sessionId, action] = operatorActionMatch;
      let session;
      if (action === "resume") session = resumeOperatorSession(sessionId, body.input);
      else if (action === "gate") session = await resolveOperatorGate(sessionId, body);
      else session = cancelOperatorSession(sessionId);
      json(res, action === "gate" ? 200 : 202, { session: publicOperatorSession(session) });
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
      const providers = providersFromContext({ grounding, __memory: memory, __state: runs });
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

  // Pipeline default template
  if (req.method === "GET" && url.pathname === "/api/pipeline/template") {
    json(res, 200, { pipeline: defaultTemplate() }); return;
  }

  // Pipeline run (multi-channel)
  if (req.method === "POST" && url.pathname === "/api/pipeline/run") {
    try {
      const body = await readBody(req);
      if (!body.pipeline || !Array.isArray(body.pipeline.channels)) {
        throw new Error("Request must include a pipeline object with a channels array.");
      }
      const result = await runPipeline(body.pipeline);
      json(res, result.ok ? 200 : 422, result);
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
    if (!saved.graph) {
      json(res, 404, { error: `Graph not found: ${graphId}` });
      return;
    }
    json(res, 200, {
      graph: applySharedContextToGraph(saved.graph, project.sharedContext),
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

  if (req.method === "GET" && url.pathname === "/api/graph/recipes/pilot-outreach") {
    json(res, 200, { graph: pilotOutreachRecipe() });
    return;
  }

  // GTM Graph — natural language mutation
  if (req.method === "POST" && url.pathname === "/api/graph/mutate") {
    try {
      const body = await readBody(req);
      const { graph, command } = body;
      if (!graph || !Array.isArray(graph.nodes)) {
        json(res, 400, { error: "Request must include a graph object with a nodes array." }); return;
      }
      if (!command || typeof command !== "string" || !command.trim()) {
        json(res, 400, { error: "Request must include a non-empty command string." }); return;
      }
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        json(res, 200, { description: "ANTHROPIC_API_KEY not set.", changes: [], graph }); return;
      }
      const systemPrompt = `You are a GTM graph editor. Convert the user's command into a small typed patch. Return ONLY valid JSON: { "description": "<what changed and why>", "operations": [...] }.

Supported operations:
- { "type": "set_graph_name", "name": "..." }
- { "type": "add_node", "node": { "id", "category", "connector", "label", "position": { "x", "y" }, "config", "agentPrompt?" } }
- { "type": "remove_node", "nodeId": "..." }
- { "type": "update_node", "nodeId": "...", "patch": { "label"?, "connector"?, "config"?, "agentPrompt"?, "position"?, "sourceOfTruth"? } }
- { "type": "connect_nodes", "edge": { "id", "source", "target", "edgeType", "label"? } }
- { "type": "disconnect_nodes", "edgeId": "..." }

Never return a replacement graph. Keep the patch narrow and preserve founder gates.`;
      const userMessage = `Command: ${command}\n\nGraph:\n${JSON.stringify(graph, null, 2)}`;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        json(res, 200, { description: `Claude API error (${response.status}): ${errText.slice(0, 200)}`, changes: [], graph }); return;
      }
      const data = await response.json();
      const raw = data.content?.[0]?.text ?? "";
      let parsed;
      try {
        // Strip markdown code fences if present
        const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        parsed = JSON.parse(stripped);
      } catch {
        json(res, 200, { description: "Could not parse command.", changes: [], graph }); return;
      }
      json(res, 200, {
        ...applyGraphOperations(graph, parsed.operations),
        description: typeof parsed.description === "string" ? parsed.description : "Graph updated.",
      });
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
        // Feed the context substrate: prior runs become the "what's been tried" state layer.
        runs: prior.runs,
        resumeResult: resumeRecord?.result ?? null,
        // Open steps (agent/skill) reach the rented frontier model + skills on disk.
        stepRuntime: liveStepRuntime({ cwd: project.sharedContext?.repository?.repo || process.cwd() }),
      });
      const saved = recordFlowRun(body.graph, result);
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
        // Feed the context substrate: prior runs become the "what's been tried" state layer.
        runs: prior.runs,
        resumeResult: resumeRecord?.result ?? null,
        stepRuntime: liveStepRuntime({ cwd: project.sharedContext?.repository?.repo || process.cwd() }),
        onEvent: send,
      });
      const saved = recordFlowRun(body.graph, result);
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
});
