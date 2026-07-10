// The operator's typed tool surface — the schema for graph operations, the full TOOLS list, and the
// NAKED subset the autonomous model is actually offered. Pure data, moved verbatim out of
// operator-runtime.mjs so the runtime file reads as orchestration, not a wall of schema.

// The node-kind enum is built from the canonical list in graph-operations so it can never drift below
// what the validator accepts. It previously listed only tool/agent/skill/code — so the operator could
// not create mcp/switch/terminal/query/web nodes the graph validator already allows.
import { NODE_KINDS_LIST } from "./graph-operations.mjs";

export const CANONICAL_OPERATOR_VERBS = Object.freeze(["inspect", "focus", "ask", "propose", "record", "run"]);
export const TERRAIN_PROJECTION_REF_TYPES = Object.freeze(["terrain-read", "terrain-hypothesis"]);
const TERRAIN_PROJECTION_REF_TYPE_SET = new Set(TERRAIN_PROJECTION_REF_TYPES);

export const STABLE_REF_INPUT_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", description: "Open object type, such as product, question, teammate, pipeline, graph, run, outcome, terrain-read, or terrain-hypothesis. Terrain refs are projection context only." },
    id: { type: "string", description: "Stable id owned by the referenced record." },
    projectId: { type: "string", description: "Owning project; when present it must match the requested scope." },
  },
  required: ["type", "id"],
};

const REF_KIND_ALIASES = new Map([
  ["project", "product"], ["workflow", "pipeline"], ["channel", "pipeline"],
  ["agent", "teammate"], ["crew-member", "teammate"], ["clarity", "question"], ["result", "outcome"],
]);

export function normalizeStableRef(input, { projectId = null, defaultKind = null } = {}) {
  if (input == null || input === "") return null;
  const source = typeof input === "string" ? { kind: defaultKind, id: input } : input;
  if (!source || typeof source !== "object") throw new Error("A stable reference must be an object with type and id.");
  const rawType = String(source.type ?? source.kind ?? defaultKind ?? "").trim().toLowerCase();
  const id = String(source.id ?? source.ref ?? source.key ?? "").trim();
  if (!rawType || !id) throw new Error("A stable reference requires type and id.");
  const owner = String(source.projectId ?? source.project ?? projectId ?? "").trim() || null;
  if (projectId && owner && owner !== projectId) throw new Error(`Reference ${rawType}:${id} belongs to project ${owner}, not ${projectId}.`);
  return { type: REF_KIND_ALIASES.get(rawType) ?? rawType, id };
}

export function normalizeStableRefs(inputs, options = {}) {
  const values = Array.isArray(inputs) ? inputs : inputs == null ? [] : [inputs];
  const refs = [];
  const seen = new Set();
  for (const value of values) {
    const ref = normalizeStableRef(value, options);
    if (!ref) continue;
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

export function isTerrainProjectionRef(ref) {
  return Boolean(ref && TERRAIN_PROJECTION_REF_TYPE_SET.has(String(ref.type ?? ref.kind ?? "").trim().toLowerCase()));
}

export function classifyOperatorVerb(verb) {
  const name = String(verb ?? "").trim().toLowerCase();
  if (!CANONICAL_OPERATOR_VERBS.includes(name)) throw new Error(`Unknown operator verb: ${name || "(empty)"}`);
  if (name === "inspect" || name === "ask") return { verb: name, access: "read", boundary: name === "ask" ? "model-owned judgment; no product mutation" : "read-only" };
  if (name === "run") return { verb: name, access: "write", boundary: "runs only to the founder gate; no approval or external release" };
  if (name === "propose") return { verb: name, access: "write", boundary: "reversible proposal only; founder review before application" };
  if (name === "focus") return { verb: name, access: "write", boundary: "session context only; referenced records are unchanged" };
  return { verb: name, access: "write", boundary: "model/session artifacts only; no durable clarity pin, founder decision, approval, or external effect" };
}

export const GRAPH_OPERATIONS_INPUT_SCHEMA = {
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
                enum: NODE_KINDS_LIST,
                description: "tool = connector (default); agent = invoke a subagent; skill = apply a skill's judgment; code = a bounded transform; mcp = a connected external tool (serverId/toolName); switch = a conditional router; terminal/query/web = human-operated workbench surfaces.",
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

export const TOOLS = [
  {
    name: "inspect",
    description: "Inspect the product-scoped record or ephemeral terrain projection context addressed by a stable reference, or current product context when omitted. Read-only; never focuses, records, composes, runs, or releases.",
    input_schema: { type: "object", properties: { ref: STABLE_REF_INPUT_SCHEMA, refs: { type: "array", items: STABLE_REF_INPUT_SCHEMA } }, required: [] },
  },
  {
    name: "focus",
    description: "Focus this durable conversation on one stable product, question, teammate, pipeline, graph, run, outcome, terrain projection, or open-kind reference. Changes session context only; terrain refs never become authority.",
    input_schema: { type: "object", properties: { ref: STABLE_REF_INPUT_SCHEMA, refs: { type: "array", items: STABLE_REF_INPUT_SCHEMA } }, required: ["ref"] },
  },
  {
    name: "ask",
    description: "Ask product-scoped teammates a focused question using read-only model-owned judgment. Records attributable answers but never composes, runs, sends, or changes product state.",
    input_schema: { type: "object", properties: { prompt: { type: "string" }, ref: STABLE_REF_INPUT_SCHEMA, refs: { type: "array", items: STABLE_REF_INPUT_SCHEMA }, teammateRefs: { type: "array", items: { type: "string" } } }, required: ["prompt"] },
  },
  {
    name: "propose",
    description: "Propose reversible GTM or product moves around stable references without applying them. Fuzzy judgment stays model-owned; graph changes remain founder-reviewable.",
    input_schema: { type: "object", properties: { prompt: { type: "string" }, ref: STABLE_REF_INPUT_SCHEMA, refs: { type: "array", items: STABLE_REF_INPUT_SCHEMA }, rationale: { type: "string" }, operations: GRAPH_OPERATIONS_INPUT_SCHEMA.properties.operations }, required: [] },
  },
  {
    name: "record",
    description: "Record an attributable session note, model artifact, or transient question proposal. Model callers cannot pin durable clarity or write founder/gate decisions.",
    input_schema: { type: "object", properties: { kind: { type: "string", enum: ["session_note", "model_artifact", "question_proposal"] }, value: {}, ref: STABLE_REF_INPUT_SCHEMA, refs: { type: "array", items: STABLE_REF_INPUT_SCHEMA } }, required: ["kind", "value"] },
  },
  {
    name: "run",
    description: "Run the focused pipeline or compose a requested action with stable references as context through the existing compose-and-run path. Terrain refs remain projection context. Always stops at the founder gate and cannot approve or release.",
    input_schema: { type: "object", properties: { goal: { type: "string" }, ref: STABLE_REF_INPUT_SCHEMA, refs: { type: "array", items: STABLE_REF_INPUT_SCHEMA }, composeNew: { type: "boolean" }, title: { type: "string" }, agents: { type: "array", items: { type: "object" } } }, required: [] },
  },
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
    description: "The ONE way to hand the founder options to pick among. When the goal genuinely FORKS into several distinct go-to-market shapes — for example an outbound pipeline that contacts owners directly, a content/community play that earns inbound, or a referral loop through existing users — OR the founder is clearly asking for ideas/angles rather than one committed build, sketch 2–3 candidate pipelines and PAUSE for the founder to pick. Each candidate is EMBODIED: it comes back as a full pipeline shape already naming the crew (its agents) and capabilities that would run it, ending at the founder gate — never a bare paragraph of prose. It NEVER runs, sends, or builds: a candidate is a shape only. If the goal points at ONE clear shape and the founder wants it built, skip this and go straight to compose_and_run. When the founder picks a candidate, that pick builds the chosen shape through compose_and_run and stops at the gate. There is no channel catalog and no forced fork; judge honestly from the real product and the goal, and if there is only one real shape, say so and build it.",
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
//
// There is exactly ONE "pause and let the founder pick among options" door the operator reaches for:
// propose_candidates, which sketches EMBODIED pipeline shapes — each already naming the crew (agent
// faces) and capabilities (marks) that would run it. The older prose `ideate` tool (paragraphs with no
// crew, graph composed only AFTER a pick) is deliberately kept OUT of this set, so the founder-driving
// operator never surfaces a bare-paragraph idea on either runtime door (the Claude Code path restricts
// its allowed MCP tools to exactly these NAKED names). `ideate` remains a routable tool for the
// taste-learning loop and back-compat callers, but it is no longer a shape the operator reaches for.
export const NAKED_TOOL_NAMES = new Set([
  "inspect",
  "focus",
  "ask",
  "propose",
  "record",
  "run",
  "inspect_product",          // truth — read what the product actually is
  "inspect_shared_context",   // taste/memory — ICP, positioning, what's been tried
  "update_shared_context",    // record inferred taste/positioning rather than duplicating into graphs
  "compose_and_run",          // THE move — design the work, build behind a gate, run to the gate
  "propose_candidates",       // the options door — sketch 2-3 EMBODIED shapes (crew + gate) and pause for the founder's pick
  "compose_microproduct",     // the build-and-ship door — cut a deployable artifact, STAGE it behind the gate
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
export const NAKED_TOOLS = TOOLS.filter((t) => NAKED_TOOL_NAMES.has(t.name));
