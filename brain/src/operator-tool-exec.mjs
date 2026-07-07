// The operator's tool dispatcher: executeTool routes every typed tool name, and executeGraphRun is the
// drive-to-gate loop the run tools share. Moved verbatim out of operator-runtime.mjs — logic is
// byte-identical. Depends on the run-core mechanics and the composers; the orchestrator imports
// executeTool back (and re-exports it as executeOperatorTool), so no import cycle is introduced.
import path from "node:path";
import { getEngineState } from "./engine.mjs";
import { liveStepRuntime } from "./agent-bridge.mjs";
import { buildMicroproduct } from "./build.mjs";
import { storeRoot } from "./store-fs.mjs";
import { createClaudeComposer } from "./composition.mjs";
import { createClaudeProductModeler } from "./product-model-generator.mjs";
import { recordFlowRun, saveFlow } from "./flow-store.mjs";
import { buildRunGrounding } from "./run-grounding.mjs";
import { createDerivedSourceLoader } from "./cross-reference.mjs";
import { recordRunDerivations } from "./run-derivation.mjs";
import { buildMarketContext } from "./market-research.mjs";
import { marketObjectStore } from "./gtm-store.mjs";
import { applyGraphOperations, validateGraph } from "./graph-operations.mjs";
import { listConnectors, runGraph } from "./graph.mjs";
import { executeDomainCommand } from "./domain-commands.mjs";
import { saveOperatorSession } from "./operator-store.mjs";
import { loadProject, registerComposedChannel, updateSharedContext } from "./project-store.mjs";
import { composeNakedGraph } from "./workflow-composer.mjs";
import { composeCandidates, createClaudeCandidateComposer } from "./candidate-composer.mjs";
import { annotateRunEvidence } from "./evidence-lines.mjs";
import { composeIdeas, createClaudeAngleProposer, createClaudeIdeaGenerator } from "./ideation.mjs";
import { createClaudeIdeaBar } from "./idea-bar.mjs";
import { attachBuildWiring, createGtmIdea, getGtmIdea, listGtmIdeas, saveGtmIdea } from "./idea-store.mjs";
import { compareChannelRuns } from "./run-compare.mjs";
import {
  addEvent,
  compactProduct,
  designStateFor,
  firstNonEmpty,
  flowFor,
  latestWorkspace,
  memoryFor,
  summarizeRun,
} from "./operator-run-core.mjs";

// Close the FRONT of the run→idea loop: once compose_and_run builds the channel for a founder-picked
// idea, bind that channel's graph id onto the idea (idea-store.attachBuildWiring). Without this, the
// idea's buildWiring carries only the goal it was pre-wired with, so when the channel later runs to the
// gate, idea-derivation.recordIdeaOutcomeFromRun can never match the run back to the idea and the loop
// stays open. The id is found explicitly (the operator passes idea_id) or, as a deterministic fallback,
// by matching the pre-wired goal — bookkeeping, never a model judgment. Best-effort: a miss is a no-op,
// never a thrown error that breaks the build, exactly like the other run-derived state.
function bindComposedChannelToIdea({ projectId = null, ideaId = null, goal = "", channelId } = {}, options = {}) {
  if (!channelId) return null;
  try {
    let idea = null;
    if (ideaId) {
      try { idea = getGtmIdea(ideaId, options); } catch { idea = null; }
    }
    if (!idea && goal) {
      idea = listGtmIdeas({ ...options, projectId }).find((candidate) =>
        !candidate.killed
        && candidate.buildWiring && typeof candidate.buildWiring === "object"
        && candidate.buildWiring.kind === "compose_and_run"
        && candidate.buildWiring.goal === goal
        && !candidate.buildWiring.channelId) ?? null;
    }
    if (!idea || idea.killed) return null;
    const wiring = (idea.buildWiring && typeof idea.buildWiring === "object") ? idea.buildWiring : {};
    if (wiring.channelId === channelId) return idea; // already bound
    return attachBuildWiring(idea.id, { ...wiring, channelId, graphId: channelId }, options);
  } catch {
    return null;
  }
}

// The live microproduct producer, loaded LAZILY so this module imports cleanly even before the
// microproduct-composer/agent-bridge producer legs land (they are built in parallel). The producer is
// read-only: it cuts an artifact (spec + files) from the scanned product on the founder's subscription
// and never deploys. A test injects options.produceMicroproduct to run keyless; this is the live default.
async function liveProduceMicroproduct({ goal, grounding, repo, options }) {
  const { produceMicroproduct, createClaudeMicroproductProducer } = await import("./microproduct-composer.mjs");
  const { createClaudeMicroproductInvoker } = await import("./agent-bridge.mjs");
  return produceMicroproduct({ goal, grounding }, {
    ...options,
    produce: createClaudeMicroproductProducer({ invoke: createClaudeMicroproductInvoker({ cwd: repo }) }),
  });
}

async function executeGraphRun(session, { targetNodeId, stream = false } = {}, options = {}) {
  const flow = flowFor(session, options);
  // When streaming is on (the autonomous compose_and_run drive), surface each step as it executes —
  // "running node X", "drafted N items", "reached the gate" — onto the durable session events so the
  // UI can animate progress instead of seeing one batch at the end. The events are persisted through
  // saveOperatorSession (mutating the local `session` ref), the same mechanism every other event uses.
  let live = session;
  const onEvent = stream
    ? (event) => {
        if (event.type === "node_start") {
          live = addEvent(live, {
            type: "operator_node_start",
            title: `Running ${event.label || event.nodeId}`,
            detail: event.category ? `${event.kind || "tool"} · ${event.category}` : (event.ref || event.kind || "tool"),
            data: { nodeId: event.nodeId, category: event.category, kind: event.kind, ref: event.ref },
          }, options);
        } else if (event.type === "node_done") {
          const r = event.result ?? {};
          const count = Array.isArray(r.items) ? r.items.length : 0;
          live = addEvent(live, {
            type: r.pendingReview ? "operator_reached_gate" : "operator_node_done",
            title: r.pendingReview
              ? `Reached the founder gate · ${count} item${count === 1 ? "" : "s"} awaiting release`
              : `${r.category === "gate" ? "Gate" : r.category === "generate" || r.kind === "agent" ? "Drafted" : "Completed"} ${event.nodeId} · ${count} item${count === 1 ? "" : "s"}`,
            detail: r.ok === false ? (r.error ?? "Step failed.") : null,
            data: { nodeId: event.nodeId, ok: r.ok, itemCount: count, pendingReview: r.pendingReview ?? false },
          }, options);
        }
      }
    : null;
  const result = await runGraph(flow.graph, {
    targetNodeId,
    memory: memoryFor(flow.runs, options, session.projectId),
    designState: designStateFor(session, options),
    // Ground the run on the researched buyer picture (the persisted MarketObjects), not just
    // founder-typed guesses — a projection over the stored objects; null when none are researched.
    market: buildMarketContext(marketObjectStore.list({ ...options, projectId: session.projectId || "default" })),
    // Ground every subagent on the product it serves + what's already been tried, so operator-driven
    // runs get the same product map and run history as the direct/streaming graph-run endpoints.
    grounding: buildRunGrounding(flow.project),
    runs: flow.runs,
    // The live subscription-backed step runtime by default; a test injects a fake through
    // options.stepRuntime so the open agent/skill/code steps run keyless.
    stepRuntime: options.stepRuntime || liveStepRuntime({ cwd: options.cwd }),
    loadLastRunItems: createDerivedSourceLoader({ ...options, projectId: session.projectId || "default" }),
    // BYO credentials: a founder-pasted key for this project wins over env; options carries the
    // persistence root so the stored key resolves from the same store the founder saved it in.
    projectId: session.projectId || "default",
    credentialOptions: options,
    onEvent,
  });
  if (stream) session = live;
  // Ground the drafts the founder is about to review: attach evidence_lines to any item whose claim
  // names a real scanned fact (file:line), drawn straight from the active scan report. Honest by
  // construction — a ref is never fabricated, and an item with nothing grounded gets no field. A run
  // with no product grounding is left exactly as-is. Runs before persistence so the stored run and the
  // pending-gate artifacts both carry the evidence the gate renders.
  const evidenceWorkspace = latestWorkspace(session, options);
  if (evidenceWorkspace?.report) annotateRunEvidence(result, evidenceWorkspace.report);
  const stored = recordFlowRun(flow.graph, result, options);
  // Bank the run's derivations (founder-gate taste signals, promotions) for their side effects.
  recordRunDerivations({ projectId: session.projectId || "default", graph: flow.graph, result }, options);
  let next = {
    ...session,
    lastRunId: result.runId,
    graphRevision: flow.graph.revision ?? 0,
  };
  next = addEvent(next, {
    type: "run_completed",
    title: targetNodeId ? `Ran ${targetNodeId}` : "Ran the full loop",
    detail: result.pendingGates.length
      ? `Paused at ${result.pendingGates.length} founder gate${result.pendingGates.length === 1 ? "" : "s"}.`
      : result.ok ? "The run completed successfully." : result.error,
    data: {
      runId: result.runId,
      ok: result.ok,
      targetNodeId: targetNodeId ?? null,
      pendingGates: result.pendingGates,
      storedRunCount: stored.runs.length,
    },
  }, options);
  if (result.pendingGates.length) {
    next = saveOperatorSession({
      ...next,
      status: "waiting_for_gate",
      pendingGate: {
        runId: result.runId,
        nodeIds: result.pendingGates,
        runResult: result,
      },
      error: null,
    }, options);
  }
  return { session: next, result };
}

export async function executeTool(session, tool, options = {}) {
  const input = tool.input ?? {};
  if (tool.name === "inspect_shared_context") {
    const project = loadProject(options);
    const next = addEvent(session, {
      type: "inspection",
      title: "Inspected shared product intelligence",
      detail: `Shared context v${project.sharedContext.version} is used by every channel.`,
    }, options);
    return { session: next, result: project.sharedContext, pause: false };
  }

  if (tool.name === "update_shared_context") {
    const project = updateSharedContext(input.patch, options);
    const next = addEvent(session, {
      type: "shared_context_updated",
      title: "Updated shared GTM intelligence",
      detail: input.rationale,
      data: { version: project.sharedContext.version, fields: Object.keys(input.patch ?? {}) },
    }, options);
    return {
      session: next,
      result: { sharedContext: project.sharedContext },
      pause: false,
    };
  }

  if (tool.name === "inspect_product") {
    const workspace = latestWorkspace(session, options);
    let next = session;
    if (workspace && !session.workspaceId) next = saveOperatorSession({ ...session, workspaceId: workspace.id }, options);
    next = addEvent(next, {
      type: "inspection",
      title: workspace ? "Inspected product evidence" : "Product grounding is missing",
      detail: workspace?.report?.headline ?? "No repository workspace is open.",
    }, options);
    return { session: next, result: compactProduct(workspace), pause: false };
  }

  // Living Product Picture — three in-process commands through executeDomainCommand (the same
  // chokepoint Door 1 uses). derive injects the live generator; revise/signal are pure host state
  // moves. The verbs (Derive/Revise/Record) carry no forbidden outbound meaning — the picture stays
  // inside the founder-gate wall.
  if (tool.name === "derive_product_model") {
    const project = loadProject(options);
    const repo = options.cwd || project.sharedContext?.repository?.repo || process.cwd();
    const productModel = await executeDomainCommand("DeriveProductModel", {
      ...input,
      projectId: project.id,
    }, { ...options, projectId: project.id, generate: options.generate || createClaudeProductModeler({ cwd: repo }) });
    const next = addEvent(session, {
      type: "product_model_derived",
      title: "Derived the product picture",
      detail: `${productModel?.things?.length ?? 0} things · ${productModel?.relationships?.length ?? 0} relationships · ${productModel?.userGoals?.length ?? 0} goals · ${productModel?.states?.length ?? 0} states`,
      data: { modelId: productModel?.id ?? null },
    }, options);
    return { session: next, result: productModel, pause: false };
  }

  if (tool.name === "revise_product_model") {
    const project = loadProject(options);
    const productModel = await executeDomainCommand("ReviseProductModel", {
      ...input,
      projectId: project.id,
    }, { ...options, projectId: project.id });
    const next = addEvent(session, {
      type: "product_model_revised",
      title: "Revised the product picture",
      detail: `Now version ${productModel?.version ?? "?"}.`,
      data: { modelId: productModel?.id ?? null, version: productModel?.version ?? null },
    }, options);
    return { session: next, result: productModel, pause: false };
  }

  if (tool.name === "record_product_signal") {
    const project = loadProject(options);
    const productModel = await executeDomainCommand("RecordProductSignal", {
      ...input,
      projectId: project.id,
    }, { ...options, projectId: project.id });
    const next = addEvent(session, {
      type: "product_signal_recorded",
      title: "Pinned a real-world signal onto the product picture",
      detail: `${productModel?.pinnedSignals?.length ?? 0} signals pinned.`,
      data: { modelId: productModel?.id ?? null },
    }, options);
    return { session: next, result: productModel, pause: false };
  }

  if (tool.name === "inspect_graph") {
    const flow = flowFor(session, options);
    const next = addEvent(session, {
      type: "inspection",
      title: "Inspected the executable graph",
      detail: `${flow.graph.nodes.length} nodes · ${flow.graph.edges.length} edges · ${flow.runs.length} recorded runs`,
    }, options);
    return {
      session: next,
      result: {
        graph: flow.graph,
        recentRuns: flow.runs.slice(-5).map((run) => ({
          id: run.id,
          createdAt: run.createdAt,
          ok: run.ok,
          pendingGates: run.pendingGates,
        })),
      },
      pause: false,
    };
  }

  if (tool.name === "inspect_problems") {
    const flow = flowFor(session, options);
    const workspace = latestWorkspace(session, options);
    const connectors = listConnectors();
    const engine = getEngineState({
      report: workspace?.report ?? null,
      runs: flow.runs,
      graph: flow.graph ?? null,
      connectors,
    });
    const next = addEvent(session, {
      type: "inspection",
      title: "Inspected live problems",
      detail: engine.investigations.length
        ? `${engine.investigations.length} ranked problem${engine.investigations.length === 1 ? "" : "s"} found.`
        : "No active investigation is currently derived.",
    }, options);
    return {
      session: next,
      result: { engine, connectors },
      pause: false,
    };
  }

  if (tool.name === "patch_graph") {
    const next = addEvent(session, {
      type: "graph_patch_rejected",
      title: "Direct graph patch rejected",
      detail: "Agent graph edits must be staged with propose_graph_changes for founder review.",
      data: { tool: "patch_graph" },
    }, options);
    return {
      session: next,
      result: { ok: false, error: "Use propose_graph_changes; direct agent graph patches are not allowed." },
      pause: false,
    };
  }

  if (tool.name === "propose_graph_changes") {
    const flow = flowFor(session, options);
    // Validate by applying to a clone — this throws on any invalid op and yields the preview the
    // founder will review. The real graph is NOT touched; nothing is saved until they accept.
    const preview = applyGraphOperations(flow.graph, input.operations);
    const proposalId = `proposal-${Date.now()}`;
    const next = addEvent({
      ...session,
      status: "waiting_for_proposal",
      pendingProposal: {
        id: proposalId,
        graphId: flow.graph.id,
        baseRevision: flow.graph.revision ?? 0,
        rationale: input.rationale,
        operations: input.operations,
        changes: preview.changes,
        preview: preview.graph,
      },
      error: null,
    }, {
      type: "graph_proposed",
      title: "Proposed graph changes for review",
      detail: input.rationale,
      data: { proposalId, changes: preview.changes },
    }, options);
    return {
      session: next,
      result: { paused: true, proposalId, changes: preview.changes },
      pause: true,
    };
  }

  if (tool.name === "validate_graph") {
    const flow = flowFor(session, options);
    const validation = validateGraph(flow.graph);
    const next = addEvent(session, {
      type: "validation",
      title: validation.ok ? "Graph validation passed" : "Graph validation failed",
      detail: validation.ok ? "Node, edge, and cycle checks passed." : validation.errors.join(" "),
    }, options);
    return { session: next, result: validation, pause: false };
  }

  if (tool.name === "run_node") {
    const run = await executeGraphRun(session, { targetNodeId: input.nodeId }, options);
    return { session: run.session, result: summarizeRun(run.result), pause: run.session.status === "waiting_for_gate" };
  }

  if (tool.name === "run_loop") {
    const run = await executeGraphRun(session, { stream: true }, options);
    return { session: run.session, result: summarizeRun(run.result), pause: run.session.status === "waiting_for_gate" };
  }

  // JOB 2 — the autonomous drive. One move: compose the workflow for the goal if this session has no
  // graph yet, then run it to the shared founder gate, streaming each step onto the session events.
  // It never sends — the run stops at the gate for an authorized human release (JOB 1). This is the
  // operator COMPOSING and DRIVING a goal end-to-end in a single pass.
  if (tool.name === "compose_and_run") {
    const goal = firstNonEmpty(input.goal, session.goal);
    let working = session;

    // A founder-picked candidate SHAPE to build (nodes/edges), passed by resolveOperatorCandidates or a
    // UI build call. When present, the model already sketched it and the founder chose it — build that
    // exact shape instead of composing fresh. It re-enters the SAME composeNakedGraph path (normalize,
    // bind IO, re-assert the wall, validate), so a seeded shape gets no weaker safety than a fresh one.
    const seededShape = input.candidate && typeof input.candidate === "object" && Array.isArray(input.candidate.nodes)
      ? input.candidate
      : null;

    // Compose when this session has no executable graph yet, OR when the founder asks for an additional
    // pipeline (compose_new) — a product holds many pipelines, and each compose persists a distinct
    // channel that joins the others on the overview. Otherwise drive the pipeline this session has.
    if (!working.graphId || input.compose_new) {
      working = addEvent(working, {
        type: "operator_composing",
        title: working.graphId ? "Composing another pipeline" : "Composing the workflow",
        detail: seededShape ? `Building the founder's chosen shape for: ${goal}` : `Designing the channel for: ${goal}`,
        data: { goal },
      }, options);
      const composeRepo = options.cwd || loadProject(options).sharedContext?.repository?.repo || process.cwd();
      const composeFn = seededShape
        ? async () => ({ ok: true, nodes: seededShape.nodes, edges: Array.isArray(seededShape.edges) ? seededShape.edges : [] })
        : (options.compose || createClaudeComposer({ cwd: composeRepo }));
      const composed = await composeNakedGraph({
        title: firstNonEmpty(input.title, seededShape?.label, goal),
        objective: goal,
        agents: Array.isArray(input.agents) ? input.agents : [],
      }, {
        ...options,
        compose: composeFn,
      });
      // Register the composed pipeline as a channel on the product so it joins the others on the
      // overview — composeNakedGraph saved the flow but a pipeline only appears once it's a channel.
      registerComposedChannel({
        id: composed.channel.id,
        graphId: composed.channel.graphId,
        name: composed.channel.name,
        objective: goal,
      }, options);
      // If this build came from a founder-picked idea, wire the channel back onto the idea so the run's
      // gate outcome closes the loop onto it (idea-derivation). Deterministic bookkeeping, best-effort.
      bindComposedChannelToIdea({
        projectId: session.projectId ?? null,
        ideaId: typeof input.idea_id === "string" ? input.idea_id : null,
        goal,
        channelId: composed.channel.graphId,
      }, options);
      working = addEvent({
        ...working,
        graphId: composed.channel.graphId,
        graphRevision: composed.graph.revision,
      }, {
        type: "operator_workflow_composed",
        title: `Composed ${composed.channel.name}`,
        detail: `${composed.graph.nodes.length} steps with a founder gate — ready to run to the gate.`,
        data: { channelId: composed.channel.id, graphId: composed.channel.graphId, nodes: composed.graph.nodes.length },
      }, options);
    } else {
      working = addEvent(working, {
        type: "operator_composing",
        title: "Driving the existing workflow",
        detail: "This session already has a composed workflow — running it to the gate.",
        data: { graphId: working.graphId },
      }, options);
    }

    working = addEvent(working, {
      type: "operator_running",
      title: "Running the workflow to the gate",
      detail: "Research, enrich, and draft steps run; the run stops at the shared founder gate.",
    }, options);

    const run = await executeGraphRun(working, { stream: true }, options);
    return { session: run.session, result: summarizeRun(run.result), pause: run.session.status === "waiting_for_gate" };
  }

  // JOB 2c — the FORK. When a goal admits several genuinely distinct go-to-market shapes, the operator
  // does not guess one — it sketches 2–3 candidate pipelines and PAUSES for the founder to pick, exactly
  // like ideate pauses with ideas and a gate pauses with drafts. NOTHING runs, sends, or builds here: a
  // candidate is a shape only. composeCandidates is the one place that both judges ambiguity (the model's
  // call) and returns normalized, wall-checked shapes (the host's guarantee). Picking one is the founder's
  // act (resolveOperatorCandidates), which builds the chosen shape through compose_and_run to the gate.
  if (tool.name === "propose_candidates") {
    const goal = firstNonEmpty(input.goal, session.goal);
    if (!goal) throw new Error("propose_candidates needs a goal.");
    const project = loadProject(options);
    const repo = options.cwd || project.sharedContext?.repository?.repo || process.cwd();
    const workspace = latestWorkspace(session, options);
    const grounding = compactProduct(workspace);
    const compose = options.composeCandidates || createClaudeCandidateComposer({ cwd: repo });

    let working = addEvent(session, {
      type: "operator_composing",
      title: "Weighing candidate pipelines",
      detail: `Judging whether the goal forks, and sketching distinct shapes: ${goal}`,
      data: { goal },
    }, options);

    const { ambiguous, candidates } = await composeCandidates({ goal, grounding, compose });

    // Not a genuine fork — one clear shape. Don't pause; tell the operator to build it directly.
    if (!ambiguous) {
      const next = addEvent(working, {
        type: "operator_note",
        title: "The goal points at one clear shape",
        detail: "No real fork to offer — build it directly with compose_and_run.",
        data: { goal },
      }, options);
      return {
        session: next,
        result: { kind: "single", ambiguous: false, note: "One clear shape; call compose_and_run to build and run it to the gate." },
        pause: false,
      };
    }

    // A real fork — PAUSE with the candidate shapes, mirroring pendingIdeas/pendingGate: durable,
    // founder-resolved. Each candidate carries its full shape so the pick can build it verbatim.
    const next = addEvent({
      ...working,
      status: "waiting_for_candidates",
      pendingCandidates: {
        goal,
        candidates: candidates.map((c) => ({
          id: c.id,
          label: c.label,
          rationale: c.rationale,
          nodeCount: c.nodes.length,
          edgeCount: c.edges.length,
          nodes: c.nodes,
          edges: c.edges,
        })),
      },
      error: null,
    }, {
      type: "candidates_proposed",
      title: `Proposed ${candidates.length} candidate pipeline${candidates.length === 1 ? "" : "s"}`,
      detail: `${candidates.map((c) => c.label).join(" · ")} — pick one to build.`,
      data: { goal, candidateIds: candidates.map((c) => c.id) },
    }, options);
    return {
      session: next,
      result: {
        kind: "candidates",
        paused: true,
        candidates: candidates.map((c) => ({ id: c.id, label: c.label, rationale: c.rationale, nodes: c.nodes, edges: c.edges })),
      },
      pause: true,
    };
  }

  // JOB 2b — the build-and-SHIP door. The deployable twin of compose_and_run: instead of staging a
  // message, it cuts a working MICROPRODUCT from the real product and stages it behind the founder gate.
  // The producer (a read-only, scan-grounded producer with NO deploy path) returns the artifact's
  // spec + files; the host composes a graph whose deploy step is an `execute` node sitting behind a
  // founder `gate` and runs it to that gate. The wall is identical to the send wall: composeNakedGraph
  // re-asserts assertGateWall (every execute node must have a founder gate upstream on every path, or the
  // composition is rejected), and the deploy execute connector (deploy.mjs) ships NOTHING without BOTH the
  // gate stamp AND an explicit founder deploy confirmation — neither of which composition or a run can
  // forge. Deploy is the wall GRADUATING — a founder gate release plus an explicit confirm — never the wall
  // removed, and never reachable from this tool: there is no deploy/approve tool on the agent surface.
  if (tool.name === "compose_microproduct") {
    const goal = firstNonEmpty(input.goal, session.goal);
    if (!goal) throw new Error("compose_microproduct needs a goal.");
    const project = loadProject(options);
    const repo = options.cwd || project.sharedContext?.repository?.repo || process.cwd();
    const workspace = latestWorkspace(session, options);
    const grounding = compactProduct(workspace);

    let working = addEvent(session, {
      type: "operator_composing",
      title: "Building a microproduct",
      detail: `Cutting a deployable artifact from the product for: ${goal}`,
      data: { goal },
    }, options);

    // 1) The producer cuts the artifact (spec + files) from the scanned product. It produces files and
    //    never deploys. Injected (fake) in tests; live = the subscription producer, dynamically loaded.
    const produce = options.produceMicroproduct
      || ((args) => liveProduceMicroproduct({ ...args, repo, options }));
    const built = await produce({ goal, grounding });
    const artifactSpec = built?.artifactSpec ?? null;
    const artifactFiles = Array.isArray(built?.artifactFiles)
      ? built.artifactFiles
      : (Array.isArray(built?.files) ? built.files : null);
    if (!artifactFiles || artifactFiles.length === 0) {
      throw new Error("The microproduct producer returned no files to stage — refusing to compose an empty deploy.");
    }

    // 1b) BUILD the artifact locally BEFORE the gate, so the founder approves a built, previewable
    //     microproduct — not raw file text. buildMicroproduct writes the producer files into an isolated
    //     build dir, runs any local install/build (assertLocalBuildCommand rejects a deploy-like command,
    //     so the build leg can never smuggle a ship), and captures the static preview (entry file + file
    //     list). It NEVER commits, pushes, or deploys. Injectable for tests; the live default is the real
    //     local build leg. A build failure is surfaced but never blocks reaching the gate — the founder
    //     still reviews the raw files, just without a rendered preview.
    const buildLocally = options.buildMicroproduct || buildMicroproduct;
    let preview = null;
    let build = null;
    try {
      build = await buildLocally(
        {
          name: firstNonEmpty(input.title, artifactSpec?.name, "microproduct"),
          files: artifactFiles,
          install: artifactSpec?.install,
          build: artifactSpec?.build ?? artifactSpec?.buildCommand,
          previewDir: artifactSpec?.previewDir,
        },
        { worktreeRoot: path.join(storeRoot(options), "microproduct-builds") },
      );
      preview = build?.preview ?? null;
    } catch {
      build = null;
      preview = null;
    }

    working = addEvent(working, {
      type: "operator_microproduct_built",
      title: "Cut a deployable microproduct",
      detail: preview?.exists
        ? `${artifactSpec?.kind || "artifact"} · ${artifactFiles.length} file${artifactFiles.length === 1 ? "" : "s"} · built preview (${preview.entry || "no entry"}) — staging it behind the founder gate before any deploy.`
        : `${artifactSpec?.kind || "artifact"} · ${artifactFiles.length} file${artifactFiles.length === 1 ? "" : "s"} — staging it behind the founder gate before any deploy.`,
      data: { kind: artifactSpec?.kind ?? null, fileCount: artifactFiles.length, previewEntry: preview?.entry ?? null, previewBuilt: Boolean(preview?.exists) },
    }, options);

    // 2) Compose the deploy graph: the built artifact (a provided source item) → founder gate → deploy
    //    (an execute node). composeNakedGraph normalizes, binds the IO, and RE-ASSERTS the wall — the
    //    deploy execute node must have a founder gate upstream on every path or composition is rejected.
    const target = typeof input.target === "string" && input.target.trim() ? input.target.trim() : "staged";
    const title = firstNonEmpty(input.title, artifactSpec?.name, `Microproduct: ${goal}`);
    const microproductSpec = {
      ok: true,
      nodes: [
        { id: "microproduct", category: "source", connector: "manual", label: "Built microproduct", config: {} },
        { id: "deploy-gate", category: "gate", connector: "default", label: "Founder approval to deploy", config: {} },
        { id: "deploy", category: "execute", connector: "deploy", label: `Deploy ${title}`, config: { target } },
      ],
      edges: [
        { id: "data-microproduct-gate", source: "microproduct", target: "deploy-gate", edgeType: "data" },
        { id: "data-gate-deploy", source: "deploy-gate", target: "deploy", edgeType: "data" },
      ],
    };
    const composed = await composeNakedGraph({
      title,
      objective: goal,
      kind: "microproduct",
      grounding,
      // The single artifact item the gate releases — the deploy connector reads artifactSpec/files off it
      // and ships it ONLY after the founder approves AND supplies an explicit deploy confirmation. Nothing
      // deploys before that, and composition/runs cannot forge either authorization (see deploy.mjs). The
      // built preview (entry file + file list + local build dir) rides the item so the founder reviews a
      // rendered microproduct at the gate, not raw file text.
      input: { type: "manual", items: [{
        artifactSpec,
        artifactFiles,
        files: artifactFiles,
        microproduct: true,
        ...(preview ? { preview } : {}),
        ...(build?.worktree ? { buildWorktree: build.worktree } : {}),
      }] },
      output: { type: "local" },
    }, { ...options, compose: async () => microproductSpec });

    // bindIO stamped the deploy execute connector to the generic local stager; restore the microproduct
    // deploy connector (the wall-graduating ship leg) and its deploy target. Topology is UNCHANGED, so the
    // gate wall composeNakedGraph just asserted still holds; re-validate after the swap as defense in depth.
    const graph = composed.graph;
    const deploy = graph.nodes.find((node) => node.category === "execute");
    if (deploy) {
      deploy.connector = "deploy";
      deploy.config = { ...deploy.config, target, microproduct: true };
      graph.revision = (graph.revision ?? 1) + 1;
      const revalidated = validateGraph(graph);
      if (!revalidated.ok) throw new Error(`Microproduct deploy graph is invalid: ${revalidated.errors.join(" ")}`);
      saveFlow(graph, options);
    }

    registerComposedChannel({
      id: composed.channel.id,
      graphId: composed.channel.graphId,
      name: composed.channel.name,
      objective: goal,
    }, options);

    working = addEvent({
      ...working,
      graphId: composed.channel.graphId,
      graphRevision: graph.revision,
    }, {
      type: "operator_workflow_composed",
      title: `Composed ${composed.channel.name}`,
      detail: `Deploy is gated behind founder approval — running to the gate, nothing deploys.`,
      data: { channelId: composed.channel.id, graphId: composed.channel.graphId, nodes: graph.nodes.length, kind: "microproduct" },
    }, options);

    working = addEvent(working, {
      type: "operator_running",
      title: "Running the microproduct to the deploy gate",
      detail: "The artifact stages locally and the run stops at the founder gate. Nothing deploys until the founder approves.",
    }, options);

    const run = await executeGraphRun(working, { stream: true }, options);
    return { session: run.session, result: summarizeRun(run.result), pause: run.session.status === "waiting_for_gate" };
  }

  // JOB 3 — ideate, then PAUSE for the founder. This is the generate-side twin of compose_and_run, and
  // it stops at a wall of its own: the operator generates ideas but never decides which one becomes work.
  // It (1) derives the goal's angles and the goal's grading bar (a SEPARATE critic — idea-bar.mjs — whose
  // axes and kill-floors are proposed per goal, only the universal floors fixed), (2) generates wide with
  // distinct.mjs regen on a clustered batch and grades EVERY idea with that separate bar
  // (ideation.composeIdeas refuses to let the generator grade itself), (3) persists every graded idea
  // durably (idea-store), pre-wiring each SURVIVOR to compose_and_run, then (4) pauses with the survivors
  // PLUS the cut list — each cut carrying its plain-line reason so the founder can inspect and revive.
  // Killing, keeping, or reviving is the founder's act — resolved off the agent surface by
  // resolveOperatorIdeas, never by a tool the model (or the MCP door) can call.
  if (tool.name === "ideate") {
    const goal = firstNonEmpty(input.goal, session.goal);
    if (!goal) throw new Error("ideate needs a goal.");
    const project = loadProject(options);
    const ideateRepo = options.cwd || project.sharedContext?.repository?.repo || process.cwd();
    const workspace = latestWorkspace(session, options);
    const grounding = compactProduct(workspace);
    // The founder's taste from past gate decisions (this project + the shared ledger), the same signal
    // the drafting voice reads — so the generators push toward what the founder has approved before.
    const taste = memoryFor(session.graphId ? flowFor(session, options).runs : [], options, session.projectId);

    // The generator and the bar are DIFFERENT injected functions by construction (composeIdeas rejects
    // a shared function). Tests pass keyless fakes; live wires the subscription generator + Claude bar.
    const generate = options.ideaGenerator || createClaudeIdeaGenerator({ cwd: ideateRepo });
    const bar = options.ideaBar || createClaudeIdeaBar({ cwd: ideateRepo });
    const distinct = options.ideaDistinct;
    // The angles for THIS goal: an injected list or function (tests), or — fully live — the Claude
    // angle proposer. When a fake generator is injected without an angle source, one unconstrained
    // pass runs rather than spawning a live subprocess mid-test.
    const angleOpt = options.ideaAngles;
    const angles = Array.isArray(angleOpt) ? angleOpt : null;
    const proposeAngles = typeof angleOpt === "function"
      ? angleOpt
      : (angles || options.ideaGenerator ? null : createClaudeAngleProposer({ cwd: ideateRepo }));

    let working = addEvent(session, {
      type: "operator_ideating",
      title: "Coming up with ideas",
      detail: `Coming up with a few genuinely different ways to get there: ${goal}. Each one gets checked against what this goal needs before it reaches you.`,
      data: { goal },
    }, options);

    const composed = await composeIdeas({
      goal,
      grounding,
      taste,
      generate,
      bar,
      ...(angles ? { angles } : {}),
      ...(proposeAngles ? { proposeAngles } : {}),
      ...(distinct ? { distinct } : {}),
    });

    // Persist EVERY graded idea durably — survivors AND killed. A killed idea stays on the record so it
    // is not silently re-proposed next time; only a survivor carries buildWiring (a dead idea is never
    // wired into a build). The wiring pre-loads compose_and_run with the surviving idea as its goal, so
    // the founder's pick drops straight into the existing build-and-run door.
    // The decision-facing texture (what kind of move it is, the for/against, the critic's one plain
    // sentence, why a cut was cut) is persisted ON the durable GtmIdea too — so a cut idea's reason
    // stays inspectable after the pause resolves — and rides the pause payload for the founder's pick.
    const persisted = composed.ideas.map((idea) => createGtmIdea({
      projectId: session.projectId ?? null,
      goal,
      angle: idea.angle,
      pitch: idea.pitch,
      what: idea.what,
      upside: idea.upside,
      risk: idea.risk,
      take: idea.take,
      killReason: idea.killReason,
      barScore: idea.barScore,
      axes: idea.axes,
      verdict: idea.killed ? "killed" : "survived",
      killed: idea.killed === true,
      buildWiring: idea.killed
        ? null
        : { kind: "compose_and_run", goal: idea.pitch, title: idea.pitch.slice(0, 80) },
    }, options));
    const survivors = persisted.filter((idea) => !idea.killed);
    const cut = persisted.filter((idea) => idea.killed);

    // PAUSE with the survivors AND the cut list — the founder reviews, picks, and may bring a cut idea
    // back; nothing is culled out of sight. The operator does not build; it stops here. pendingIdeas
    // mirrors pendingGate/pendingProposal: durable, founder-resolved.
    const next = addEvent({
      ...working,
      status: "waiting_for_ideas",
      pendingIdeas: {
        goal,
        ideas: survivors.map((idea) => ({
          id: idea.id,
          angle: idea.angle,
          pitch: idea.pitch,
          what: idea.what,
          upside: idea.upside,
          risk: idea.risk,
          take: idea.take,
          barScore: idea.barScore,
          buildWiring: idea.buildWiring,
        })),
        cut: cut.map((idea) => ({
          id: idea.id,
          pitch: idea.pitch,
          what: idea.what,
          reason: idea.killReason || idea.take || "Fell short of what this goal needs.",
        })),
        killedCount: cut.length,
        distinctiveness: composed.distinctiveness ?? null,
        regenerated: composed.regenerated === true,
      },
      error: null,
    }, {
      type: "ideas_proposed",
      title: survivors.length
        ? `Found ${survivors.length} idea${survivors.length === 1 ? "" : "s"} worth your look`
        : "No ideas made the cut this round",
      detail: survivors.length
        ? (cut.length
          ? `Found ${survivors.length} worth your look; ${cut.length} weaker one${cut.length === 1 ? "" : "s"} set aside — you can see them, each with the reason, and bring one back.`
          : `Found ${survivors.length} worth your look — pick which to keep.`)
        : (cut.length
          ? `Everything this round fell short — each idea is set aside with the reason it was cut. Say the word and I'll come at the goal from another side.`
          : `Nothing came back this round. Say the word and I'll come at the goal from another side.`),
      data: {
        goal,
        surviving: survivors.length,
        killed: cut.length,
        ideaIds: survivors.map((idea) => idea.id),
      },
    }, options);
    return {
      session: next,
      result: {
        paused: true,
        survivors: survivors.map((idea) => ({ id: idea.id, angle: idea.angle, pitch: idea.pitch, barScore: idea.barScore })),
        killed: cut.length,
      },
      pause: true,
    };
  }

  if (tool.name === "inspect_run") {
    const flow = flowFor(session, options);
    const record = input.runId
      ? flow.runs.find((run) => run.id === input.runId)
      : flow.runs.at(-1);
    if (!record) throw new Error(input.runId ? `Run not found: ${input.runId}` : "No runs have been recorded yet.");
    const next = addEvent(session, {
      type: "inspection",
      title: `Inspected ${record.id}`,
      detail: record.ok ? "Run completed." : record.result?.error ?? "Run needs attention.",
    }, options);
    return { session: next, result: summarizeRun(record.result), pause: false };
  }

  if (tool.name === "compare_runs") {
    const flow = flowFor(session, options);
    const before = flow.runs.find((run) => run.id === input.beforeRunId);
    const after = flow.runs.find((run) => run.id === input.afterRunId);
    if (!before || !after) throw new Error("Both persisted run ids are required for comparison.");
    const next = addEvent(session, {
      type: "inspection",
      title: "Compared two runs",
      detail: `${before.id} → ${after.id}`,
    }, options);
    return { session: next, result: compareChannelRuns(before, after), pause: false };
  }

  if (tool.name === "request_founder_input") {
    const next = addEvent({
      ...session,
      status: "waiting_for_input",
      pendingQuestion: { question: input.question, reason: input.reason },
      error: null,
    }, {
      type: "founder_input_requested",
      title: "Founder judgment needed",
      detail: input.question,
      data: { reason: input.reason },
    }, options);
    return { session: next, result: { paused: true, question: input.question }, pause: true };
  }

  if (tool.name === "complete") {
    const next = addEvent({
      ...session,
      status: input.outcome === "blocked" ? "blocked" : "completed",
      summary: input.summary,
      completedAt: new Date().toISOString(),
      pendingQuestion: null,
      error: input.outcome === "blocked" ? input.summary : null,
    }, {
      type: "session_completed",
      title: input.outcome === "achieved" ? "Goal achieved" : input.outcome === "blocked" ? "Session blocked" : "Session completed",
      detail: input.summary,
      data: { outcome: input.outcome },
    }, options);
    return { session: next, result: { status: next.status, summary: input.summary }, pause: true };
  }

  throw new Error(`Unknown operator tool: ${tool.name}`);
}
