// GTM graph routes (template/save/operations/audit/run/run+stream) plus the connector registry and the
// external-MCP capabilities surface. Moved verbatim out of server.mjs. The run paths carry the human-only
// gate guard (authorizeReleaseForRequest); the default execute connector stages locally and never sends.
import path from "node:path";
import { json, readBody, channelOfferFor, srcDir } from "./util.mjs";
import { loadProject, applySharedContextToGraph, getChannel } from "../project-store.mjs";
import { loadFlow, recordFlowRun, saveFlow } from "../flow-store.mjs";
import { applyGraphOperations, validateGraph } from "../graph-operations.mjs";
import { auditGraphContracts } from "../contracts.mjs";
import { buildDraftMemory, extractDecisions } from "../memory.mjs";
import { ideaTasteForProject } from "../feedback-ledger.mjs";
import { getDesignState } from "../design-state-store.mjs";
import { buildRunGrounding } from "../run-grounding.mjs";
import { buildMarketContext } from "../market-research.mjs";
import { marketObjectStore } from "../gtm-store.mjs";
import { createDerivedSourceLoader } from "../cross-reference.mjs";
import { liveStepRuntime } from "../agent-bridge.mjs";
import { runGraph } from "../graph.mjs";
import { defaultSendRunners } from "../connectors/execute/gmail-transport.mjs";
import { recordRunDerivations } from "../run-derivation.mjs";
import { listConnectors } from "../connectors/registry.mjs";
import { listServers, getServer, recordServer, removeServer, reclassifyTool, serverView } from "../mcp-store.mjs";
import { connectStdioServer } from "../mcp-client.mjs";
import { authorizeReleaseForRequest } from "./session-guard.mjs";

export default async function handle({ req, res, url }) {
  // Connector registry
  if (req.method === "GET" && url.pathname === "/api/connectors") {
    json(res, 200, { connectors: listConnectors() }); return true;
  }

  // GTM Graph — default template
  if (req.method === "GET" && url.pathname === "/api/graph/template") {
    const project = loadProject();
    const requested = url.searchParams.get("channel") || project.activeChannelId;
    if (!requested) {
      json(res, 404, { error: "No channel exists yet. Create one before opening a graph." });
      return true;
    }
    let graphId = requested;
    try { graphId = getChannel(project, requested).graphId; } catch { /* legacy graph id */ }
    const saved = loadFlow(graphId, null);
    const graph = saved.graph ?? null;
    if (!graph) {
      json(res, 404, { error: `Graph not found: ${graphId}` });
      return true;
    }
    json(res, 200, {
      graph: applySharedContextToGraph(graph, project.sharedContext, { channelOffer: channelOfferFor(project, graphId) }),
      runs: saved.runs.slice(-10).map((run) => run.result),
    }); return true;
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
        // The live delivery seam for an approved item (real Gmail send). WHETHER a message may leave is
        // still the item's gate stamp; this only wires HOW an approved one is delivered. Absent it, every
        // execute connector stages locally.
        sendRunners: defaultSendRunners(),
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
    return true;
  }

  // GTM Graph — run with streaming (SSE). Same engine + memory + ledger as /run, but
  // emits one event per step so the UI animates the flow and reveals content as each
  // step succeeds. "Latency is design material" — real steps shown as they happen.
  if (req.method === "POST" && url.pathname === "/api/graph/run/stream") {
    let body;
    try {
      body = await readBody(req);
      if (!body.graph || !Array.isArray(body.graph.nodes)) throw new Error("Request must include a graph object with a nodes array.");
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); return true; }

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
        // Same live delivery seam on the streaming run path — the gate stamp still governs whether a
        // message may leave; this only wires how an approved one is delivered.
        sendRunners: defaultSendRunners(),
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
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
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
      // Loosening the wall is the weighty act — the founder must confirm explicitly.
      if (loosening && body.confirm !== true) {
        json(res, 409, { error: "Loosening the wall needs confirmation", needsConfirm: true });
        return true;
      }
      const { server, loosenedWall } = reclassifyTool(serverId, body.tool, body.lane, {});
      json(res, 200, { server: serverView(server), loosenedWall });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
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
