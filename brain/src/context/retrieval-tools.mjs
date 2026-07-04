// Retrieval tools — the agentic inversion of the context pre-pack.
//
// The pre-pack (assembler.mjs) composes EVERY provider into one block and staples it to
// the front of the agent prompt, whether the agent needs it or not. These tools flip that:
// each grounding source becomes a tool the agent CALLS when it decides it needs that source.
// Push becomes pull. The agent grounds itself live and on-demand instead of eating a packed
// lunch — and every call is observable in the run log (E1.3).
//
// One source of truth: each tool wraps the SAME provider summarizer from providers.mjs, so
// "how a source renders" is defined once. The only thing that changes between the pre-pack and
// these tools is WHO decides to read it. Honest blank holds: a tool whose source is absent
// returns a structured "not available" result, never fabricated text — exactly like a provider
// that contributes null.
//
// This is the parallel-path surface (E1.4): building it does NOT remove the pre-pack. The agent
// bridge can offer both behind a flag, and we cut over per-provider once the agentic version
// wins the comparison (E1.5/E1.6). Taste and design are exposed here as get_* tools for the
// surface; their required-consult enforcement and question-scoped query variants land in E2.

import {
  createProductProvider,
  createProductModelProvider,
  createMarketProvider,
  createTasteProvider,
  createDesignProvider,
  createStateProvider,
  createSignalProvider,
} from "./providers.mjs";
import { queryTaste } from "../memory.mjs";
import { queryDesign } from "../design-state-store.mjs";

// Each spec binds a callable tool name to the context key it reads and the provider that knows
// how to summarize it. `label` is used only for the honest-blank note. Descriptions are written
// for the AGENT reading the toolset — they say when to reach for the tool, not how it's built.
//
// `source` is the canonical provider identity (the same string `providers.mjs` gives the
// provider its `name`). It is the ONE vocabulary the per-provider cutover is keyed on, so a
// single name — "market", "taste" — selects both the pre-pack toggle and the retrieval tool.
// Without it the two access patterns drift (tool "get_run_state" vs provider "state").
const TOOL_SPECS = [
  {
    name: "get_product",
    source: "product",
    key: "grounding",
    make: createProductProvider,
    label: "product grounding",
    description:
      "Read the grounded, cited facts about the product being taken to market: what it is, its stack, its win event, and known blind spots. Cited reality from the code scan. Call this when a decision turns on what the product actually does.",
  },
  {
    name: "get_product_model",
    source: "product-model",
    key: "productModel",
    make: createProductModelProvider,
    label: "product model",
    description:
      "Read the founder-editable interpretation of the product — its core things, relationships, user goals, and states. This is INTERPRETATION, not cited truth (each element is marked derived or speculative). Call this for how the product is organized for the user.",
  },
  {
    name: "get_market",
    source: "market",
    key: "market",
    make: createMarketProvider,
    label: "market/buyer context",
    description:
      "Read who the buyer is: their now-trigger, where they actually are, the category, the promise, and the competitive reality. Most of what makes a go-to-market non-generic lives here, not in the code. Call this before targeting or positioning a message.",
  },
  {
    name: "get_run_state",
    source: "state",
    key: "__state",
    make: createStateProvider,
    label: "run history",
    description:
      "Read what has already been tried in this project: recent runs, what passed, what failed, and what is paused at a founder gate. Call this before proposing a move so you do not re-run something that already ran or failed.",
  },
  {
    name: "get_taste",
    source: "taste",
    key: "__memory",
    make: createTasteProvider,
    label: "founder taste",
    // Queried slice (E2.1): pass a `question` to get only the prior decisions that bear on it,
    // instead of the whole history. No question returns the full profile (backward-compatible).
    query: (source, args) => queryTaste(source, { question: args?.question, limit: args?.limit }),
    description:
      "Read the founder's accumulated taste — what they have approved, rejected, and edited at the gate. Pass a `question` (e.g. \"subject line tone\", \"how direct an ask\") to get only the decisions that bear on it; omit it for the full history. The one thing a generic model cannot guess — ALWAYS consult before drafting or proposing anything the founder will review.",
  },
  {
    name: "get_design",
    source: "design",
    key: "designState",
    make: createDesignProvider,
    label: "design house style",
    // Queried slice (E2.2): pass a `question` (e.g. "button component style") and/or a `dimension`
    // ("visual" | "ia" | "components" | "motion" | "copy") to get only the relevant slice, instead
    // of the full house-style block. No args returns the full state (backward-compatible).
    query: (source, args) => queryDesign(source, { question: args?.question, dimension: args?.dimension }),
    // get_design takes both `question` and `dimension`; taste takes only `question`.
    querySchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "What aspect of design this decision turns on (e.g. \"button padding\", \"motion on mobile\")." },
        dimension: { type: "string", enum: ["visual", "ia", "components", "motion", "copy"], description: "Pin to one design dimension." },
      },
      additionalProperties: false,
    },
    description:
      "Read the founder's captured front-end house style and reference library. Pass a `question` (e.g. \"button padding\", \"motion on mobile\") and/or a `dimension` (visual/ia/components/motion/copy) to get only the relevant slice; omit both for the full state. ALWAYS consult before producing any UI or visual artifact so the output starts from the founder's register instead of the generic mean.",
  },
  {
    name: "get_signal",
    source: "signal",
    key: "signal",
    make: createSignalProvider,
    label: "external signal",
    description:
      "Read any external/market signal wired for this run (web research, the leverage store). Call this for outside-the-codebase detail the founder has captured.",
  },
];

// A blank-but-honest result. `found:false` tells the agent the source is simply absent for this
// run, so it adapts (researches it live, or proceeds) rather than treating absence as an error.
function blank(label, meta = null) {
  return { found: false, text: null, meta, note: `No ${label} is available for this run.` };
}

// The canonical source names (provider identities) the cutover config is keyed on, in the order
// they appear in the catalog. Exported so the agent bridge can validate a cutover set against the
// real vocabulary instead of free strings.
export const RETRIEVAL_SOURCES = TOOL_SPECS.map((spec) => spec.source);

// Map a canonical source name (provider identity) to its retrieval tool name, and the inverse.
// The per-provider cutover speaks "market"/"taste"; the SDK and pre-pack toggles need both forms.
export const SOURCE_TO_TOOL = Object.fromEntries(TOOL_SPECS.map((spec) => [spec.source, spec.name]));

// Build the callable tool set bound to one run's context object. Mirrors providersFromContext's
// key vocabulary so the two access patterns can never drift on what a source is called.
//
// `sources` (optional) restricts the set to the named canonical sources — the per-provider cutover
// hook. Omit it (the default) to build every tool, which is today's full-agentic behavior. A name
// not in the catalog is simply ignored, so a stale config entry can never invent a tool.
export function createRetrievalTools(context = {}, { sources = null } = {}) {
  const selected = Array.isArray(sources) ? new Set(sources) : null;
  return TOOL_SPECS.filter((spec) => !selected || selected.has(spec.source)).map((spec) => {
    const source = context?.[spec.key];
    const provider = source != null ? spec.make(source) : null;
    return {
      name: spec.name,
      source: spec.source,
      description: spec.description,
      // MCP-shaped schema so this set can be exposed straight to the agent SDK / operator-mcp.
      // A spec with `query` accepts optional scoping args; `querySchema` overrides the default
      // single-question shape (e.g. get_design also takes `dimension`).
      inputSchema: spec.query
        ? (spec.querySchema ?? { type: "object", properties: { question: { type: "string", description: "What this decision turns on, to scope the slice." } }, additionalProperties: false })
        : { type: "object", properties: {}, additionalProperties: false },
      call(args = {}) {
        if (!source) return blank(spec.label);
        // Queried path: a relevant slice when any scoping arg is present (question or dimension).
        const hasQueryArg = spec.query && args && (args.question || args.dimension);
        if (hasQueryArg) {
          let sliced = null;
          try {
            sliced = spec.query(source, args);
          } catch (error) {
            return { found: false, text: null, meta: { error: String(error?.message ?? error) }, note: `Could not read ${spec.label}.` };
          }
          if (!sliced || !sliced.text) return blank(spec.label, sliced?.meta ?? null);
          return { found: true, text: sliced.text, meta: sliced.meta ?? null };
        }
        if (!provider) return blank(spec.label);
        let contribution = null;
        try {
          contribution = provider.contribute("");
        } catch (error) {
          return { found: false, text: null, meta: { error: String(error?.message ?? error) }, note: `Could not read ${spec.label}.` };
        }
        if (!contribution || !contribution.text) return blank(spec.label, contribution?.meta ?? null);
        return { found: true, text: contribution.text, meta: contribution.meta ?? null };
      },
    };
  });
}

// The advertised surface — name + description + schema only, no run data. This is what the agent
// SDK or the MCP bridge lists so a model knows which context it CAN pull. Decoupled from `call`
// so the catalog can be shown without binding a context.
export function listRetrievalTools() {
  return TOOL_SPECS.map((spec) => ({
    name: spec.name,
    source: spec.source,
    description: spec.description,
    inputSchema: spec.query
      ? (spec.querySchema ?? { type: "object", properties: { question: { type: "string", description: "What this decision turns on, to scope the slice." } }, additionalProperties: false })
      : { type: "object", properties: {}, additionalProperties: false },
  }));
}

// Dispatch by name against a built tool set. Returns the tool result, or a structured error for
// an unknown name (never throws — the agent gets a result it can reason about).
export function callRetrievalTool(tools, name, args = {}) {
  const tool = Array.isArray(tools) ? tools.find((t) => t.name === name) : null;
  if (!tool) {
    return { found: false, text: null, meta: null, note: `Unknown retrieval tool: ${name}. Available: ${listRetrievalTools().map((t) => t.name).join(", ")}.` };
  }
  return tool.call(args);
}
