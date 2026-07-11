// Object-graph projection routes — the phase-1 GTM graph over the object model: read, position, mutate,
// compile a highlighted path, and ideate provisional candidate cards. Moved verbatim out of server.mjs.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { buildRunGrounding } from "../run-grounding.mjs";
import { marketObjectStore } from "../gtm-store.mjs";
import { compileRunFromPath } from "../run-compile.mjs";
import { createClaudeComposer } from "../composition.mjs";
import { ensureObjectGraphProductScan, objectGraphForProject } from "../object-graph-projection.mjs";
import { CanvasLayoutConflictError, PROJECT_CANVAS_LAYOUT_NAMESPACE, objectGraphLayoutStore, objectGraphStore } from "../object-graph-store.mjs";
import { CanvasStructureHistoryConflictError, canvasStructureHistoryStore } from "../canvas-structure-history.mjs";
import { applyObjectGraphOperations } from "../object-graph-operations.mjs";
import { ideateObjectCandidates, createClaudeIdeaGenerator, createClaudeObjectIdeaGenerator } from "../ideation.mjs";
import {
  runMarketResearch,
  createClaudeMarketResearcher,
  founderInputsFromSharedContext,
} from "../market-research.mjs";

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

export default async function handle({ req, res, url }) {
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
    return true;
  }

  const projectObjectGraphPositionsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/object-graph\/positions$/);
  if (req.method === "POST" && projectObjectGraphPositionsMatch) {
    try {
      const projectId = decodeURIComponent(projectObjectGraphPositionsMatch[1]);
      loadProject({ projectId });
      const body = await readBody(req);
      if (!Number.isInteger(body?.expectedRevision) || body.expectedRevision < 0) {
        throw new Error("expectedRevision must be a non-negative integer.");
      }
      const headerIdempotencyKey = String(req.headers["idempotency-key"] ?? "").trim();
      const bodyIdempotencyKey = String(body?.idempotencyKey ?? "").trim();
      if (headerIdempotencyKey && bodyIdempotencyKey && headerIdempotencyKey !== bodyIdempotencyKey) {
        throw new Error("Idempotency-Key header and body idempotencyKey must match.");
      }
      const idempotencyKey = headerIdempotencyKey || bodyIdempotencyKey;
      if (!idempotencyKey) throw new Error("An idempotencyKey is required for canvas layout writes.");
      const result = canvasStructureHistoryStore.applyLayout(
        projectId,
        body?.geometry ?? (body?.positions ? body : { positions: body ?? {} }),
        { ...body, idempotencyKey, revisionAuthor: body?.revisionAuthor || "founder" },
      );
      const layout = result.layout;
      json(res, 200, { projectId, positions: layout.positions, savedAt: layout.updatedAt, geometry: layout, historyReceipt: result.receipt, historyRevision: result.history.revision });
    } catch (err) {
      const status = err instanceof CanvasLayoutConflictError || err instanceof CanvasStructureHistoryConflictError || /Stale canvas layout revision/i.test(err instanceof Error ? err.message : String(err)) ? 409 : 400;
      json(res, status, {
        error: err instanceof Error ? err.message : String(err),
        ...(err instanceof CanvasLayoutConflictError ? {
          code: err.code,
          expectedRevision: err.expectedRevision,
          actualRevision: err.actualRevision,
        } : err instanceof CanvasStructureHistoryConflictError ? {
          code: err.code,
          expectedRevision: err.expectedRevision,
          actualRevision: err.actualRevision,
        } : {}),
      });
    }
    return true;
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
    return true;
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
    return true;
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
      if (!target) { json(res, 400, { error: "Ideation needs a target — what kind of new card to explore." }); return true; }
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
    return true;
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
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); return true; }
    const target = String(body?.target || "").trim();
    if (!target) { json(res, 400, { error: "Ideation needs a target — what kind of new card to explore." }); return true; }

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
    return true;
  }

  return false;
}
