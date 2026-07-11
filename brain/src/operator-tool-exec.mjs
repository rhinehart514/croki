// The operator's tool dispatcher: executeTool routes every typed tool name, and executeGraphRun is the
// drive-to-gate loop the run tools share. Moved verbatim out of operator-runtime.mjs — logic is
// byte-identical. Depends on the run-core mechanics and the composers; the orchestrator imports
// executeTool back (and re-exports it as executeOperatorTool), so no import cycle is introduced.
import path from "node:path";
import { getEngineState } from "./engine.mjs";
import { liveStepRuntime, createGateTranslator } from "./agent-bridge.mjs";
import { buildMicroproduct } from "./build.mjs";
import { storeRoot } from "./store-fs.mjs";
import { createComposer } from "./composition.mjs";
import { generateProductModelForProject } from "./product-model-generator.mjs";
import { recordFlowRun, saveFlow } from "./flow-store.mjs";
import { buildRunGrounding, deriveSuppression } from "./run-grounding.mjs";
import { createDerivedSourceLoader } from "./cross-reference.mjs";
import { getAgentBench, getAgentProfile, getProjectChannels } from "./project-store.mjs";
import { recordRunDerivations } from "./run-derivation.mjs";
import { buildMarketContext } from "./market-research.mjs";
import { marketObjectStore } from "./gtm-store.mjs";
import { applyGraphOperations, validateGraph } from "./graph-operations.mjs";
import { listConnectors, runGraph } from "./graph.mjs";
import { executeDomainCommand } from "./domain-commands.mjs";
import { bindOperatorSessionContext, saveOperatorSession } from "./operator-store.mjs";
import { loadProject, registerComposedChannel, updateSharedContext } from "./project-store.mjs";
import * as clarityStore from "./clarity-store.mjs";
import { assertSessionGraphProject, graphIdForRef } from "./operator-project-scope.mjs";
import { teammateSoulStore } from "./teammate-soul-store.mjs";
import { createTeammateNarrator } from "./teammate-narrator.mjs";
import { composeNakedGraph } from "./workflow-composer.mjs";
import { composeCandidates, createClaudeCandidateComposer } from "./candidate-composer.mjs";
import { annotateRunEvidence } from "./evidence-lines.mjs";
import { composeIdeas, createClaudeAngleProposer, createClaudeIdeaGenerator } from "./ideation.mjs";
import { createClaudeIdeaBar } from "./idea-bar.mjs";
import { attachBuildWiring, createGtmIdea, getGtmIdea, listGtmIdeas, saveGtmIdea } from "./idea-store.mjs";
import { compareChannelRuns } from "./run-compare.mjs";
import { makeFailureSink } from "./failure-log.mjs";
import { resolveGitShaAsync } from "./friction.mjs";
import { classifyOperatorVerb, isTerrainProjectionRef, normalizeStableRef, normalizeStableRefs } from "./operator-tools.mjs";
import { createGoal, createGoalRelation, getGoal, getGoalRelation, reviseGoal, reviseGoalRelation } from "./goal-store.mjs";
import { createWorkArtifact, createWorkRelationship, getWorkArtifact, getWorkRelationship, reviseWorkArtifact, reviseWorkRelationship } from "./work-artifact-store.mjs";
import { normalizeCanvasProposal } from "./canvas-proposal.mjs";
import {
  addEvent,
  compactProduct,
  designStateFor,
  firstNonEmpty,
  flowFor,
  founderSafeValue,
  latestWorkspace,
  memoryFor,
  operatorProjectOptions,
  summarizeRun,
} from "./operator-run-core.mjs";

function stableRefsFor(session, input = {}) {
  const teammateRefs = Array.isArray(input.teammateRefs) ? input.teammateRefs.map((id) => ({ type: "teammate", id })) : [];
  return normalizeStableRefs([...(session.contextRefs ?? []), ...(input.refs ?? []), ...(input.ref ? [input.ref] : []), ...teammateRefs], { projectId: session.projectId ?? null });
}

function requestedStableRef(session, input = {}) {
  return normalizeStableRef(input.ref ?? session.focusRef ?? null, { projectId: session.projectId ?? null });
}

function retainTerrainContext(session, refs, options) {
  const terrainRefs = normalizeStableRefs(refs, { projectId: session.projectId ?? null }).filter(isTerrainProjectionRef);
  if (!terrainRefs.length) return session;
  return bindOperatorSessionContext(session.id, { contextRefs: terrainRefs }, options);
}

function crewAnswer(result, teammateRef) {
  const first = Array.isArray(result?.items) ? result.items[0] : null;
  return founderSafeValue({ teammateRef, answer: result?.reasoning || first?.answer || first?.summary || first?.recommendation || "No answer was returned.", evidence: first?.evidence ?? [], uncertainty: first?.uncertainty ?? first?.unknowns ?? null, recommendation: first?.recommendation ?? null, wouldChangeMind: first?.wouldChangeMind ?? first?.falsifier ?? null, ok: result?.ok !== false, error: result?.ok === false ? result?.error ?? "The teammate could not answer." : null });
}

function recordText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") return String(value.text ?? value.wording ?? value.value ?? value.summary ?? "").trim();
  return String(value ?? "").trim();
}

function scopedLookup(read, noun, id) {
  try { return read(); }
  catch (error) {
    if (/belongs to project/i.test(error instanceof Error ? error.message : String(error))) {
      throw new Error(`${noun} not found in this project: ${id}`);
    }
    throw error;
  }
}

function optionalWording(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function labeledWording(goal, label) {
  const wording = optionalWording(goal);
  if (!wording) return null;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = wording.match(new RegExp(`(?:^|[.!?]\\s+)${escaped}:\\s*(.+?)(?=(?:[.!?]\\s+)(?:intended effect|uncertainty|measurement intent):|$)`, "i"));
  return optionalWording(match?.[1]);
}

// The terrain is projection context, not a new authority. Copy the selected move's optional refs and
// founder-visible brief onto the existing pipeline/graph metadata, then reuse that same open object as
// run lineage. Missing fields stay honest null/empty values and never become pre-gate requirements.
function compositionWorkContext(session, input = {}) {
  const contextRefs = normalizeStableRefs([
    ...(session.contextRefs ?? []),
    ...(input.contextRefs ?? []),
    ...(session.focusRef ? [session.focusRef] : []),
  ], { projectId: session.projectId ?? null });
  const evidenceRefs = normalizeStableRefs(
    input.evidenceRefs ?? contextRefs.filter((ref) => /evidence|source-line|truth/i.test(ref.type)),
    { projectId: session.projectId ?? null },
  );
  const founderWording = optionalWording(session.goal) ?? optionalWording(input.founderWording) ?? optionalWording(input.goal);
  return {
    questionId: session.questionId || input.questionId || null,
    participantRefs: normalizeStableRefs([...(session.participantRefs ?? []), ...(input.participantRefs ?? [])], { projectId: session.projectId ?? null }),
    productRefs: normalizeStableRefs([...(session.productRefs ?? []), ...(input.productRefs ?? [])], { projectId: session.projectId ?? null }),
    contextRefs,
    evidenceRefs,
    founderWording,
    intendedEffect: optionalWording(session.intendedEffect) ?? optionalWording(input.intendedEffect) ?? labeledWording(founderWording, "intended effect") ?? founderWording,
    uncertainty: optionalWording(session.uncertainty) ?? optionalWording(input.uncertainty) ?? labeledWording(founderWording, "uncertainty"),
    measurementIntent: optionalWording(session.measurementIntent) ?? optionalWording(input.measurementIntent) ?? labeledWording(founderWording, "measurement intent"),
  };
}

function runWorkContext(graph = {}) {
  return {
    questionId: graph.questionId ?? null,
    participantRefs: graph.participantRefs ?? [],
    productRefs: graph.productRefs ?? [],
    contextRefs: graph.contextRefs ?? [],
    evidenceRefs: graph.evidenceRefs ?? [],
    founderWording: graph.founderWording ?? null,
    intendedEffect: graph.intendedEffect ?? null,
    uncertainty: graph.uncertainty ?? null,
    measurementIntent: graph.measurementIntent ?? null,
  };
}

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
// The dead-primitive revival wire (Area 1): before composing another pipeline, gather the entrants the
// project's EXISTING pipelines most recently produced and cross-check them against the durable touch
// ledger, so the composing model knows who's already been worked, who's set aside, and who another motion
// is already in flight on. Pure read + advisory: it reads each channel's last-run output through the same
// derived-source loader a run uses, then runs deriveSuppression (→ dedupeAcrossChannels → the ledger). It
// NEVER filters what runs and NEVER gates — it is one more strong steer folded into the grounding. Any
// failure yields null so composition is never blocked. This is the first production caller of the
// previously-dead dedupeAcrossChannels primitive.
async function crossMotionSuppression(project, projectId, options) {
  try {
    const channels = getProjectChannels(project, options).filter((c) => c.graphId);
    if (!channels.length) return null;
    const load = createDerivedSourceLoader(options);
    const entrants = [];
    for (const channel of channels) {
      const items = await load(channel.graphId);
      for (const item of Array.isArray(items) ? items : []) {
        if (item && typeof item === "object") entrants.push({ ...item, channelId: item.channelId ?? channel.id });
      }
    }
    if (!entrants.length) return null;
    const suppression = deriveSuppression(projectId, entrants, options);
    // Only surface it when it actually says something — an all-new batch adds no steer.
    if (suppression.stats.skipHandledCount === 0 && suppression.stats.skipInFlightCount === 0) return null;
    return suppression;
  } catch {
    return null;
  }
}

async function liveProduceMicroproduct({ goal, grounding, taste, repo, runtime, model, options }) {
  const { produceMicroproduct, createMicroproductProducer } = await import("./microproduct-composer.mjs");
  return produceMicroproduct({ goal, grounding, taste }, {
    ...options,
    produce: createMicroproductProducer({ cwd: repo, runtime, model }),
  });
}

// First-person heartbeats a teammate speaks while it works — a deterministic template keyed on the
// node's category, never a model call (cheap, per the grounding: code answers when code can). These are
// the ONLY strings a crew beat carries; they read solely off the node's own category, label, and the
// item count — never its prompt, config, or any soul internals. The founder sees the teammate's voice
// and quality, never the machinery behind it.
function narrateStart(node = {}) {
  const label = (node.label || "the next step").toString().trim() || "the next step";
  switch (node.category) {
    case "generate": return "Let me draft the first pass.";
    case "enrich": return "Pulling the details together now.";
    case "measure": return "Checking how this landed.";
    default: return `On it — ${label}.`;
  }
}
function narrateDone(node = {}, result = {}, count = 0) {
  const n = Number.isFinite(count) ? count : 0;
  switch (node.category) {
    case "generate": return `Drafted ${n} for your review.`;
    case "enrich": return `Filled in ${n}.`;
    case "measure": return "Measured — here's what it says.";
    default: return `Found ${n} worth a look.`;
  }
}

async function executeGraphRun(session, { targetNodeId, stream = false } = {}, options = {}) {
  assertSessionGraphProject(session, operatorProjectOptions(session, options));
  const flow = flowFor(session, options);
  // The founder's OWN product repo is what every agent step must read — not Drover's repo. The routes
  // launch/resume with no options.cwd, so without this the invoker fell back to process.cwd() (Drover's
  // own source). Resolve it once from the founder's repo path (the same fallback chain the composer,
  // product-modeler, and ideation paths already use) and thread it into every subprocess this run spawns.
  const runCwd = options.cwd || flow.project?.sharedContext?.repository?.repo || process.cwd();
  // The real scan report grounds the drafts on cited product truth (win event, attribution, gaps with
  // their file:line citations) instead of a hardcoded BLIND grounding. Null when no workspace is scanned.
  const runWorkspace = latestWorkspace(session, options);
  // When streaming is on (the autonomous compose_and_run drive), surface each step as it executes —
  // "running node X", "drafted N items", "reached the gate" — onto the durable session events so the
  // UI can animate progress instead of seeing one batch at the end. The events are persisted through
  // saveOperatorSession (mutating the local `session` ref), the same mechanism every other event uses.
  let live = session;
  // Per-node metadata captured on node_start (ref/label/kind/category), read back on node_done so a
  // teammate's closing beat knows who spoke and in what register. Cosmetic surfacing only.
  const nodeMeta = new Map();
  // The live teammate-voice narrator: writes each crew beat in the teammate's own voice, guided ONLY by
  // the wall-safe brief. Gated identically to the gateTranslator auto-create below — live only, OFF for
  // any unit run (scoped to options.root) or injected stepRuntime. So every existing unit test gets
  // narrator=null and keeps today's exact deterministic template strings (zero churn, no subprocess).
  const narrator = "teammateNarrator" in options
    ? options.teammateNarrator
    : ((options.stepRuntime || options.root) ? null : createTeammateNarrator({ cwd: runCwd }));
  // The founder-safe voice brief for one teammate in this project. Births a thin soul if needed so a
  // never-run teammate still narrates off its deterministic fallback. Any error → null (falls back to
  // the template), never a thrown error that breaks the streaming run.
  const briefFor = (ref) => {
    if (!ref) return null;
    try {
      return teammateSoulStore.voiceBriefFor(session.projectId || "default", ref, { definition: null }, options);
    } catch {
      return null;
    }
  };
  const onEvent = stream
    ? async (event) => {
        if (event.type === "node_start") {
          nodeMeta.set(event.nodeId, { ref: event.ref, label: event.label, kind: event.kind, category: event.category });
          // A teammate actually doing the work (an agent-kind node with a ref) speaks a first-person
          // heartbeat as ITSELF — the composer resolves its face/name per message from data.ref. Every
          // other node stays quiet machinery in the collapsed tool trace, exactly as before.
          if (event.kind === "agent" && event.ref) {
            // The real in-character beat, written in this teammate's own voice (guided by the wall-safe
            // brief). Falls back to the deterministic template on any miss — a beat that can't be written
            // in-voice is silently the old string, so no new failure mode reaches the founder.
            const brief = narrator ? briefFor(event.ref) : null;
            const line = (narrator && brief)
              ? await narrator({ brief, phase: "start", node: { nodeId: event.nodeId, label: event.label } })
              : null;
            live = addEvent(live, {
              type: "teammate_said",
              title: line || narrateStart(event),
              data: { ref: event.ref, nodeId: event.nodeId, phase: "start", label: event.label ?? null, category: event.category ?? null },
            }, options);
          } else {
            live = addEvent(live, {
              type: "operator_node_start",
              title: `Running ${event.label || event.nodeId}`,
              detail: event.category ? `${event.kind || "tool"} · ${event.category}` : (event.ref || event.kind || "tool"),
              data: { nodeId: event.nodeId, category: event.category, kind: event.kind, ref: event.ref },
            }, options);
          }
        } else if (event.type === "node_done") {
          const r = event.result ?? {};
          const count = Array.isArray(r.items) ? r.items.length : 0;
          const meta = nodeMeta.get(event.nodeId) ?? {};
          // The machinery done-event — the collapsed-tool-trace record. A teammate node's closing beat
          // REPLACES it on the happy path, but on a FAILURE the raw engine error must still land here
          // (never on the crew bubble), so a teammate never voices an engine stack trace.
          const machineryDone = {
            type: r.pendingReview ? "operator_reached_gate" : "operator_node_done",
            title: r.pendingReview
              ? `Reached the founder gate · ${count} item${count === 1 ? "" : "s"} awaiting release`
              : `${r.category === "gate" ? "Gate" : r.category === "generate" || r.kind === "agent" ? "Drafted" : "Completed"} ${event.nodeId} · ${count} item${count === 1 ? "" : "s"}`,
            detail: r.ok === false ? (r.error ?? "Step failed.") : null,
            data: { nodeId: event.nodeId, ok: r.ok, itemCount: count, pendingReview: r.pendingReview ?? false },
          };
          // An agent that FINISHED its work (not one pausing for review — the gate owns that moment)
          // gets a closing first-person beat. A pendingReview agent keeps the machinery event only.
          if (meta.kind === "agent" && meta.ref && !r.pendingReview) {
            const brief = narrator ? briefFor(meta.ref) : null;
            const line = (narrator && brief)
              ? await narrator({ brief, phase: "done", node: { nodeId: event.nodeId, label: meta.label }, count })
              : null;
            live = addEvent(live, {
              type: "teammate_said",
              title: line || narrateDone(meta, r, count),
              data: { ref: meta.ref, nodeId: event.nodeId, phase: "done", itemCount: count, category: meta.category ?? null },
            }, options);
            if (r.ok === false) live = addEvent(live, machineryDone, options);
          } else {
            live = addEvent(live, machineryDone, options);
          }
        }
      }
    : null;
  // Resolve the repo's git sha ONCE, off the run's node loop, and thread it into the failure sink so
  // reportFriction never shells out to git synchronously inside a node failure. A test that pins
  // options.gitSha (isolated queue) keeps that value and never resolves. Best-effort — a resolve failure
  // yields null (honest absence), never a throw.
  let failureGitSha;
  if ("gitSha" in options) {
    failureGitSha = options.gitSha;
  } else {
    try { failureGitSha = await resolveGitShaAsync(); } catch { failureGitSha = null; }
  }
  const onFailure = makeFailureSink({
    graphId: flow.graph?.id ?? null,
    graphLabel: session.goal ?? null,
    session,
    gitSha: failureGitSha,
    options,
  });
  const result = await runGraph(flow.graph, {
    targetNodeId,
    memory: memoryFor(flow.runs, options, session.projectId),
    designState: designStateFor(session, options),
    // Ground the run on the researched buyer picture (the persisted MarketObjects), not just
    // founder-typed guesses — a projection over the stored objects; null when none are researched.
    market: buildMarketContext(marketObjectStore.list({ ...options, projectId: session.projectId || "default" })),
    // Ground every subagent on the product it serves + what's already been tried, so operator-driven
    // runs get the same product map and run history as the direct/streaming graph-run endpoints. The
    // real scan report (when a workspace is open) carries the cited win event, attribution, and gaps —
    // so the drafts are grounded on proven product truth, not a hardcoded BLIND grounding.
    grounding: buildRunGrounding(flow.project, runWorkspace?.report ?? null),
    runs: flow.runs,
    // The live subscription-backed step runtime by default; a test injects a fake through
    // options.stepRuntime so the open agent/skill/code steps run keyless. cwd is the founder's OWN repo
    // (runCwd) so an agent step reads the founder's product, never Drover's own source.
    stepRuntime: options.stepRuntime || liveStepRuntime({ cwd: runCwd }),
    // The live plain-language gate translator. Auto-created only for a real run: it is OFF when the caller
    // passed an explicit options.gateTranslator, injected a fake stepRuntime (keyless run), or scoped the
    // run to an isolated store root (options.root — every unit test does this; production never does). So a
    // unit run never spawns a translation call, while a real run gets the live translator, which the gate
    // connector still wraps in a timeout + raw-subject fallback.
    gateTranslator: "gateTranslator" in options
      ? options.gateTranslator
      : ((options.stepRuntime || options.root) ? null : createGateTranslator({ cwd: runCwd })),
    loadLastRunItems: createDerivedSourceLoader({ ...options, projectId: session.projectId || "default" }),
    // BYO credentials: a founder-pasted key for this project wins over env; options carries the
    // persistence root so the stored key resolves from the same store the founder saved it in.
    projectId: session.projectId || "default",
    credentialOptions: options,
    onEvent,
    // Self-observation sink: a genuinely failed node — or one whose model output was unusable — is filed
    // into the dogfood queue. The SAME closure is used on the gate-resume run (resolveOperatorGate), so both
    // run legs log identically. Pure observation: it never branches or slows the run (safeLogFailure swallows
    // everything, graph.mjs wraps the call, and the git sha is pre-resolved off the hot path).
    onFailure,
  });
  result.workContext = runWorkContext(flow.graph);
  if (stream) session = live;
  // Ground the drafts the founder is about to review: attach evidence_lines to any item whose claim
  // names a real scanned fact (file:line), drawn straight from the active scan report. Honest by
  // construction — a ref is never fabricated, and an item with nothing grounded gets no field. A run
  // with no product grounding is left exactly as-is. Runs before persistence so the stored run and the
  // pending-gate artifacts both carry the evidence the gate renders.
  const evidenceWorkspace = runWorkspace ?? latestWorkspace(session, options);
  if (evidenceWorkspace?.report) annotateRunEvidence(result, evidenceWorkspace.report);
  const stored = recordFlowRun(flow.graph, result, options);
  // Bank the run's derivations (founder-gate taste signals, promotions) for their side effects.
  recordRunDerivations({ projectId: session.projectId || "default", graph: flow.graph, result }, options);
  let next = {
    ...session,
    lastRunId: result.runId,
    graphRevision: flow.graph.revision ?? 0,
    contextRefs: normalizeStableRefs([...(session.contextRefs ?? []), { type: "graph", id: flow.graph.id }, { type: "run", id: result.runId }], { projectId: session.projectId ?? null }),
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
  options = operatorProjectOptions(session, options);
  const input = tool.input ?? {};
  if (tool.name === "inspect") {
    const classification = classifyOperatorVerb("inspect");
    const ref = requestedStableRef(session, input);
    const refs = normalizeStableRefs([...(input.refs ?? []), ...(ref ? [ref] : [])], { projectId: session.projectId ?? null });
    const projectId = session.projectId ?? options.projectId ?? "default";
    let value;
    if (!ref || ref.type === "product") {
      const project = loadProject(options);
      value = { product: compactProduct(latestWorkspace(session, options)), sharedContext: project.sharedContext, crew: getAgentBench(projectId, {}, options) };
    } else if (ref.type === "crew") value = { crew: getAgentBench(projectId, {}, options) };
    else if (ref.type === "teammate") value = { teammate: getAgentProfile(projectId, ref.id, options) };
    else if (ref.type === "goal") value = { goal: scopedLookup(() => getGoal(ref.id, { ...options, projectId }), "Goal", ref.id) };
    else if (ref.type === "goal-relation") value = { relation: scopedLookup(() => getGoalRelation(ref.id, { ...options, projectId }), "Goal relation", ref.id) };
    else if (ref.type === "work-artifact") value = { artifact: scopedLookup(() => getWorkArtifact(projectId, ref.id, options), "Work artifact", ref.id) };
    else if (ref.type === "work-relationship") value = { relationship: scopedLookup(() => getWorkRelationship(projectId, ref.id, options), "Work relationship", ref.id) };
    else if (ref.type === "question") {
      const question = clarityStore.loadClarity(projectId, options).find((item) => item.id === ref.id) ?? null;
      if (!question) throw new Error(`Question not found in project ${projectId}: ${ref.id}`);
      value = { question };
    } else if (ref.type === "pipeline" || ref.type === "graph") {
      const graphId = graphIdForRef(ref, options);
      if (!graphId) throw new Error(`Pipeline graph not found: ${ref.id}`);
      const flow = flowFor({ ...session, graphId }, options);
      value = { graph: flow.graph, recentRuns: flow.runs.slice(-5) };
    } else if (ref.type === "run") {
      assertSessionGraphProject(session, options);
      const run = flowFor(session, options).runs.find((candidate) => candidate.id === ref.id);
      if (!run) throw new Error(`Run not found in the focused pipeline: ${ref.id}`);
      value = { run: run.result ? summarizeRun(run.result) : run };
    } else if (isTerrainProjectionRef(ref)) {
      value = typeof options.inspectRef === "function"
        ? await options.inspectRef({ projectId, ref })
        : { projectionRef: ref, projectId, durable: false, authority: false };
    } else if (typeof options.inspectRef === "function") value = await options.inspectRef({ projectId, ref });
    else throw new Error(`No read adapter is registered for ${ref.type}:${ref.id}.`);
    return { session, result: { classification, ref, refs, value: founderSafeValue(value) }, pause: false };
  }

  if (tool.name === "focus") {
    const classification = classifyOperatorVerb("focus");
    const ref = normalizeStableRef(input.ref, { projectId: session.projectId ?? null });
    const refs = normalizeStableRefs([...(input.refs ?? []), ref], { projectId: session.projectId ?? null });
    const graphId = graphIdForRef(ref, options);
    const next = bindOperatorSessionContext(session.id, { focusRef: ref, contextRefs: refs, ...(ref.type === "question" ? { questionId: ref.id } : {}), ...(graphId ? { graphId } : {}), ...(ref.type === "run" ? { lastRunId: ref.id } : {}) }, options);
    return { session: next, result: { classification, focusRef: ref, contextRefs: next.contextRefs }, pause: false };
  }

  if (tool.name === "ask") {
    const classification = classifyOperatorVerb("ask");
    const prompt = String(input.prompt ?? "").trim();
    if (!prompt) throw new Error("Ask needs a focused question.");
    const projectId = session.projectId ?? options.projectId ?? "default";
    const refs = stableRefsFor(session, input);
    const working = retainTerrainContext(session, refs, options);
    let teammateRefs = refs.filter((ref) => ref.type === "teammate").map((ref) => ref.id);
    if (!teammateRefs.length) teammateRefs = getAgentBench(projectId, {}, options).slice(0, 3).map((row) => row.ref).filter(Boolean);
    teammateRefs = [...new Set(teammateRefs)].slice(0, 4);
    if (!teammateRefs.length) throw new Error("No product-scoped teammate is available to ask yet.");
    const project = loadProject(options);
    const workspace = latestWorkspace(session, options);
    const context = { grounding: buildRunGrounding(project, workspace?.report ?? null), designState: designStateFor(working, options), __run: { projectId, questionId: working.questionId ?? null, contextRefs: refs } };
    const runtime = options.stepRuntime || liveStepRuntime({ cwd: options.cwd || project.sharedContext?.repository?.repo || process.cwd() });
    const answers = await Promise.all(teammateRefs.map(async (teammateRef) => crewAnswer(
      typeof options.askCrew === "function"
        ? await options.askCrew({ teammateRef, prompt, context, refs })
        : await runtime.agentInvoker({ ref: teammateRef, prompt, items: [], context, config: { maxTurns: 10 } }),
      teammateRef,
    )));
    const next = addEvent(working, { type: "crew_asked", title: teammateRefs.length === 1 ? "Asked one teammate" : `Asked ${teammateRefs.length} teammates`, detail: prompt, data: { teammateRefs, refs, classification } }, options);
    return { session: next, result: { classification, refs, answers }, pause: false };
  }

  if (tool.name === "propose") {
    const classification = classifyOperatorVerb("propose");
    const refs = stableRefsFor(session, input);
    const working = retainTerrainContext(session, refs, options);
    if (Array.isArray(input.operations) && input.operations.length && working.graphId) assertSessionGraphProject(working, options);
    const execution = Array.isArray(input.operations) && input.operations.length
      ? await executeTool(working, { ...tool, name: "propose_graph_changes", input: { rationale: input.rationale || input.prompt || "Proposed graph changes", operations: input.operations } }, options)
      : await executeTool(working, { ...tool, name: "propose_candidates", input: { goal: firstNonEmpty(input.prompt, working.goal) } }, options);
    return { ...execution, result: { classification, refs, ...execution.result } };
  }

  if (tool.name === "record") {
    const classification = classifyOperatorVerb("record");
    const kind = String(input.kind ?? "").trim().toLowerCase().replaceAll("-", "_");
    const refs = stableRefsFor(session, input);
    const working = retainTerrainContext(session, refs, options);
    if (kind === "session_note") {
      const text = recordText(input.value);
      if (!text) throw new Error("A session note needs text.");
      const next = addEvent(working, { type: "session_note", title: "Recorded a note", detail: text, data: { refs, classification } }, options);
      return { session: next, result: { classification, recorded: { type: kind, text, refs } }, pause: false };
    }
    if (kind === "model_artifact" || kind === "work_artifact" || kind === "canvas_proposal") {
      if (!input.value || typeof input.value !== "object" || Array.isArray(input.value)) throw new Error("A work artifact needs an object value.");
      const projectId = session.projectId ?? options.projectId ?? "default";
      const actor = { type: "model-worker", runtime: session.runtime ?? "auto", model: session.model ?? null, sessionId: session.id };
      const idempotencyKey = input.idempotencyKey || `${session.id}:${tool.id ?? `event-${session.events?.length ?? 0}`}:${kind}`;
      const value = kind === "canvas_proposal" ? (() => {
        const proposal = normalizeCanvasProposal(input.value, projectId);
        return { id: input.value.id, kind: "canvas-change-proposal", title: proposal.title, summary: proposal.rationale, status: "proposed", format: "json", contentType: "application/vnd.drover.canvas-change-proposal+json", content: proposal };
      })() : input.value;
      const artifactId = value.artifactId ?? value.id;
      const revisingArtifact = Number.isInteger(input.value.expectedArtifactRevision) && artifactId;
      const artifactInput = {
        ...value,
        ...(!revisingArtifact && !value.kind ? { kind: kind === "model_artifact" ? "model-artifact" : "work-artifact" } : {}),
        refs: normalizeStableRefs([...(value.refs ?? []), ...refs], { projectId }),
        createdBy: actor,
        revisionAuthor: actor,
        modelReceipts: [...(Array.isArray(input.value.modelReceipts) ? input.value.modelReceipts : []), {
          runtime: session.runtime ?? "auto", model: session.model ?? null, sessionId: session.id, toolCallId: tool.id ?? null,
        }],
        idempotencyKey,
      };
      const artifactPatch = { ...artifactInput };
      delete artifactPatch.id;
      delete artifactPatch.artifactId;
      delete artifactPatch.lineageId;
      const artifact = revisingArtifact
        ? reviseWorkArtifact(projectId, artifactId, artifactPatch, options)
        : createWorkArtifact(projectId, artifactInput, options);
      const artifactRef = { type: "work-artifact", id: artifact.artifactId };
      const next = addEvent(working, { type: "model_artifact_recorded", title: `Recorded ${artifact.title || artifact.kind}`, detail: artifact.summary || recordText(input.value) || null, data: { artifactRef, refs, classification } }, options);
      return { session: next, result: { classification, recorded: { type: "work_artifact", artifact, ref: artifactRef, refs } }, pause: false };
    }
    if (kind === "goal") {
      if (!input.value || typeof input.value !== "object" || Array.isArray(input.value)) throw new Error("A goal needs an object value.");
      const projectId = session.projectId ?? options.projectId ?? "default";
      const actor = `model:${session.runtime ?? "auto"}:${session.model ?? "default"}`;
      const idempotencyKey = input.idempotencyKey || `${session.id}:${tool.id ?? `event-${session.events?.length ?? 0}`}:goal`;
      const goalId = input.value.id;
      const goalPatch = { ...input.value };
      delete goalPatch.id;
      delete goalPatch.createdBy;
      const goal = Number.isInteger(input.value.expectedRevision) && goalId
        ? reviseGoal(goalId, { ...goalPatch, projectId, revisionAuthor: actor, idempotencyKey }, options)
        : createGoal({ ...input.value, projectId, createdBy: actor, revisionAuthor: actor, idempotencyKey }, options);
      const goalRef = { type: "goal", id: goal.id };
      const next = addEvent(working, { type: "goal_recorded", title: "Put a goal on the canvas", detail: goal.statement, data: { goalRef, classification } }, options);
      return { session: next, result: { classification, recorded: { type: kind, goal, ref: goalRef } }, pause: false };
    }
    if (kind === "goal_relation") {
      if (!input.value || typeof input.value !== "object" || Array.isArray(input.value)) throw new Error("A goal relationship needs an object value.");
      const projectId = session.projectId ?? options.projectId ?? "default";
      const actor = `model:${session.runtime ?? "auto"}:${session.model ?? "default"}`;
      const idempotencyKey = input.idempotencyKey || `${session.id}:${tool.id ?? `event-${session.events?.length ?? 0}`}:goal-relation`;
      const relationId = input.value.id;
      const relationPatch = { ...input.value };
      delete relationPatch.id;
      delete relationPatch.createdBy;
      const relation = Number.isInteger(input.value.expectedRevision) && relationId
        ? reviseGoalRelation(relationId, { ...relationPatch, projectId, revisionAuthor: actor, idempotencyKey }, options)
        : createGoalRelation({ ...input.value, projectId, createdBy: actor, revisionAuthor: actor, idempotencyKey }, options);
      const relationRef = { type: "goal-relation", id: relation.id };
      const next = addEvent(working, { type: "goal_relation_recorded", title: "Related two goals", detail: relation.label || relation.kind, data: { relationRef, classification } }, options);
      return { session: next, result: { classification, recorded: { type: kind, relation, ref: relationRef } }, pause: false };
    }
    if (kind === "work_relationship") {
      if (!input.value || typeof input.value !== "object" || Array.isArray(input.value)) throw new Error("A work relationship needs an object value.");
      const projectId = session.projectId ?? options.projectId ?? "default";
      const actor = { type: "model-worker", runtime: session.runtime ?? "auto", model: session.model ?? null, sessionId: session.id };
      const idempotencyKey = input.idempotencyKey || `${session.id}:${tool.id ?? `event-${session.events?.length ?? 0}`}:work-relationship`;
      const relationshipId = input.value.relationshipId ?? input.value.id;
      const relationshipPatch = { ...input.value };
      delete relationshipPatch.id;
      delete relationshipPatch.relationshipId;
      const relationship = Number.isInteger(input.value.expectedRelationshipRevision) && relationshipId
        ? reviseWorkRelationship(projectId, relationshipId, { ...relationshipPatch, createdBy: actor, revisionAuthor: actor, idempotencyKey }, options)
        : createWorkRelationship(projectId, { ...input.value, createdBy: actor, revisionAuthor: actor, idempotencyKey }, options);
      const relationshipRef = { type: "work-relationship", id: relationship.relationshipId };
      const next = addEvent(working, { type: "work_relationship_recorded", title: "Related canvas work", detail: relationship.label || relationship.kind, data: { relationshipRef, classification } }, options);
      return { session: next, result: { classification, recorded: { type: kind, relationship, ref: relationshipRef } }, pause: false };
    }
    if (kind === "question_proposal") {
      const text = recordText(input.value);
      if (!text) throw new Error("A question proposal needs text.");
      const proposal = { text, refs, participantRefs: working.participantRefs ?? [], productRefs: working.productRefs ?? [] };
      const next = addEvent(working, { type: "question_proposed", title: "Proposed a question", detail: text, data: { ...proposal, classification } }, options);
      return { session: next, result: { classification, recorded: { type: kind, ...proposal, transient: true } }, pause: false };
    }
    throw new Error(`Record kind is not model-writable: ${kind || "(empty)"}. Use founder/browser routes for pins and founder decisions.`);
  }

  if (tool.name === "run") {
    const classification = classifyOperatorVerb("run");
    const ref = requestedStableRef(session, input);
    const refs = stableRefsFor(session, input);
    let working = retainTerrainContext(session, refs, options);
    if (ref) {
      const graphId = graphIdForRef(ref, options);
      working = bindOperatorSessionContext(session.id, { focusRef: ref, contextRefs: refs, ...(graphId ? { graphId } : {}), ...(ref.type === "question" ? { questionId: ref.id } : {}) }, options);
    }
    if (working.graphId) assertSessionGraphProject(working, options);
    const execution = await executeTool(working, { ...tool, name: "compose_and_run", input: { goal: input.goal, title: input.title, compose_new: input.composeNew === true, agents: input.agents } }, options);
    return { ...execution, result: { classification, ref, refs, ...execution.result } };
  }

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
    const workspace = latestWorkspace(session, options);
    const repo = options.cwd || workspace?.repo || project.sharedContext?.repository?.repo || process.cwd();
    const grounding = buildRunGrounding(project, workspace?.report ?? null);
    const groundingRef = project.sharedContext?.repository?.workspaceId ?? workspace?.report?.scannedAt ?? null;
    const draft = options.generate ? null : await generateProductModelForProject({
      project,
      report: workspace?.report ?? null,
      repo,
      model: input.model ?? session.model,
      runtime: input.runtime ?? session.runtime,
      market: input.market,
    });
    if (draft && !draft.ok) throw new Error(draft.meta?.error || "The selected runtime could not derive the product model.");
    const productModel = await executeDomainCommand("DeriveProductModel", {
      ...input,
      projectId: project.id,
      grounding,
      groundingRef,
      repo,
    }, { ...options, projectId: project.id, generate: options.generate || (async () => draft) });
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
    if (session.graphId && !input.compose_new) assertSessionGraphProject(session, options);
    const goal = firstNonEmpty(input.goal, session.goal);
    let working = session;
    const workContext = compositionWorkContext(session, input);

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
      const composeProject = loadProject(options);
      const composeRepo = options.cwd || composeProject.sharedContext?.repository?.repo || process.cwd();
      const composeFn = seededShape
        ? async () => ({ ok: true, nodes: seededShape.nodes, edges: Array.isArray(seededShape.edges) ? seededShape.edges : [] })
        : (options.compose || createComposer({ cwd: composeRepo, model: working.model, runtime: working.runtime }));
      // The composer sees the SAME real product grounding a run does — the cited scan report when a
      // workspace is open — so it composes against proven product truth instead of an empty {} .
      const composeWorkspace = latestWorkspace(working, options);
      // Fold cross-motion suppression (Area 1's revived dedup primitive) into the compose grounding as a
      // strong advisory steer — who's already been worked, set aside, or is in flight in another pipeline.
      const suppression = await crossMotionSuppression(composeProject, session.projectId || "default", options);
      const composeGrounding = buildRunGrounding(composeProject, composeWorkspace?.report ?? null);
      if (suppression) composeGrounding.suppression = suppression;
      const composed = await composeNakedGraph({
        title: firstNonEmpty(input.title, seededShape?.label, goal),
        objective: goal,
        agents: Array.isArray(input.agents) ? input.agents : [],
        grounding: composeGrounding,
        ...workContext,
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
        ...workContext,
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
        contextRefs: normalizeStableRefs([...(working.contextRefs ?? []), { type: "pipeline", id: composed.channel.id }, { type: "graph", id: composed.channel.graphId }], { projectId: working.projectId ?? null }),
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
      title: "Laying out your choices",
      detail: "Putting distinct ways to reach customers side by side so you can choose before anything is built or sent.",
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
    const taste = memoryFor(session.graphId ? flowFor(session, options).runs : [], options, session.projectId);

    let working = addEvent(session, {
      type: "operator_composing",
      title: "Building a microproduct",
      detail: `Cutting a deployable artifact from the product for: ${goal}`,
      data: { goal },
    }, options);

    // 1) The producer cuts the artifact (spec + files) from the scanned product. It produces files and
    //    never deploys. Injected (fake) in tests; live = the subscription producer, dynamically loaded.
    const produce = options.produceMicroproduct
      || ((args) => liveProduceMicroproduct({ ...args, repo, runtime: session.runtime, model: session.model, options }));
    const built = await produce({ goal, grounding, taste });
    const artifactSpec = built?.artifactSpec ?? null;
    const artifactFiles = Array.isArray(built?.artifactFiles)
      ? built.artifactFiles
      : (Array.isArray(built?.files) ? built.files : null);
    if (!artifactFiles || artifactFiles.length === 0) {
      throw new Error("The microproduct producer returned no files to stage — refusing to compose an empty deploy.");
    }

    // MOVE 2 — is this a standalone MICROPRODUCT (its own artifact) or an IN-REPO product CHANGE (files
    // that land at real paths inside the founder's product)? The producer signals in-repo intent on the
    // spec (`inRepo:true` or `target:"in-repo"`), or the founder does via `input.target`. An in-repo change
    // takes the SAME leg as a microproduct — the same worktree cut off the real repo, the same local build
    // against the product's own tests, the same stop-before-commit, the same double-authorized gate — the
    // only difference is WHERE the files land and that the ship leg is the BYO push/PR of that real worktree
    // (deploy.mjs's zero-credential alpha path). A standalone microproduct still builds in an isolated dir
    // with no git remote, so its ship path is the hosted Vercel runner, never a BYO push into nothing.
    const inRepoChange = artifactSpec?.inRepo === true
      || artifactSpec?.target === "in-repo"
      || String(input.target || "").trim() === "in-repo";

    // 1b) BUILD the artifact locally BEFORE the gate, so the founder approves a built, previewable
    //     microproduct — not raw file text. buildMicroproduct writes the producer files into an isolated
    //     build dir, runs any local install/build (assertLocalBuildCommand rejects a deploy-like command,
    //     so the build leg can never smuggle a ship), and captures the static preview (entry file + file
    //     list). It NEVER commits, pushes, or deploys. Injectable for tests; the live default is the real
    //     local build leg. A build failure is surfaced but never blocks reaching the gate — the founder
    //     still reviews the raw files, just without a rendered preview.
    //     For an IN-REPO change, we pass `repo` so buildMicroproduct cuts a git worktree OFF the real repo
    //     (a branch, files written against real paths) — the exact worktree the BYO push/PR ships. A
    //     standalone microproduct passes no repo (isolated dir), keeping its ship path the hosted runner.
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
          ...(inRepoChange ? { repo } : {}),
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

    // MOVE 3 — a proposed/scaffolded/shipped product CHANGE is ONE object on the shared map, identified by
    // Area 1's `change:<repo>#<path>` key. We surface that identity on the staged item so the run-derivation
    // touch deriver (recordObjectTouchesFromRun) files it as a `change` object at the SAME seam every other
    // object uses — no separate change registry. inferKind reads `repo` + `path` off the item and keys it
    // `change:<repo>#<path>`; the run-to-gate pass records a "proposed" touch, the gate-resume deploy pass a
    // "shipped" touch, and a later win joins to the same key through Area 7's motionKind. The change's
    // primary path is the producer-named entry, else the first file — one logical change, one object key.
    const primaryChangePath = inRepoChange
      ? String(artifactSpec?.entry || artifactSpec?.path || artifactFiles[0]?.path || "").trim()
      : "";

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
        // MOVE 3 change-object identity: an in-repo change carries `kind:"change"` + `repo` + `path` so the
        // touch deriver keys it `change:<repo>#<path>` and it lands on the shared map like any other object.
        // A standalone microproduct carries none of these — it is not a change to the founder's product.
        ...(inRepoChange && primaryChangePath ? { kind: "change", repo, path: primaryChangePath } : {}),
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
      // MOVE 1/2 — set the ship leg's target. For an IN-REPO change, config.repo is the build worktree (the
      // branch cut off the real repo), so deploy.mjs's BYO runner pushes THAT worktree — the zero-credential
      // alpha ship path (PR + BYO push). branch/remote ride along so the push targets the change branch, not
      // the founder's default. This is config only (composition's reach); it is NOT an authorization — the
      // deploy connector still refuses without the founder's explicit deployConfirmation on node.runtime, so
      // setting config.repo can never itself ship. A standalone microproduct leaves config.repo unset (its
      // isolated build dir has no git remote); its ship path is the hosted Vercel runner via deployRunners.
      const shipConfig = inRepoChange && build?.worktree
        ? { repo: build.worktree, runner: "byo", ...(build.branch ? { branch: build.branch } : {}) }
        : {};
      deploy.config = { ...deploy.config, target, microproduct: true, ...shipConfig };
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
