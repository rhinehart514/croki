// GTM graph routes (template/save/operations/audit/run/run+stream) plus the connector registry and the
// external-MCP capabilities surface. Moved verbatim out of server.mjs. The run paths carry the human-only
// gate guard (authorizeReleaseForRequest); the default execute connector stages locally and never sends.
import path from "node:path";
import { json, readBody, channelOfferFor, srcDir } from "./util.mjs";
import {
  loadProject,
  loadProjectCatalog,
  applySharedContextToGraph,
  registerComposedChannel,
} from "../project-store.mjs";
import { loadFlow, recordFlowRun, saveFlow } from "../flow-store.mjs";
import { applyGraphOperations, assertGraphAuthorityMatches, validateGraph } from "../graph-operations.mjs";
import { assertGateWall, explainComposedGraph } from "../workflow-composer.mjs";
import { createClaudeExplainer } from "../composition.mjs";
import { auditGraphContracts } from "../contracts.mjs";
import { buildDraftMemory, extractDecisions } from "../memory.mjs";
import { ideaTasteForProject } from "../feedback-ledger.mjs";
import { getDesignState } from "../design-state-store.mjs";
import { buildRunGrounding, reportForProject } from "../run-grounding.mjs";
import { awaitProductModelReady } from "../product-model-ready.mjs";
import { buildMarketContext } from "../market-research.mjs";
import { marketObjectStore } from "../gtm-store.mjs";
import { createDerivedSourceLoader } from "../cross-reference.mjs";
import { liveStepRuntime } from "../agent-bridge.mjs";
import { hasApproveIntent, runGraph, OUTWARD_RELEASE } from "../graph.mjs";
import { isFounderPresent } from "../presence.mjs";
import { defaultSendRunners } from "../connectors/execute/gmail-transport.mjs";
import { recordRunDerivations } from "../run-derivation.mjs";
import { listConnectors } from "../connectors/registry.mjs";
import { listServers, getServer, recordServer, removeServer, reclassifyTool, serverView } from "../mcp-store.mjs";
import { connectStdioServer } from "../mcp-client.mjs";
import { authorizeFounderWriteForRequest, authorizeReleaseForRequest } from "./session-guard.mjs";
import { authorizeGateRelease } from "../operator-run-core.mjs";
import { reconcileDirectRunWithOperator } from "../operator-run-reconciliation.mjs";

function routeError(message, { status = 400, code = null } = {}) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function statusFor(error) {
  return error?.status ?? (error?.code === "gate_release_forbidden" ? 403 : 400);
}

function graphOwners(ref, options = {}) {
  const key = String(ref ?? "").trim();
  if (!key) return [];
  const catalog = loadProjectCatalog(options);
  return catalog.projects.flatMap((project) => (project.channels ?? [])
    .filter((channel) => channel?.id === key || channel?.graphId === key)
    .map((channel) => ({ project, channel })));
}

// Resolve every persisted graph through the project channel registry. A supplied projectId is
// authoritative; omitting it is backward-compatible only when the graph has exactly one registered
// owner. New graphs require an explicit project and must not reuse an unowned persisted graph id.
function resolveScopedGraph(ref, { projectId = null, allowNew = false } = {}, options = {}) {
  const key = String(ref ?? "").trim();
  if (!key) throw routeError("A graph or channel id is required.");
  const owners = graphOwners(key, options);
  const distinctProjects = new Set(owners.map((owner) => owner.project.id));
  const graphIdProjects = new Set(owners
    .filter((owner) => owner.channel.graphId === key)
    .map((owner) => owner.project.id));
  if (graphIdProjects.size > 1) {
    throw routeError(`Graph ${key} is registered to more than one project and cannot be used until ownership is repaired.`, {
      status: 409,
      code: "project_scope_ambiguous",
    });
  }
  if (distinctProjects.size > 1 && !projectId) {
    throw routeError(`Graph or channel ${key} is ambiguous; provide projectId.`, { status: 409, code: "project_scope_ambiguous" });
  }
  if (projectId) {
    const project = loadProject({ ...options, projectId });
    const owned = owners.find((owner) => owner.project.id === project.id) ?? null;
    const foreign = owners.find((owner) => owner.project.id !== project.id) ?? null;
    if (owned) return { project, channel: owned.channel, graphId: owned.channel.graphId, isNew: false };
    if (foreign) {
      throw routeError(`Graph or channel ${key} belongs to project ${foreign.project.id}, not ${project.id}.`, {
        status: 403,
        code: "project_scope_forbidden",
      });
    }
    if (!allowNew) {
      throw routeError(`Graph or channel ${key} does not belong to project ${project.id}.`, {
        status: 403,
        code: "project_scope_forbidden",
      });
    }
    if (loadFlow(key, null, options).graph) {
      throw routeError(`Unregistered persisted graph ${key} cannot be claimed by project ${project.id}.`, {
        status: 403,
        code: "project_scope_forbidden",
      });
    }
    return { project, channel: null, graphId: key, isNew: true };
  }
  if (owners.length === 1) {
    const owner = owners[0];
    return { project: owner.project, channel: owner.channel, graphId: owner.channel.graphId, isNew: false };
  }
  throw routeError(`Graph or channel ${key} has no registered project owner; provide projectId only when creating a new graph.`, {
    status: 403,
    code: "project_scope_forbidden",
  });
}

function validateWallGraph(graph) {
  const validation = validateGraph(graph);
  if (!validation.ok) throw routeError(`Graph is invalid: ${validation.errors.join(" ")}`);
  assertGateWall(graph.nodes, graph.edges ?? []);
}

function releaseAuthorizer(req, projectId) {
  const requireBrowser = authorizeReleaseForRequest(req);
  return () => {
    requireBrowser();
    authorizeGateRelease({ projectId }, { request: req }, { projectId });
  };
}

function explicitProjectId(body = {}, url = null) {
  return String(body?.projectId ?? url?.searchParams?.get("project") ?? "").trim() || null;
}

async function prepareGraphRun(body) {
  if (!body.graph || !Array.isArray(body.graph.nodes)) {
    throw routeError("Request must include a graph object with a nodes array.");
  }
  const scope = resolveScopedGraph(body.graph.id, { projectId: explicitProjectId(body) });
  const options = { projectId: scope.project.id };
  const prior = loadFlow(scope.graphId, null, options);
  if (!prior.graph) throw routeError(`Graph not found: ${scope.graphId}.`, { status: 404 });
  assertGraphAuthorityMatches(body.graph, prior.graph);
  validateWallGraph(body.graph);
  const runtimeGraph = applySharedContextToGraph(body.graph, scope.project.sharedContext, {
    channelOffer: channelOfferFor(scope.project, scope.graphId),
  });
  const memory = buildDraftMemory(extractDecisions(prior.runs), {
    ideaTaste: ideaTasteForProject(scope.project.id),
  });
  const resumeRecord = typeof body.resumeRunId === "string"
    ? prior.runs.find((run) => run.id === body.resumeRunId)
    : null;
  if (body.resumeRunId && !resumeRecord) {
    throw routeError(`Run not found in project ${scope.project.id} for gate resume: ${body.resumeRunId}.`, {
      status: 403,
      code: "project_scope_forbidden",
    });
  }
  await awaitProductModelReady(scope.project.id);
  return { ...scope, options, prior, runtimeGraph, memory, resumeRecord };
}

export default async function handle({ req, res, url }) {
  // Connector registry
  if (req.method === "GET" && url.pathname === "/api/connectors") {
    json(res, 200, { connectors: listConnectors() }); return true;
  }

  // GTM Graph — default template
  if (req.method === "GET" && url.pathname === "/api/graph/template") {
    try {
      const requestedProjectId = explicitProjectId({}, url);
      const selectedProject = requestedProjectId ? loadProject({ projectId: requestedProjectId }) : loadProject();
      const requested = url.searchParams.get("channel") || selectedProject.activeChannelId;
      if (!requested) {
        json(res, 404, { error: "No channel exists yet. Create one before opening a graph." });
        return true;
      }
      const scope = resolveScopedGraph(requested, { projectId: requestedProjectId ?? selectedProject.id });
      const saved = loadFlow(scope.graphId, null, { projectId: scope.project.id });
      const graph = saved.graph ?? null;
      if (!graph) {
        json(res, 404, { error: `Graph not found: ${scope.graphId}` });
        return true;
      }
      json(res, 200, {
        projectId: scope.project.id,
        graph: applySharedContextToGraph(graph, scope.project.sharedContext, {
          channelOffer: channelOfferFor(scope.project, scope.graphId),
        }),
        runs: saved.runs.slice(-10).map((run) => run.result),
      });
    } catch (err) {
      json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/graph/save") {
    try {
      const body = await readBody(req);
      if (!body.graph || !Array.isArray(body.graph.nodes)) {
        throw new Error("Request must include a graph object with a nodes array.");
      }
      const projectId = explicitProjectId(body);
      const scope = resolveScopedGraph(body.graph.id, { projectId, allowNew: true });
      const options = { projectId: scope.project.id };
      const prior = loadFlow(scope.graphId, null, options);
      assertGraphAuthorityMatches(body.graph, prior.graph);
      validateWallGraph(body.graph);
      const saved = saveFlow(body.graph, options);
      if (scope.isNew) {
        const channelId = String(body.channelId ?? body.graph.id).trim();
        const collision = (scope.project.channels ?? []).find((channel) => channel.id === channelId);
        if (collision) throw routeError(`Channel id ${channelId} already belongs to graph ${collision.graphId}.`, { status: 409 });
        registerComposedChannel({
          id: channelId,
          graphId: body.graph.id,
          name: body.graph.name ?? channelId,
          objective: body.graph.objective ?? "",
          kind: body.graph.kind ?? "custom",
        }, options);
      }
      json(res, 200, { projectId: scope.project.id, graph: saved.graph, savedAt: saved.updatedAt });
    } catch (err) { json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  // Explain — fill in a one-line rationale for every node and edge of an already-composed pipeline
  // that predates rationale. Reads the persisted graph, rents the model to reason over its real
  // labels/kinds/edges (no product facts invented), persists the rationale back, and returns the
  // updated graph. Idempotent: a graph already fully annotated skips the model call and re-saves
  // nothing unless `force` is passed. Read-shaped — it never runs the pipeline, never sends.
  if (req.method === "POST" && url.pathname === "/api/graph/explain") {
    try {
      const body = await readBody(req);
      const requested = body.channelId || body.workflowId || body.graphId;
      if (!requested) throw new Error("Request must include a channelId, workflowId, or graphId.");
      const scope = resolveScopedGraph(requested, { projectId: explicitProjectId(body) });
      const options = { projectId: scope.project.id };
      const saved = loadFlow(scope.graphId, null, options);
      if (!saved.graph) throw new Error(`Graph not found: ${scope.graphId}`);
      const explain = createClaudeExplainer({ cwd: scope.project.sharedContext?.repository?.repo || process.cwd() });
      const updated = await explainComposedGraph(saved.graph, { explain, force: body.force === true });
      // Only persist when something actually changed — the idempotent skip returns the same object.
      if (updated !== saved.graph) saveFlow(updated, options);
      json(res, 200, { projectId: scope.project.id, graph: updated });
    } catch (err) { json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/graph/operations") {
    try {
      const body = await readBody(req);
      if (!body.graph || !Array.isArray(body.graph.nodes)) {
        throw new Error("Request must include a graph object with a nodes array.");
      }
      json(res, 200, applyGraphOperations(body.graph, body.operations));
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
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
    return true;
  }

  // GTM Graph — run
  if (req.method === "POST" && url.pathname === "/api/graph/run") {
    try {
      const body = await readBody(req);
      const prepared = await prepareGraphRun(body);
      const { project, graphId, options, prior, runtimeGraph, memory, resumeRecord } = prepared;
      const result = await runGraph(runtimeGraph, {
        targetNodeId: typeof body.targetNodeId === "string" ? body.targetNodeId : undefined,
        approvals: body.approvals && typeof body.approvals === "object" ? body.approvals : {},
        decisions: body.decisions && typeof body.decisions === "object" ? body.decisions : {},
        memory,
        designState: getDesignState(project.id),
        // Ground on the real scan report — the SAME cited product truth the operator path threads in —
        // so a direct/streaming run drafts from the win event, attribution, and gaps with their
        // file:line citations instead of returning evidenceState "blind" with no evidence.
        grounding: buildRunGrounding(project, reportForProject(project)),
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
        authorizeRelease: releaseAuthorizer(req, project.id),
        // The live delivery seam for an approved item (real Gmail send). WHETHER a message may leave is
        // still the item's gate stamp; this only wires HOW an approved one is delivered. Absent it, every
        // execute connector stages locally.
        sendRunners: defaultSendRunners(),
        // RAIL 1 — the outward-release capability. releaseAuthorizer above enforces the browser+owner
        // guard and throws on any agent/tokenless approval, so this run is a founder outward-approval path
        // and may carry the host-issued token that lets an approved item actually leave. The capability
        // alone sends nothing — a connector still sends only items the gate stamped approved === true.
        outwardRelease: OUTWARD_RELEASE,
        // Presence resolved for this run path too (rail 1, FIX 2a): an away founder holds an unattended
        // standing-autonomy auto-approval of a possibly-outward item. A live browser run heartbeats present.
        founderPresent: isFounderPresent(),
      });
      const saved = recordFlowRun({ ...body.graph, id: graphId }, result, options);
      reconcileDirectRunWithOperator({ projectId: project.id, graphId, result }, options);
      // One seam fires all three run-completion derivations: taste ledger, People promotion, and the
      // per-channel experiment. Read-derived GTM state only — never health, never a gate.
      recordRunDerivations({ projectId: project.id, graph: body.graph, result }, options);
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
      const status = statusFor(err);
      json(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // GTM Graph — run with streaming (SSE). Same engine + memory + ledger as /run, but
  // emits one event per step so the UI animates the flow and reveals content as each
  // step succeeds. "Latency is design material" — real steps shown as they happen.
  if (req.method === "POST" && url.pathname === "/api/graph/run/stream") {
    let body;
    let prepared;
    try {
      body = await readBody(req);
      prepared = await prepareGraphRun(body);
      // Reject authority failures before committing the SSE response so callers get a loud HTTP 403.
      if (hasApproveIntent(body.approvals ?? {}, body.decisions ?? {})) {
        releaseAuthorizer(req, prepared.project.id)();
      }
    } catch (err) { json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) }); return true; }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const send = (event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); };

    try {
      const { project, graphId, options, prior, runtimeGraph, memory, resumeRecord } = prepared;
      send({ type: "run_start", nodeIds: runtimeGraph.nodes.map((n) => n.id) });
      const result = await runGraph(runtimeGraph, {
        targetNodeId: typeof body.targetNodeId === "string" ? body.targetNodeId : undefined,
        approvals: body.approvals && typeof body.approvals === "object" ? body.approvals : {},
        decisions: body.decisions && typeof body.decisions === "object" ? body.decisions : {},
        memory,
        designState: getDesignState(project.id),
        // Same cited product truth on the streaming path — the real scan report, not a blind grounding.
        grounding: buildRunGrounding(project, reportForProject(project)),
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
        authorizeRelease: releaseAuthorizer(req, project.id),
        // Same live delivery seam on the streaming run path — the gate stamp still governs whether a
        // message may leave; this only wires how an approved one is delivered.
        sendRunners: defaultSendRunners(),
        // RAIL 1 — the outward-release capability. Same founder outward-approval path as /run (guarded by
        // releaseAuthorizer above); it carries the host-issued token that lets an approved item actually
        // leave. The capability sends nothing on its own — the gate stamp still governs whether.
        outwardRelease: OUTWARD_RELEASE,
        // Presence resolved for the streaming run path too (rail 1, FIX 2a).
        founderPresent: isFounderPresent(),
        onEvent: send,
      });
      const saved = recordFlowRun({ ...body.graph, id: graphId }, result, options);
      reconcileDirectRunWithOperator({ projectId: project.id, graphId, result }, options);
      recordRunDerivations({ projectId: project.id, graph: body.graph, result }, options);
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
    return true;
  }

  // ── Capabilities (external MCP servers) ──────────────────────────────────
  // Connectors are MCP servers Claude calls. The host lists them, classifies each
  // tool read/write, and holds the writes behind the gate. See mcp-store / mcp-client.
  if (req.method === "GET" && url.pathname === "/api/capabilities") {
    json(res, 200, { servers: listServers().map(serverView) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/capabilities/connect") {
    try {
      authorizeFounderWriteForRequest(req, "Connecting an external capability");
      const body = await readBody(req);
      if (!body.id && !body.name) throw new Error("connect requires an id or name");
      let tools = Array.isArray(body.tools) ? body.tools : null;
      // The bundled local demo MCP server — a real stdio connection (not seeded data),
      // resolved server-side so the browser never needs the absolute path.
      if (body.demo) {
        body.command = process.execPath;
        body.args = [path.join(srcDir, "demo", "mcp-demo-server.mjs")];
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
      json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const reclassifyMatch = url.pathname.match(/^\/api\/capabilities\/([^/]+)\/reclassify$/);
  if (req.method === "POST" && reclassifyMatch) {
    try {
      const body = await readBody(req);
      const serverId = decodeURIComponent(reclassifyMatch[1]);
      const existing = getServer(serverId, {});
      const tool = existing?.tools.find((t) => t.name === body.tool);
      const loosening = body.lane === "read" && tool && tool.class === "write";
      if (loosening) authorizeFounderWriteForRequest(req, "Loosening a capability wall");
      // Loosening the wall is the weighty act — the founder must confirm explicitly.
      if (loosening && body.confirm !== true) {
        json(res, 409, { error: "Loosening the wall needs confirmation", needsConfirm: true });
        return true;
      }
      const { server, loosenedWall } = reclassifyTool(serverId, body.tool, body.lane, {});
      json(res, 200, { server: serverView(server), loosenedWall });
    } catch (err) {
      json(res, statusFor(err), { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const capabilityMatch = url.pathname.match(/^\/api\/capabilities\/([^/]+)$/);
  if (req.method === "DELETE" && capabilityMatch) {
    try {
      removeServer(decodeURIComponent(capabilityMatch[1]), {});
      json(res, 200, { servers: listServers().map(serverView) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
