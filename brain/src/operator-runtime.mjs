import path from "node:path";
import { getEngineState } from "./engine.mjs";
import { liveStepRuntime } from "./agent-bridge.mjs";
import { buildMicroproduct } from "./build.mjs";
import { storeRoot } from "./store-fs.mjs";
import { createClaudeComposer } from "./composition.mjs";
import { createClaudeProductModeler } from "./product-model-generator.mjs";
import { loadFlow, recordFlowRun, saveFlow } from "./flow-store.mjs";
import { buildRunGrounding } from "./run-grounding.mjs";
import { createDerivedSourceLoader } from "./cross-reference.mjs";
import { recordRunDerivations } from "./run-derivation.mjs";
import { buildMarketContext } from "./market-research.mjs";
import { marketObjectStore } from "./gtm-store.mjs";
import { applyGraphOperations, validateGraph } from "./graph-operations.mjs";
import { hasApproveIntent, listConnectors, runGraph } from "./graph.mjs";
import { defaultSendRunners } from "./connectors/execute/gmail-transport.mjs";
import { executeDomainCommand } from "./domain-commands.mjs";
import { buildDraftMemory, extractDecisions } from "./memory.mjs";
import { mergeSharedDecisions } from "./shared-judgments.mjs";
import { getDesignState } from "./design-state-store.mjs";
import {
  appendOperatorEvent,
  armNextWake,
  getOperatorSession,
  listOperatorSessions,
  saveOperatorSession,
} from "./operator-store.mjs";
import {
  applySharedContextToGraph,
  loadProject,
  projectTeamId,
  registerComposedChannel,
  updateSharedContext,
} from "./project-store.mjs";
import { canApprove, getMember, resolveCurrentUser } from "./team-store.mjs";
import { composeNakedGraph } from "./workflow-composer.mjs";
import { composeCandidates, createClaudeCandidateComposer } from "./candidate-composer.mjs";
import { annotateRunEvidence } from "./evidence-lines.mjs";
import { composeIdeas, createClaudeAngleProposer, createClaudeIdeaGenerator } from "./ideation.mjs";
import { createClaudeIdeaBar } from "./idea-bar.mjs";
import { attachBuildWiring, createGtmIdea, getGtmIdea, listGtmIdeas, saveGtmIdea } from "./idea-store.mjs";
import { ideaTasteForProject, recordIdeaDecisions } from "./feedback-ledger.mjs";
import { compareChannelRuns } from "./run-compare.mjs";
import { getWorkspace, listWorkspaces } from "./workspace.mjs";
import { authModeLabel, selectRuntime } from "./runtimes/index.mjs";
import { filterSafeTools } from "./tool-safety.mjs";

const activeSessions = new Map();

const GRAPH_OPERATIONS_INPUT_SCHEMA = {
  type: "object",
  properties: {
    rationale: { type: "string" },
    operations: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "set_graph_name",
              "add_node",
              "remove_node",
              "update_node",
              "connect_nodes",
              "disconnect_nodes",
            ],
          },
          name: { type: "string" },
          nodeId: { type: "string" },
          edgeId: { type: "string" },
          node: {
            type: "object",
            description: "A workflow step. A 'tool' step (the default) is a registered connector and needs category + connector. An 'agent', 'skill', or 'code' step is composed freely and needs a ref (the subagent/skill/transform name) instead.",
            properties: {
              id: { type: "string" },
              kind: {
                type: "string",
                enum: ["tool", "agent", "skill", "code"],
                description: "tool = connector (default); agent = invoke a subagent; skill = apply a skill's judgment; code = a bounded transform.",
              },
              ref: { type: "string", description: "For agent/skill/code steps: the subagent, skill, or transform to invoke." },
              category: {
                type: "string",
                enum: ["resource", "source", "context", "enrich", "filter", "generate", "gate", "execute", "measure"],
              },
              connector: { type: "string" },
              label: { type: "string" },
              position: {
                type: "object",
                properties: { x: { type: "number" }, y: { type: "number" } },
                required: ["x", "y"],
              },
              config: { type: "object" },
              agentPrompt: { type: "string" },
              sourceOfTruth: { type: "array", items: { type: "string" } },
            },
            required: ["id", "label", "position", "config"],
          },
          edge: {
            type: "object",
            properties: {
              id: { type: "string" },
              source: { type: "string" },
              target: { type: "string" },
              edgeType: { type: "string", enum: ["data", "context", "feedback"] },
              label: { type: "string" },
            },
            required: ["id", "source", "target", "edgeType"],
          },
          patch: { type: "object" },
        },
        required: ["type"],
      },
    },
  },
  required: ["rationale", "operations"],
};

const TOOLS = [
  {
    name: "inspect_shared_context",
    description: "Inspect the shared repository evidence, product, positioning, ICP, founder taste, contacts, outcomes, experiments, artifacts, and product feedback used by every workflow.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_shared_context",
    description: "Update shared GTM intelligence across every workflow. Preserve evidence status and do not present inferred positioning or ICP as proven.",
    input_schema: {
      type: "object",
      properties: {
        rationale: { type: "string" },
        patch: { type: "object" },
      },
      required: ["rationale", "patch"],
    },
  },
  {
    name: "inspect_product",
    description: "Inspect the active repository-grounded product report, win event, gaps, and file:line evidence.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "derive_product_model",
    description: "Generate a first-draft Living Product Picture for the active project: the founder-editable interpretation of the product (core objects, relationships, user goals, key states) derived from the scanned grounding. Interpretation, not cited truth. Produces a draft only; never sends or publishes.",
    input_schema: {
      type: "object",
      properties: {
        grounding: { type: "object", description: "Optional grounding snapshot. Defaults to the project scan." },
        market: { type: "object", description: "Optional buyer/market context." },
      },
      required: [],
    },
  },
  {
    name: "revise_product_model",
    description: "Apply a founder edit to the Living Product Picture's things, relationships, user goals, or states. Each revision bumps the version on the same lineage so edits accumulate. Signals are not edited here; use record_product_signal.",
    input_schema: {
      type: "object",
      properties: {
        modelId: { type: "string", description: "Optional. Defaults to the project's current model." },
        things: { type: "array", items: { type: "object" } },
        relationships: { type: "array", items: { type: "object" } },
        userGoals: { type: "array", items: { type: "object" } },
        states: { type: "array", items: { type: "object" } },
        generatedBy: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "record_product_signal",
    description: "Pin a real-world feedback signal onto a specific element of the Living Product Picture (thing, relationship, goal, state, or the whole model) so the interpretation stays current. The signal body stays in the feedback ledger; only the pin is recorded here.",
    input_schema: {
      type: "object",
      properties: {
        modelId: { type: "string", description: "Optional. Defaults to the project's current model." },
        signalId: { type: "string", description: "The FeedbackSignal id to pin." },
        target: { type: "object", description: "{ kind: 'thing'|'relationship'|'goal'|'state'|'model', id }." },
        type: { type: "string" },
        summary: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "inspect_graph",
    description: "Read the current executable GTM graph, including nodes, edges, revision, and recent run count.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "inspect_problems",
    description: "Read current subsystem health, ranked investigations, connector readiness, and recommended repairs.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "propose_graph_changes",
    description: "Stage validated, reversible typed graph operations for founder review on the canvas instead of applying them directly. The founder sees the preview and accepts or discards it; the session pauses until that decision.",
    input_schema: GRAPH_OPERATIONS_INPUT_SCHEMA,
  },
  {
    name: "validate_graph",
    description: "Validate node references, required fields, edge types, unique ids, and data-cycle safety.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "run_node",
    description: "Run one node and its dependencies, persist the result, and inspect the actual output or failure.",
    input_schema: {
      type: "object",
      properties: { nodeId: { type: "string" } },
      required: ["nodeId"],
    },
  },
  {
    name: "run_loop",
    description: "Run the full GTM graph. The operator automatically pauses if a founder gate is reached.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "compose_and_run",
    description: "Autonomously drive a goal end-to-end in one move: compose the channel's workflow if this session has none yet (research/enrich/draft agents behind a founder gate), then run it through the step runtime until it reaches the shared founder gate. A product holds MANY pipelines — to build an ADDITIONAL pipeline for the same product (a new channel alongside the ones already built), call this with compose_new:true. Use this when the founder hands a goal and wants the whole system built and run up to the gate without micromanaging each step. It never sends — it stops at the gate for a human release.",
    input_schema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The goal to build and run toward. Defaults to the session goal." },
        title: { type: "string", description: "Optional channel name." },
        compose_new: { type: "boolean", description: "Compose an ADDITIONAL pipeline for this product even though this conversation already built one. Set true when the founder asks for another channel; the new pipeline joins the others on the product's overview. Omit (or false) to drive the pipeline this session already composed." },
        idea_id: { type: "string", description: "When building a founder-picked idea, the id of that idea (from the ideate pause). The built channel is wired back to it so the run's gate outcome closes the loop onto the idea. Omit for a plain goal that did not come from ideation." },
        agents: {
          type: "array",
          description: "Optional inline agent specs (ref/role/objective/prompt). Omit to let the composer design the agents.",
          items: { type: "object" },
        },
      },
      required: [],
    },
  },
  {
    name: "propose_candidates",
    description: "When the founder's goal genuinely FORKS into several distinct go-to-market shapes — for example an outbound pipeline that contacts owners directly, a content/community play that earns inbound, or a referral loop through existing users — sketch 2–3 candidate pipelines and PAUSE for the founder to pick, instead of assuming one. It NEVER runs, sends, or builds: each candidate is a shape only. If the goal points at ONE clear shape, do not call this — go straight to compose_and_run. When the founder picks a candidate, that pick builds the chosen shape through compose_and_run and stops at the gate. There is no channel catalog; judge the fork freely from the real product and the goal.",
    input_schema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The goal to sketch distinct pipeline shapes for. Defaults to the session goal." },
      },
      required: [],
    },
  },
  {
    name: "compose_microproduct",
    description: "Build a MICROPRODUCT for a goal — a working artifact cut from the real product (a landing page, a scoped demo, a calculator, a one-off tool) — build it locally into a previewable form, and STAGE it behind the founder gate. In one move it asks the producer to cut the artifact (spec + files) from the scanned product, builds it locally (never deploying), composes a graph whose deploy step is an execute node sitting behind a founder gate, and runs it to that gate. It NEVER deploys, publishes, or pushes: the artifact builds and stages locally (deployed:false) and the run stops at the gate. Deploying past the gate is a SEPARATE, founder-only act that needs an explicit founder deploy confirmation at the gate (a normal approval does not ship it); you cannot trigger it — there is no deploy/approve tool on your surface. NOTE: the live ship runner (a configured git remote / the hosted Vercel MCP) is not yet wired end-to-end, so today this builds and stages to the gate; it does not perform a real live deploy. Use when the goal is best served by building a small real artifact rather than drafting a message.",
    input_schema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The goal the microproduct serves. Defaults to the session goal." },
        title: { type: "string", description: "Optional name for the microproduct/channel." },
        target: { type: "string", description: "Optional deploy-target label for where the founder would later take it live. Advisory only — nothing deploys without a founder gate release." },
      },
      required: [],
    },
  },
  {
    name: "ideate",
    description: "Generate go-to-market ideas for a goal and stop for the founder to pick. The grading bar is DERIVED from the founder's stated goal (an offer idea is judged on whether the offer moves buyers, a content idea on reach); only floors that hold for any GTM idea stay fixed. The angles are likewise chosen fresh per goal. Several generators run wide, regenerating if the batch is too clustered, then a SEPARATE critic grades each idea against the derived bar — you never grade your own ideas. EVERY graded idea is saved: survivors pause for the founder's pick, and cut ideas stay inspectable with the plain reason each was cut, so the founder can revive one. It never builds: choosing which idea becomes work is the founder's act, not yours. Each survivor is pre-wired so the founder's pick drops straight into compose_and_run.",
    input_schema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The goal to ideate against. Defaults to the session goal." },
      },
      required: [],
    },
  },
  {
    name: "inspect_run",
    description: "Inspect a persisted run. Omit runId to inspect the latest run.",
    input_schema: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: [],
    },
  },
  {
    name: "compare_runs",
    description: "Compare two persisted runs by node status, item counts, errors, and gate state.",
    input_schema: {
      type: "object",
      properties: {
        beforeRunId: { type: "string" },
        afterRunId: { type: "string" },
      },
      required: ["beforeRunId", "afterRunId"],
    },
  },
  {
    name: "request_founder_input",
    description: "Pause when a consequential choice or missing fact requires founder judgment.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        reason: { type: "string" },
      },
      required: ["question", "reason"],
    },
  },
  {
    name: "complete",
    description: "Finish the operator session after achieving the goal or reaching the strongest honest result available.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        outcome: { type: "string", enum: ["achieved", "partially_achieved", "blocked"] },
      },
      required: ["summary", "outcome"],
    },
  },
];

// The naked harness. The model the founder drives sees ONLY these tools: read the product (truth),
// one build-and-run door (compose_and_run), the inspect/repair loop for a failed run, the founder-input
// channel, and complete — plus the light shared-context (taste/memory) read+write. The remaining
// non-naked tools (channel/workflow CRUD, product-model derivation) are removed from what the model
// can reach, so it builds and runs instead of navigating an ontology. `executeOperatorTool` still routes every tool name, so direct API/MCP callers
// and tests are unaffected — this only narrows what the autonomous model is offered. The wall (founder
// gate) and taste (shared context) are the only constraints that remain on the model's hands.
const NAKED_TOOL_NAMES = new Set([
  "inspect_product",          // truth — read what the product actually is
  "inspect_shared_context",   // taste/memory — ICP, positioning, what's been tried
  "update_shared_context",    // record inferred taste/positioning rather than duplicating into graphs
  "compose_and_run",          // THE move — design the work, build behind a gate, run to the gate
  "propose_candidates",       // an ambiguous goal forks — sketch 2-3 shapes and pause for the founder's pick
  "compose_microproduct",     // the build-and-ship door — cut a deployable artifact, STAGE it behind the gate
  "ideate",                   // generate ideas, grade with a separate critic, pause for the founder to pick
  "inspect_graph",            // inspect/repair a failed run
  "inspect_problems",
  "inspect_run",
  "propose_graph_changes",
  "validate_graph",
  "run_node",
  "run_loop",
  "request_founder_input",    // ask the founder only for a real, unsafe-to-infer decision
  "complete",
]);
const NAKED_TOOLS = TOOLS.filter((t) => NAKED_TOOL_NAMES.has(t.name));

function compactProduct(workspace) {
  if (!workspace) {
    return {
      grounded: false,
      note: "No repository workspace is open. The operator can still inspect and repair the graph, but product claims are ungrounded.",
    };
  }
  const report = workspace.report;
  return {
    grounded: true,
    workspaceId: workspace.id,
    repo: workspace.repo,
    outcome: workspace.outcome,
    headline: report.headline,
    stack: report.stack,
    winEvent: report.winEvent,
    gaps: report.gaps,
    funnel: report.funnel,
  };
}

function latestWorkspace(session, options = {}) {
  const summaries = listWorkspaces(options);
  const id = session.workspaceId || summaries[0]?.id;
  if (!id) return null;
  try {
    return getWorkspace(id, options);
  } catch {
    return null;
  }
}

function flowFor(session, options = {}) {
  const graphId = session.graphId;
  if (!graphId) throw new Error("No active channel. Create or switch to a channel first.");
  const flow = loadFlow(graphId, null, options);
  if (!flow.graph) throw new Error(`Graph not found: ${graphId}`);
  const project = loadProject(options);
  // The pipeline's own offer (when this graph belongs to a channel that carries one) rides into the
  // run context so a drafting step honors the pipeline's deal without the founder restating it.
  const channel = (project.channels ?? []).find((c) => c.graphId === graphId || c.id === graphId) ?? null;
  return {
    ...flow,
    project,
    graph: applySharedContextToGraph(flow.graph, project.sharedContext, { channelOffer: channel?.offer ?? null }),
  };
}

function memoryFor(runs, options, projectId) {
  // Merge this project's gate decisions with the shared taste ledger (the global rig + other
  // projects), so the operator's draft voice compounds across both rigs (HARNESS.md invariant 4).
  // Fold in the founder's idea kills/keeps banked on the feedback rail too, so the killed angles teach
  // the next ideation round which angles bite — the idea half of loop memory, not just draft voice.
  return buildDraftMemory(mergeSharedDecisions(extractDecisions(runs), options), {
    ideaTaste: ideaTasteForProject(projectId || "default", options),
  });
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
async function liveProduceMicroproduct({ goal, grounding, repo, options }) {
  const { produceMicroproduct, createClaudeMicroproductProducer } = await import("./microproduct-composer.mjs");
  const { createClaudeMicroproductInvoker } = await import("./agent-bridge.mjs");
  return produceMicroproduct({ goal, grounding }, {
    ...options,
    produce: createClaudeMicroproductProducer({ invoke: createClaudeMicroproductInvoker({ cwd: repo }) }),
  });
}

function designStateFor(session, options) {
  // The founder's front-end house style for this project (falls back to the seeded global default),
  // injected so any UI an operator step produces starts from captured taste, not the generic mean.
  return getDesignState(session?.projectId || options?.projectId || "default", options);
}

function summarizeNodeResult(node) {
  return {
    nodeId: node.nodeId,
    category: node.category,
    ok: node.ok,
    blocked: node.blocked ?? false,
    pendingReview: node.pendingReview ?? false,
    itemCount: Array.isArray(node.items) ? node.items.length : 0,
    error: node.error ?? null,
    meta: node.meta ?? null,
    // Required-consult violations surfaced by graph.mjs at the gate: drafting/UI steps that skipped
    // the founder's taste (and design) signal. Carried through so the operator and founder see the
    // blocking issue at the gate instead of approving a draft as if it were grounded.
    ...(node.consultBlocked ? { consultBlocked: true, consultViolations: node.consultViolations ?? [] } : {}),
    items: (node.items ?? []).slice(0, 12),
  };
}

function summarizeRun(result) {
  return {
    runId: result.runId,
    ok: result.ok,
    pendingGates: result.pendingGates,
    targetNodeId: result.targetNodeId,
    error: result.error ?? null,
    nodes: Object.fromEntries(
      Object.entries(result.nodes ?? {}).map(([id, node]) => [id, summarizeNodeResult(node)]),
    ),
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

// Cross-session memory: the operator's recall of what it has already worked on in THIS project —
// distinct from the within-session chat memory the runtime resumes (claude-code.mjs). Past sessions
// become a compact brief so a new goal starts from "here is what you have done before," not a blank
// slate. Bounded to the few most recent meaningful sessions so the prompt stays small, and scoped to
// the project so one product's history never leaks into another's.
function recallPriorSessions(session, options) {
  const meaningful = new Set(["completed", "interrupted", "waiting_for_gate", "waiting_for_input", "blocked"]);
  return listOperatorSessions({ ...options, projectId: session.projectId ?? null })
    .filter((prior) => prior.id !== session.id && prior.goal && (prior.summary || meaningful.has(prior.status)))
    .slice(0, 5)
    .map((prior) => ({
      goal: prior.goal,
      status: prior.status,
      summary: prior.summary ? String(prior.summary).slice(0, 240) : null,
    }));
}

function renderPriorSessions(priorSessions = []) {
  if (!priorSessions.length) return "No prior operator sessions in this project — this is a fresh start.";
  return priorSessions
    .map((prior) => `- [${prior.status}] ${prior.goal}${prior.summary ? ` — ${prior.summary}` : ""}`)
    .join("\n");
}

function systemPrompt(session, workspace, priorSessions = []) {
  const grounding = workspace
    ? `The active repository is ${workspace.repo}. The defined win event is "${workspace.outcome}".`
    : "No repository workspace is currently active. State that limitation before making product claims.";
  // The drive objective. A normal session is driven by a one-off founder goal; an AMBIENT session is
  // driven by a standing brief — it was woken by a change in the world, not handed a fresh goal. The
  // brief replaces the goal as the objective; everything else (the wall, the toolset) is identical.
  const objective = firstNonEmpty(session.goal, session.standingBrief);
  const objectiveBlock = session.kind === "ambient"
    ? `Standing brief (this is an AMBIENT wake — a change in the world triggered you, not a one-off goal. React to it, build the work it calls for, and drive it to the founder gate. The wall is identical: nothing sends, deploys, or charges without the founder approving at the gate, and you never approve yourself.):
${objective}`
    : `Founder goal:
${objective}`;
  return `You are the go-to-market operator inside Drover. A founder hands you a goal; you build the work and run it up to their approval gate. That is the whole job — there is no required setup, no program or policy or template to stand up first.

${objectiveBlock}

What you can read (the product's truth — your claims come from here):
${grounding}

What you've already done in this project (build on it, don't redo it):
${renderPriorSessions(priorSessions)}

How you work:
- One move does most of it: compose_and_run. Given the goal, it designs the agents and steps the goal needs (research, enrich, draft — whatever fits), builds the workflow behind a founder gate, and runs it to that gate. Reach for it first, not last.
- Decide the approach freely from the real product and the goal in front of you. No fixed channel catalog, no ceremony. If the founder asks for several angles, lay them out in plain language first, then build the ones they pick.
- When the goal genuinely FORKS into distinct shapes (an outbound pipeline vs a content play vs a referral loop) and you'd otherwise be guessing which one the founder wants, call propose_candidates first: it sketches 2–3 shapes and pauses for the founder to pick, and their pick builds the chosen shape through compose_and_run. If the goal points at one clear shape, skip it and compose_and_run directly. Choosing among real go-to-market shapes is the founder's call, not yours.
- A product runs MANY pipelines, not one. Once you've built the first, build the next for the same product by calling compose_and_run with compose_new:true — each new pipeline joins the others on the product's overview. Don't refuse a second channel because one already exists; that overview of all the pipelines together is the point.
- The wall is absolute: nothing sends, publishes, deploys, or charges without the founder approving at the gate. You never approve a gate yourself. compose_and_run always stops at the gate.
- Learn and match the founder's taste from what they've approved and rejected before; don't re-ask what you can infer.
- Product claims come from the repository, or you label them inferred. Never invent traction, metrics, or facts.
- Use the graph tools (inspect_graph, inspect_problems, propose_graph_changes, run_node, run_loop) only to inspect or repair an actual failed run — not as the opening vocabulary.
- Ask the founder only for a real decision you cannot infer safely. Keep going until the work reaches the gate, is honestly blocked, or needs their judgment. Call complete when done.`;
}

function addEvent(session, event, options) {
  return saveOperatorSession(appendOperatorEvent(session, event), options);
}

// JOB 1 — the role-gated release. The gate connector already owns the WALL: nothing sends until a
// human supplies an approve decision. This guard answers the separate question of WHO is allowed to
// supply that decision when the gate is a shared team queue. Viewing (and commenting) is open to the
// whole team; RELEASE (approve/send) requires a team-store role of owner or approver. A solo founder's
// session has no team (teamId null → the founder's personal team) where the founder is the owner, so
// the single-user path stays exactly as before: the founder always passes.
//
// Returns the resolved acting user so the caller can stamp the release event with who cleared it.
function authorizeGateRelease(session, payload = {}, options = {}) {
  // The team that owns this conversation: the session's stamped teamId, else the project's effective
  // team (which resolves to the founder's personal team for a single-user project).
  const teamId = session.teamId
    || (session.projectId ? projectTeamId(session.projectId, options) : null)
    || projectTeamId(null, options);
  // The acting human: explicit payload.userId wins, else identity stamped on the request headers,
  // else the local founder. Same resolver the team routes use, so the UI and the agent door agree.
  const actor = resolveCurrentUser({
    ...options,
    userId: payload.userId,
    request: payload.request ?? options.request,
    headers: payload.headers ?? options.headers,
  });
  if (!canApprove(teamId, actor.userId, options)) {
    const member = getMember(teamId, actor.userId, options);
    const role = member?.role ?? "non-member";
    const error = new Error(
      `${actor.name} (${role}) cannot release this send. Only a team owner or approver may clear the founder gate. Others can view and comment.`,
    );
    error.code = "gate_release_forbidden";
    error.status = 403;
    error.teamId = teamId;
    error.userId = actor.userId;
    throw error;
  }
  return { actor, teamId };
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

async function executeTool(session, tool, options = {}) {
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
  // The producer (a read-only, scan-grounded data producer with NO deploy path) returns the artifact's
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

// The latest "what changed" instruction to feed a resumed conversation. The resume entry points
// (founder response, gate resolved, proposal accepted/discarded) each append a plain-string user
// message to modelMessages describing the change; the Claude Code runtime sends that as the prompt
// when it resumes its persisted SDK session. Null on a fresh session, where the goal is the prompt.
function latestResumeInstruction(session) {
  const messages = session.modelMessages ?? [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && typeof message.content === "string" && message.content.trim()) {
      return message.content;
    }
  }
  return null;
}

export async function runOperatorSession(id, runtime = {}) {
  const options = runtime.options ?? {};
  let session = getOperatorSession(id, options);
  if (["waiting_for_gate", "waiting_for_proposal", "waiting_for_input", "waiting_for_ideas", "waiting_for_candidates", "completed", "cancelled", "blocked"].includes(session.status)) {
    return session;
  }
  if (session.stepCount >= session.maxSteps) {
    return saveOperatorSession({
      ...session,
      status: "waiting_for_input",
      pendingQuestion: {
        question: "The operator reached its current iteration budget. Continue for another pass?",
        reason: "The session remains durable, but it needs permission to spend another model/tool cycle budget.",
      },
    }, options);
  }

  // Pick the runtime that will reason this session. GTM IDE keeps owning every
  // durable and safety decision below; the runtime only produces turns and asks
  // GTM IDE (via ctx callbacks) to execute the tool calls it proposes.
  const selection = selectRuntime({
    client: runtime.client,
    runtime: runtime.runtime,
    forced: runtime.forced || session.runtime,
  });
  if (!selection.adapter) {
    return addEvent({
      ...session,
      status: "failed",
      error: `No operator runtime is available. ${selection.reason} Sign in to Claude Code (the preferred local runtime) or set ANTHROPIC_API_KEY, then resume this durable session.`,
    }, {
      type: "session_failed",
      title: "No operator runtime connected",
      detail: selection.reason || "No operator runtime is available.",
    }, options);
  }
  const adapter = selection.adapter;
  const workspace = latestWorkspace(session, options);
  const authLabel = authModeLabel(selection.auth);

  session = addEvent({
    ...session,
    status: "running",
    runtime: adapter.id,
    startedAt: session.startedAt || new Date().toISOString(),
    error: null,
    pendingQuestion: null,
  }, {
    type: "operator_started",
    title: session.stepCount ? "Operator resumed" : "Operator started",
    detail: `Running ${session.model} via ${adapter.label}${authLabel ? ` on the ${authLabel}` : ""}.`,
  }, options);

  // The context handed to the runtime. Every callback persists through GTM IDE's
  // own stores, so the runtime never touches session state, the ledger, gates,
  // or cancellation directly — that boundary is what the provider-neutral split
  // is for.
  const ctx = {
    sessionId: id,
    // The objective the runtime drives toward. A goal session uses its goal; an ambient session uses
    // its standing brief (the same value the system prompt frames above). The runtime hands this to the
    // model as the opening prompt on a fresh drive — so a goal-less ambient session still has a real
    // objective to act on without relaxing anything past the gate.
    goal: firstNonEmpty(session.goal, session.standingBrief),
    model: session.model,
    system: systemPrompt(session, workspace, recallPriorSessions(session, options)),
    // The model is handed ONLY the naked toolset (truth + compose_and_run + repair loop + gate + chat).
    // executeOperatorTool below still routes every tool name for direct API/MCP callers and tests.
    // filterSafeTools re-asserts the outbound/approval guard over the list the model actually sees, so
    // the direct-Anthropic runtime path gets the SAME refusal the MCP bridge already applies — a future
    // tool named like send/approve/deploy can never reach the model on either door.
    tools: filterSafeTools(NAKED_TOOLS),
    client: selection.client ?? null,
    query: runtime.query ?? null,
    options,
    env: process.env,
    initialMessages: session.modelMessages?.length ? session.modelMessages : null,
    // Conversation continuity for the Claude Code (subscription) runtime. The runtime resumes the
    // SDK session id we stored on the prior drive and replays only the latest "what changed"
    // instruction (founder response, gate resolved, proposal decided) as the new prompt — so the
    // subprocess remembers the chat instead of restarting cold after every founder pause.
    runtimeSessionId: session.runtimeSessionId ?? null,
    resumePrompt: latestResumeInstruction(session),
    onRuntimeSession: (sid) => {
      if (sid && sid !== session.runtimeSessionId) {
        session = saveOperatorSession({ ...session, runtimeSessionId: sid }, options);
      }
    },
    maxSteps: session.maxSteps,
    stepCount: session.stepCount,
    isCancelled: () => getOperatorSession(id, options).status === "cancelled",
    currentStatus: () => getOperatorSession(id, options).status,
    onTurn: () => {
      session = saveOperatorSession({ ...session, stepCount: session.stepCount + 1 }, options);
      return session.stepCount;
    },
    onText: (text) => {
      session = addEvent(session, { type: "operator_note", title: "Operator reasoning", detail: text }, options);
    },
    onToolStart: (name) => {
      session = addEvent(session, {
        type: "tool_started",
        title: `Using ${name.replaceAll("_", " ")}`,
        detail: null,
        data: { tool: name },
      }, options);
    },
    onToolError: (name, message) => {
      session = addEvent(session, {
        type: "tool_failed",
        title: `${name.replaceAll("_", " ")} failed`,
        detail: message,
        data: { tool: name },
      }, options);
    },
    runTool: async ({ id: toolId, name, input }) => {
      const execution = await executeTool(session, { id: toolId, name, input }, options);
      session = execution.session;
      return { result: execution.result, pause: execution.pause };
    },
    persistMessages: (messages) => {
      session = saveOperatorSession({ ...session, modelMessages: messages }, options);
    },
  };

  try {
    const outcome = await adapter.drive(ctx);
    if (outcome.kind === "cancelled") return getOperatorSession(id, options);
    if (outcome.kind === "completed") {
      return addEvent({
        ...getOperatorSession(id, options),
        status: "completed",
        summary: outcome.summary,
        completedAt: new Date().toISOString(),
      }, {
        type: "session_completed",
        title: "Operator finished",
        detail: outcome.summary || "No additional action was requested.",
      }, options);
    }
    if (outcome.kind === "budget") {
      return addEvent({
        ...getOperatorSession(id, options),
        status: "waiting_for_input",
        pendingQuestion: {
          question: "The operator reached its iteration budget. Continue working this goal?",
          reason: "The session is preserved and can resume with a fresh budget.",
        },
      }, {
        type: "founder_input_requested",
        title: "Iteration budget reached",
        detail: "The session is safely paused rather than guessing indefinitely.",
      }, options);
    }
    // "paused" — executeTool already set waiting_for_gate / waiting_for_input or
    // completed (via the complete tool) and persisted it. Return the truth on disk.
    return getOperatorSession(id, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return addEvent({
      ...getOperatorSession(id, options),
      status: "failed",
      error: message,
    }, {
      type: "session_failed",
      title: "Operator stopped",
      detail: message,
    }, options);
  }
}

// A driving session that goes SILENT for longer than this has almost certainly hung inside the
// runtime's model turn — the SDK drive can stall without ever resolving or throwing, which used to
// leave the session "running" forever behind an infinite spinner (a real 40-minute hang was observed
// after a run completed with a blocked gate). The signal is silence, not duration: a legitimately long
// step still emits node/turn events as it progresses, so only true silence trips this. The window is
// generous so a single slow research node (which can run several minutes) is never mistaken for a hang.
const OPERATOR_STALL_MS = 12 * 60 * 1000;
const OPERATOR_WATCHDOG_INTERVAL_MS = 60 * 1000;

// Pure, testable: is a session hung? Only a session actively DRIVING can stall — a waiting_for_* pause
// is a legitimate wait on the founder and may sit for hours. `updatedAt` is stamped on every event and
// save, so it is the last-progress clock.
export function operatorSessionStalled(session, nowMs, thresholdMs = OPERATOR_STALL_MS) {
  if (!session || session.status !== "running") return false;
  const last = Date.parse(session.updatedAt || session.startedAt || session.createdAt || "");
  if (!Number.isFinite(last)) return false;
  return nowMs - last > thresholdMs;
}

export function launchOperatorSession(id, runtime = {}) {
  if (activeSessions.has(id)) return activeSessions.get(id);
  const options = runtime.options ?? {};
  // Watchdog: end a stalled drive honestly so the founder is never stuck behind an infinite spinner.
  // It never aborts a legitimately long turn — it acts only on silence past the stall window.
  const watchdog = setInterval(() => {
    try {
      const current = getOperatorSession(id, options);
      if (operatorSessionStalled(current, Date.now())) {
        clearInterval(watchdog);
        addEvent({
          ...current,
          status: "failed",
          error: "This run stalled — it stopped making progress for several minutes and was ended so you are not left waiting. Nothing was sent. You can retry the goal.",
        }, {
          type: "session_failed",
          title: "Operator stalled",
          detail: "No progress for several minutes; ended so you are not stuck waiting.",
        }, options);
        activeSessions.delete(id);
      }
    } catch {
      // Session gone or a transient store read — the finally cleanup below is the backstop.
    }
  }, OPERATOR_WATCHDOG_INTERVAL_MS);
  if (typeof watchdog.unref === "function") watchdog.unref();
  const work = runOperatorSession(id, runtime).finally(() => {
    clearInterval(watchdog);
    activeSessions.delete(id);
  });
  activeSessions.set(id, work);
  return work;
}

export function resumeOperatorSession(id, input, runtime = {}) {
  const options = runtime.options ?? {};
  let session = getOperatorSession(id, options);
  if (session.status === "waiting_for_gate") {
    throw new Error("Resolve the founder gate before resuming the operator.");
  }
  if (session.status === "waiting_for_proposal") {
    throw new Error("Accept or discard the proposed graph changes before resuming the operator.");
  }
  if (session.status === "waiting_for_ideas") {
    throw new Error("Pick or kill the proposed ideas before resuming the operator.");
  }
  if (session.status === "waiting_for_candidates") {
    throw new Error("Pick one of the proposed candidate pipelines before resuming the operator.");
  }
  if (["completed", "cancelled"].includes(session.status)) throw new Error(`Session is already ${session.status}.`);
  const text = String(input || "").trim();
  if (!text) throw new Error("A founder response is required.");
  session = addEvent({
    ...session,
    status: "ready",
    error: null,
    pendingQuestion: null,
    maxSteps: Math.min(60, Math.max(session.maxSteps, session.stepCount + 12)),
    modelMessages: [
      ...(session.modelMessages ?? []),
      { role: "user", content: `Founder response: ${text}` },
    ],
  }, {
    type: "founder_input_received",
    title: "Founder responded",
    detail: text,
  }, options);
  launchOperatorSession(session.id, runtime);
  return session;
}

// The founder decisions an ambient wake must NEVER bypass. A session paused at a gate, a graph
// proposal, or an ideas pick is holding an explicit founder decision; waking it again would jump that
// wall. The wake refuses until the founder resolves it. (Cancelled/completed are refused separately.)
const AMBIENT_WAKE_BLOCKING_STATUSES = new Set([
  "waiting_for_gate",
  "waiting_for_proposal",
  "waiting_for_ideas",
  "waiting_for_candidates",
]);

// The AMBIENT wake — the event-triggered / standing-brief twin of resumeOperatorSession. An
// input-router decision ({ route: "ambient_wake", brief }) or a due standing-brief tick lands here and
// drives the operator EXACTLY like a goal drive: the same NAKED_TOOLS, the same compose_and_run, the
// same founder gate. The ONLY difference is the objective — a standing brief replaces the one-off goal,
// so a kind:'ambient' session needs no goal. THE WALL IS UNTOUCHED: an ambient wake never sends,
// deploys, or auto-approves. It reaches the founder gate and STOPS, because it launches the same
// runOperatorSession (which pauses at waiting_for_gate) and the model is handed no approve/send/deploy
// tool. Cancellation and the gate both hold: a cancelled/terminal session is never re-woken, and a
// session already paused at a founder decision is not bypassed — that decision must be resolved first.
export function wakeAmbientSession(id, input = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  if (session.kind !== "ambient") {
    throw new Error(`Operator session ${id} is not an ambient session; drive a goal session through its normal path.`);
  }
  if (["completed", "cancelled"].includes(session.status)) {
    throw new Error(`Ambient session is already ${session.status}.`);
  }
  if (AMBIENT_WAKE_BLOCKING_STATUSES.has(session.status)) {
    throw new Error(`Ambient session ${id} is paused at ${session.status}; resolve the founder decision before another wake.`);
  }
  if (activeSessions.has(id)) return session; // a drive is already in flight — don't double-fire
  const brief = firstNonEmpty(input.brief, session.standingBrief, session.goal);
  if (!brief) throw new Error("An ambient wake needs a standing brief (on the session or the routing decision).");
  const trigger = firstNonEmpty(input.trigger, input.route, "ambient_wake");
  const changed = typeof input.detail === "string" && input.detail.trim() ? ` What changed: ${input.detail.trim()}.` : "";
  const woken = addEvent({
    ...session,
    status: "ready",
    error: null,
    pendingQuestion: null,
    // The brief that actually drove this wake stays on the session (under the durable field name the
    // store persists), so a resumed conversation and the system prompt read the same objective. Ambient
    // sessions are brief-driven, never goal-driven.
    standingBrief: brief,
    // Consume the due schedule and re-arm the NEXT one through the store's armNextWake, which owns the
    // cadence: a recurring brief (wakeIntervalMs set) re-arms one cadence out so it keeps standing, an
    // event-only brief re-arms to null and is woken only by the input router. This is the re-arm the
    // standing-brief tick depends on — without it a fired brief would go silent.
    nextWakeAt: armNextWake(session),
    maxSteps: Math.min(60, Math.max(session.maxSteps, session.stepCount + 12)),
    modelMessages: [
      ...(session.modelMessages ?? []),
      {
        role: "user",
        content: `Ambient wake (${trigger}). Standing brief: ${brief}.${changed} Compose and run the work this brief calls for and drive it to the founder gate. Stop at the gate — never send, deploy, or approve; the founder releases at the gate.`,
      },
    ],
  }, {
    type: "ambient_wake",
    title: "Ambient wake",
    detail: brief,
    data: { trigger },
  }, options);
  launchOperatorSession(woken.id, runtime);
  return woken;
}

// Is this ambient session DUE for a standing-brief wake right now? Due = an ambient session that is
// idle (not running, not terminal, not paused at a founder decision) with a brief and a nextWakeAt that
// has arrived. The founder gate is respected: a session waiting at a gate is NEVER auto-woken.
function isAmbientDue(session, nowMs) {
  if (!session || session.kind !== "ambient") return false;
  if (["running", "completed", "cancelled"].includes(session.status)) return false;
  if (AMBIENT_WAKE_BLOCKING_STATUSES.has(session.status)) return false;
  if (!firstNonEmpty(session.standingBrief, session.goal)) return false;
  if (!session.nextWakeAt) return false;
  const due = new Date(session.nextWakeAt).getTime();
  return Number.isFinite(due) && due <= nowMs;
}

// The background tick the HOST schedules (a server interval) — NOT a timer spun in module scope. It
// wakes every ambient session whose standing brief is due, driving each to the founder gate through
// wakeAmbientSession. It only DRIVES; it never sends, and an in-flight or gate-paused session is left
// untouched. Returns the ids it woke so the caller can log/observe. A session that races into a gate or
// a cancellation between the due check and the launch is skipped, never thrown.
export function runDueAmbientTicks(runtime = {}) {
  const options = runtime.options ?? {};
  const nowMs = Date.now();
  const woken = [];
  for (const summary of listOperatorSessions(options)) {
    if (activeSessions.has(summary.id)) continue;
    let session;
    try {
      session = getOperatorSession(summary.id, options);
    } catch {
      continue;
    }
    if (!isAmbientDue(session, nowMs)) continue;
    try {
      wakeAmbientSession(summary.id, { trigger: "standing_brief_tick" }, runtime);
      woken.push(summary.id);
    } catch {
      // Raced into a gate/cancellation since the due check — skip it, never break the tick.
    }
  }
  return woken;
}

export async function resolveOperatorGate(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  let session = getOperatorSession(id, options);
  if (session.status !== "waiting_for_gate" || !session.pendingGate?.runResult) {
    throw new Error("This operator session is not waiting at a founder gate.");
  }
  // Role-gated release: resolving a founder gate IS the act of releasing a send, so only an authorized
  // team member (owner/approver) may do it. Throws gate_release_forbidden (403) for a viewer/member.
  // The wall in the gate connector is unchanged; this only guards who may stand at it.
  const { actor: releasedBy } = authorizeGateRelease(session, payload, options);
  // Browser-only release (W2b): the operator gate is the live send path, so an APPROVAL here is held to
  // the same bar as the raw graph-run path (server.authorizeReleaseForRequest) — it must come from the
  // Drover page, refused for an agent-stamped or token-less request. The host injects this request-scoped
  // guard; internal/non-HTTP callers (and the direct unit tests) supply none and are unaffected, so this
  // only tightens the HTTP door. It fires ONLY on an approve intent (a pure reject/skip releases nothing
  // and stays open) and BEFORE the atomic claim below, so a refused approval never strands the session
  // mid-claim — mirroring why authorizeGateRelease runs before the claim.
  const authorizeReleaseForRequest = runtime.authorizeReleaseForRequest;
  if (typeof authorizeReleaseForRequest === "function" && hasApproveIntent(payload.approvals, payload.decisions)) {
    authorizeReleaseForRequest();
  }
  // ATOMICALLY CLAIM the transition before any async work. Two concurrent resolves both read
  // status === "waiting_for_gate" above, but that check and this save are SYNCHRONOUS with no await
  // between them, so under Node's single-threaded loop only the first call reaches here; it flips the
  // status off "waiting_for_gate" (persisted immediately) and the second call re-reads the claimed
  // status and is rejected by the guard above — the gated action (runGraph release) fires exactly once.
  // authorizeGateRelease runs BEFORE the claim so a forbidden actor never strands the session mid-claim.
  session = saveOperatorSession({ ...session, status: "resolving_gate" }, options);
  const flow = flowFor(session, options);
  // The SECOND founder authorization for a microproduct deploy (GUARD 2), built host-side from the
  // SAME authorized release this gate just cleared. A deploy is heavier than a send, so a normal gate
  // approval does NOT ship a microproduct — the founder must explicitly confirm the deploy AT the gate
  // (payload.deployConfirmed === true), mirroring revision.mjs's applyRevision(confirmation === true).
  // It is stamped with the authorized releaser's identity and threaded onto node.runtime by runGraph,
  // which composition cannot write — so neither a composed graph nor a model-driven run can forge it.
  const deployAuthorization = payload.deployConfirmed === true
    ? { confirmed: true, releasedBy: releasedBy.userId ?? null, userId: releasedBy.userId ?? null, name: releasedBy.name ?? null }
    : null;
  const result = await runGraph(flow.graph, {
    approvals: payload.approvals && typeof payload.approvals === "object" ? payload.approvals : {},
    decisions: payload.decisions && typeof payload.decisions === "object" ? payload.decisions : {},
    memory: memoryFor(flow.runs, options, session.projectId),
    designState: designStateFor(session, options),
    // Same researched buyer picture on the gate-resume run, so re-drafted descendants stay grounded.
    market: buildMarketContext(marketObjectStore.list({ ...options, projectId: session.projectId || "default" })),
    // Same product grounding + run history on the gate-resume run, so re-drafted descendants stay grounded.
    grounding: buildRunGrounding(flow.project),
    runs: flow.runs,
    resumeResult: session.pendingGate.runResult,
    deployAuthorization,
    stepRuntime: liveStepRuntime({ cwd: options.cwd }),
    loadLastRunItems: createDerivedSourceLoader({ ...options, projectId: session.projectId || "default" }),
    // BYO credentials: a founder-pasted key for this project wins over env; options carries the
    // persistence root so the stored key resolves from the same store the founder saved it in.
    projectId: session.projectId || "default",
    credentialOptions: options,
    // The live delivery seam: this gate-resume run is the ONE path where founder-approved items reach an
    // execute connector, so it is where a real send must be able to happen. The runner map only carries
    // HOW an approved message leaves (e.g. a real Gmail send); WHETHER it may leave is still the item's
    // gate stamp, set only by the authorized release above. Host-supplied here, never by composition.
    sendRunners: options.sendRunners ?? defaultSendRunners(),
    // Defense-in-depth at the gate point: re-assert authority inside the runner before any approval is
    // applied. authorizeGateRelease already passed above (or this code is unreachable); re-running it
    // here means the wall holds even if a future caller wires runGraph approvals without the front guard.
    authorizeRelease: () => authorizeGateRelease(session, payload, options),
  });
  recordFlowRun(flow.graph, result, options);
  // Bank the run's derivations (founder-gate taste signals, promotions) for their side effects.
  recordRunDerivations({ projectId: session.projectId || "default", graph: flow.graph, result }, options);
  session = addEvent({
    ...session,
    lastRunId: result.runId,
    pendingGate: result.pendingGates.length
      ? { runId: result.runId, nodeIds: result.pendingGates, runResult: result }
      : null,
    status: result.pendingGates.length ? "waiting_for_gate" : "ready",
    modelMessages: result.pendingGates.length ? session.modelMessages : [
      ...(session.modelMessages ?? []),
      {
        role: "user",
        content: `Founder gate resolved. Continued run ${result.runId}. Result: ${JSON.stringify(summarizeRun(result))}`,
      },
    ],
  }, {
    type: "gate_resolved",
    title: result.pendingGates.length ? "Gate still needs review" : "Founder gate resolved",
    detail: result.pendingGates.length
      ? `${result.pendingGates.length} gate${result.pendingGates.length === 1 ? "" : "s"} still contain undecided items.`
      : "The exact reviewed artifacts continued downstream without rerunning upstream work.",
    data: {
      runId: result.runId,
      pendingGates: result.pendingGates,
      releasedBy: { userId: releasedBy.userId, name: releasedBy.name },
    },
  }, options);
  if (!result.pendingGates.length) launchOperatorSession(id, runtime);
  return session;
}

// The founder accepts or discards a staged graph proposal. Accept applies the exact reviewed
// operations to the current graph and resumes the operator; discard drops them and resumes the
// operator told not to reapply. Mirrors resolveOperatorGate: founder-only, never an agent tool.
export function resolveOperatorProposal(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  // Resolve any session that HOLDS a staged proposal — not only one paused at waiting_for_proposal.
  // The operator often stages the change and finishes its turn (status → completed) with the proposal
  // still pending; the founder reviews it whenever. Accept re-applies and resumes; reject drops and
  // resumes. The only hard requirement is that a proposal actually exists.
  if (!session.pendingProposal) {
    throw new Error("This session has no graph proposal waiting for review.");
  }
  const proposal = session.pendingProposal;
  const accept = payload.accept === true || payload.decision === "accept";
  // The founder's note on the decision. On reject it's a redirect (Claude comes back and changes it);
  // on accept it's a quiet annotation — the operator reads it, and the learning loop can pick it up
  // later. The note never makes the decision; the founder's ✓/✕ does, and the note only colors it.
  const note = typeof payload.note === "string" ? payload.note.trim() : "";

  if (accept) {
    const flow = flowFor(session, options);
    // Re-apply against the live graph (not the cached preview) so the commit is valid even if the
    // graph moved since the proposal was staged; applyGraphOperations re-validates and throws if not.
    const patched = applyGraphOperations(flow.graph, proposal.operations);
    const saved = saveFlow(patched.graph, options);
    const acceptMsg = `Founder accepted the proposed graph changes (${proposal.changes.length} operation${proposal.changes.length === 1 ? "" : "s"}). They are now applied.${note ? ` They left a note: "${note}". Take it as durable guidance for future changes, not a new edit to make now.` : ""} Continue.`;
    const next = addEvent({
      ...session,
      status: "ready",
      pendingProposal: null,
      error: null,
      graphRevision: saved.graph.revision ?? 0,
      modelMessages: [
        ...(session.modelMessages ?? []),
        { role: "user", content: acceptMsg },
      ],
    }, {
      type: "graph_patched",
      title: note ? "Founder accepted with a note" : "Founder accepted proposed changes",
      detail: note || proposal.rationale,
      data: { revision: saved.graph.revision, changes: patched.changes, proposalId: proposal.id, note: note || undefined },
    }, options);
    launchOperatorSession(id, runtime);
    return next;
  }

  const rejectMsg = note
    ? `Founder discarded the proposed graph changes and asked for this instead: "${note}". Do not reapply the discarded changes — make this change instead.`
    : "Founder discarded the proposed graph changes. Do not reapply them; consider a different approach.";
  const next = addEvent({
    ...session,
    status: "ready",
    pendingProposal: null,
    error: null,
    modelMessages: [
      ...(session.modelMessages ?? []),
      { role: "user", content: rejectMsg },
    ],
  }, {
    type: "graph_proposal_discarded",
    title: note ? "Founder redirected the changes" : "Founder discarded proposed changes",
    detail: note || proposal.rationale,
    data: { proposalId: proposal.id, note: note || undefined },
  }, options);
  launchOperatorSession(id, runtime);
  return next;
}

// The founder reviews the surviving ideas and decides: kill the weak ones, pick the strong ones to
// build. This is a FOUNDER act — never an agent/MCP tool — exactly like resolving a gate or a proposal.
// `kill` marks ideas dead in the store (a killed idea never gets wired into a build); `build` resumes
// the operator with an instruction to drive each kept idea through its pre-wired compose_and_run.
// A `build` id that names one of THIS pause's cut ideas is an explicit founder REVIVE — the founder's
// call reverses the bar's, the idea comes back to life and gets wired. The operator generated the
// ideas; the founder alone decides which become work.
export function resolveOperatorIdeas(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  if (!session.pendingIdeas) {
    throw new Error("This session has no proposed ideas waiting for the founder.");
  }
  const killIds = Array.isArray(payload.kill) ? payload.kill : [];
  const buildIds = Array.isArray(payload.build)
    ? payload.build
    : (payload.build ? [payload.build] : []);
  // The ids the bar cut in THIS pause — the only killed ideas a build id may revive. A founder kill
  // from an earlier round stays dead.
  const cutIds = new Set((session.pendingIdeas.cut ?? []).map((entry) => entry.id));
  // What each idea said it was (the generator's own free words) — read off the pause payload so the
  // founder's keeps can be recorded as what they actually are.
  const pendingById = new Map([
    ...(session.pendingIdeas.ideas ?? []).map((entry) => [entry.id, entry]),
    ...(session.pendingIdeas.cut ?? []).map((entry) => [entry.id, entry]),
  ]);

  // Founder kills: mark each dead in the durable store so it is never re-proposed or wired.
  const killed = [];
  const killedIdeas = [];
  for (const ideaId of killIds) {
    try {
      const idea = getGtmIdea(ideaId, options);
      const dead = saveGtmIdea({ ...idea, verdict: "killed", killed: true, buildWiring: null }, options);
      killed.push(ideaId);
      killedIdeas.push(dead);
    } catch {
      // An unknown id is ignored rather than failing the whole resolution.
    }
  }

  // Founder keeps: the ideas to build. A founder-killed idea cannot be built, even if also listed to
  // build — but a BAR-cut idea from this pause can: building it is the founder's explicit revive.
  const toBuild = [];
  const revived = [];
  for (const ideaId of buildIds) {
    if (killed.includes(ideaId)) continue;
    try {
      let idea = getGtmIdea(ideaId, options);
      if (idea.killed && cutIds.has(ideaId)) {
        idea = saveGtmIdea({
          ...idea,
          verdict: "survived",
          killed: false,
          buildWiring: { kind: "compose_and_run", goal: idea.pitch, title: idea.pitch.slice(0, 80) },
        }, options);
        revived.push(ideaId);
      }
      if (!idea.killed) toBuild.push(idea);
    } catch {
      // Unknown id ignored.
    }
  }

  // Bank the founder's verdicts as IdeaKill/IdeaKeep signals on the feedback rail — the SAME canonical
  // shaper the standalone /ideas kill/keep routes use — so a decision made through the operator pause
  // (the path the `ideate` tool actually stops into) teaches the next ideation round which angles bite,
  // not only a decision made through the standalone route. Best-effort: never break the resolution.
  try {
    recordIdeaDecisions({
      projectId: session.projectId || "default",
      decisions: [
        ...killedIdeas.map((idea) => ({ idea, decision: "kill" })),
        ...toBuild.map((idea) => ({ idea, decision: "keep" })),
      ],
    }, options);
  } catch {
    // taste capture is additive; a write failure must not interrupt the founder's pick
  }

  // Two resolution modes, set by where the project is in its life. "build" (the default): kept ideas
  // compose into pipelines — the mature-project path. "directions": the project is at its BEGINNING —
  // kept ideas are starting directions, written into the ONE shared kernel (icp.hypotheses) that every
  // future composition reads. Each direction is recorded as what the idea actually IS — the generator's
  // own free words ("an offer", "an audience to chase") lead the line; no generator slug or internal
  // label ever enters stored belief text. No pipeline is composed and no per-idea channel object is
  // created: the kernel holds the belief; pipelines come later as projections over it.
  const mode = payload.mode === "directions" ? "directions" : "build";
  if (mode === "directions" && toBuild.length) {
    try {
      const scoped = session.projectId ? { ...options, projectId: session.projectId } : options;
      const project = loadProject(scoped);
      const existing = project.sharedContext?.icp?.hypotheses ?? [];
      const added = toBuild
        .map((idea) => {
          const what = String(pendingById.get(idea.id)?.what || "").trim();
          return what ? `${what[0].toUpperCase()}${what.slice(1)}: ${idea.pitch}` : idea.pitch;
        })
        .filter((line) => !existing.includes(line));
      if (added.length) {
        updateSharedContext({ icp: { hypotheses: [...existing, ...added] } }, scoped);
      }
    } catch {
      // Recording directions is additive; a write failure must not interrupt the founder's pick.
    }
  }

  // The model-steering instruction. It goes ONLY into modelMessages (the model's channel) — the
  // founder-visible event below narrates the same decision in the founder's terms instead.
  const instruction = mode === "directions"
    ? (toBuild.length
      ? `Founder kept ${toBuild.length} idea${toBuild.length === 1 ? "" : "s"} as starting DIRECTIONS — each recorded in the shared context's icp.hypotheses in its own words (an audience guess, an offer idea, a channel idea, ...), the one kernel every future composition reads. The project is at its beginning: do NOT compose pipelines or create channels yet. Propose the single cheapest next discovery probe for the kept directions (what to test first and why), then complete the session with that recommendation.${killed.length ? ` They killed ${killed.length} other idea${killed.length === 1 ? "" : "s"}; do not revisit those.` : ""}`
      : `Founder reviewed the ideas${killed.length ? ` and killed ${killed.length}` : ""} but kept none as directions yet. Wait for their direction; do not build on your own.`)
    : (toBuild.length
      ? `Founder picked ${toBuild.length} idea${toBuild.length === 1 ? "" : "s"} to build: ${toBuild.map((idea) => `"${idea.pitch}" (idea_id ${idea.id})`).join("; ")}. Build each with compose_and_run, passing its idea_id and its pre-wired goal — the first sets this session's channel, any others use compose_new:true. Passing idea_id wires the built channel back to its idea so the run's outcome closes the loop.${killed.length ? ` They killed ${killed.length} other idea${killed.length === 1 ? "" : "s"}; do not revisit those.` : ""}`
      : `Founder reviewed the ideas${killed.length ? ` and killed ${killed.length}` : ""} but picked none to build yet. Wait for their direction; do not build on your own.`);

  // What the founder sees: their decision as a happening, in plain words. Never the steering prompt.
  const plural = (n) => (n === 1 ? "" : "s");
  const setAside = killed.length ? `; ${killed.length} killed and remembered` : "";
  const broughtBack = revived.length ? ` (${revived.length} of them brought back from the cut)` : "";
  const founderDetail = toBuild.length
    ? (mode === "directions"
      ? `Kept ${toBuild.length} direction${plural(toBuild.length)}${broughtBack}${setAside}. Next you'll get the cheapest way to test what you kept — nothing runs yet.`
      : `Building ${toBuild.length} idea${plural(toBuild.length)} now${broughtBack} — each stops at your gate${setAside}.`)
    : `Nothing kept this round${killed.length ? ` — ${killed.length} killed and remembered` : ""}. Nothing moves until you point at the next step.`;

  const next = addEvent({
    ...session,
    status: "ready",
    pendingIdeas: null,
    error: null,
    modelMessages: [
      ...(session.modelMessages ?? []),
      { role: "user", content: instruction },
    ],
  }, {
    type: "ideas_resolved",
    title: toBuild.length
      ? (mode === "directions" ? "You kept starting directions" : "You picked ideas to build")
      : "You reviewed the ideas",
    detail: founderDetail,
    data: { mode, built: toBuild.map((idea) => idea.id), killed, revived },
  }, options);
  launchOperatorSession(id, runtime);
  return next;
}

// The founder picks ONE candidate pipeline to build. This is a FOUNDER act — never an agent/MCP tool —
// exactly like resolving a gate, a proposal, or ideas. The operator sketched the shapes; only the founder
// chooses which becomes work. The pick re-enters compose_and_run seeded with the chosen shape, so it is
// built and driven to the founder gate through the same normalize → bind IO → wall → validate path —
// nothing sends, and a picked shape gets no weaker safety than a freshly composed one.
export async function resolveOperatorCandidates(id, payload = {}, runtime = {}) {
  const options = runtime.options ?? {};
  const session = getOperatorSession(id, options);
  if (!session.pendingCandidates) {
    throw new Error("This session has no proposed candidate pipelines waiting for the founder.");
  }
  const pickId = typeof payload.pick === "string"
    ? payload.pick
    : (typeof payload.candidateId === "string" ? payload.candidateId : null);
  const candidates = Array.isArray(session.pendingCandidates.candidates) ? session.pendingCandidates.candidates : [];
  const chosen = pickId ? candidates.find((c) => c.id === pickId) : null;
  if (!chosen) {
    throw new Error(pickId ? `No candidate pipeline "${pickId}" is waiting for review.` : "A candidate pick is required.");
  }
  const goal = firstNonEmpty(session.pendingCandidates.goal, session.goal);

  // Clear the pause and record the founder's choice, then build the chosen shape through the SAME
  // compose_and_run door (seeded with the candidate), which composes it, runs it to the founder gate,
  // and stops. Building is the founder's pick made concrete — done host-side, no model turn needed.
  const working = addEvent({
    ...session,
    status: "ready",
    pendingCandidates: null,
    error: null,
  }, {
    type: "candidates_resolved",
    title: "Founder picked a candidate pipeline",
    detail: `${chosen.label}${chosen.rationale ? ` — ${chosen.rationale}` : ""}`,
    data: { pick: chosen.id, goal },
  }, options);

  const execution = await executeTool(working, {
    id: `candidate-${Date.now()}`,
    name: "compose_and_run",
    input: {
      goal,
      title: chosen.label,
      candidate: { label: chosen.label, nodes: chosen.nodes, edges: chosen.edges },
      compose_new: Boolean(working.graphId),
    },
  }, options);
  return execution.session;
}

export function cancelOperatorSession(id, options = {}) {
  const session = getOperatorSession(id, options);
  return addEvent({
    ...session,
    status: "cancelled",
    completedAt: new Date().toISOString(),
    pendingQuestion: null,
    pendingGate: null,
    pendingProposal: null,
    pendingIdeas: null,
    pendingCandidates: null,
  }, {
    type: "session_cancelled",
    title: "Operator session cancelled",
    detail: "The durable history remains available.",
  }, options);
}

// Exposed for the Claude Code operator MCP bridge (./operator-mcp.mjs), which
// runs as a subprocess and routes the same typed tools through executeTool
// against the durable session store.
export { TOOLS as operatorTools, executeTool as executeOperatorTool };
