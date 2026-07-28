export const CANVAS_NODE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    detail: { type: "string" },
    kind: { enum: ["question", "truth", "proposal", "alternative", "unknown", "evidence", "action", "gate", "outcome"] },
    state: { enum: ["current", "provisional", "unresolved"] },
    sourceRef: { type: "string" },
  },
  required: ["id", "label", "detail", "kind", "state", "sourceRef"],
};

export const CANVAS_EDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    from: { type: "string" },
    to: { type: "string" },
    label: { type: "string" },
    kind: { enum: ["relationship", "dependency", "alternative", "return"] },
  },
  required: ["from", "to", "label", "kind"],
};

export const CANVAS_MODEL_VIEW_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "A concise business title for this focused intent view." },
    summary: { type: "string", description: "A compact founder-facing account of what this view now makes clearer." },
    question: { type: "string", description: "The founder's exact governing intent or question, preserved rather than replaced by an inferred architecture topic." },
    nodes: {
      type: "array",
      maxItems: 100,
      description: "The smallest useful set of relationships that clarifies what the founder could direct next.",
      items: CANVAS_NODE_SCHEMA,
    },
    edges: {
      type: "array",
      maxItems: 160,
      items: CANVAS_EDGE_SCHEMA,
    },
  },
  required: ["title", "summary", "question", "nodes", "edges"],
};

export const CANVAS_FLOW_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    objective: { type: "string" },
    steps: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          detail: { type: "string" },
          type: { enum: ["trigger", "source", "agent-work", "tool", "condition", "wait", "founder-decision", "founder-gate", "external-action", "observation", "outcome"] },
        },
        required: ["id", "label", "detail", "type"],
      },
    },
    edges: {
      type: "array",
      maxItems: 160,
      items: CANVAS_EDGE_SCHEMA,
    },
  },
  required: ["title", "summary", "objective", "steps", "edges"],
};

export const STAGED_ARTIFACT_CONTENT_SCHEMA = {
  anyOf: [
    { type: "string", minLength: 1 },
    {
      type: "object",
      properties: {
        kind: { const: "document" },
        format: { enum: ["markdown", "text", "html", "code"] },
        content: { type: "string" },
      },
      required: ["kind", "format", "content"],
    },
    {
      type: "object",
      properties: {
        kind: { enum: ["markdown", "text", "html", "code"] },
        content: { type: "string" },
      },
      required: ["kind", "content"],
    },
    {
      type: "object",
      properties: {
        kind: { const: "image" },
        src: { type: "string" },
        caption: { type: "string" },
      },
      required: ["kind", "src"],
    },
    {
      type: "object",
      properties: {
        kind: { const: "diff" },
        diff: { type: "string" },
        diffStat: { type: "string" },
      },
      required: ["kind", "diff"],
    },
    {
      type: "object",
      properties: {
        kind: { const: "model-view" },
        purpose: { const: "product-gtm-local-model" },
        question: { type: "string" },
        branchRef: { type: "string" },
        nodes: { type: "array", items: CANVAS_NODE_SCHEMA },
        edges: { type: "array", items: CANVAS_EDGE_SCHEMA },
      },
      required: ["kind", "purpose", "question", "branchRef", "nodes", "edges"],
    },
    {
      type: "object",
      properties: {
        kind: { const: "flow" },
        purpose: { enum: ["product-gtm-workflow"] },
        objective: { type: "string" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              detail: { type: "string" },
              type: { enum: ["trigger", "source", "agent-work", "tool", "condition", "wait", "founder-decision", "founder-gate", "external-action", "observation", "outcome"] },
            },
            required: ["id", "label"],
          },
        },
        edges: { type: "array", items: CANVAS_EDGE_SCHEMA },
      },
      required: ["kind", "purpose", "objective", "steps", "edges"],
    },
    {
      type: "object",
      properties: {
        kind: { const: "comparison" },
        variant: { enum: ["before-after", "alternatives"] },
        columns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    detail: { type: "string" },
                    artifactRef: { type: "string" },
                  },
                  required: ["label"],
                },
              },
            },
            required: ["id", "title", "items"],
          },
        },
      },
      required: ["kind", "variant", "columns"],
    },
  ],
};

const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const nonempty = (value) => typeof value === "string" && Boolean(value.trim());
const array = (value) => Array.isArray(value) ? value : [];

export function isSupportedStagedArtifactContent(content) {
  if (nonempty(content)) return true;
  const value = record(content);
  if (!value) return false;
  if (value.kind === "document") return ["markdown", "text", "html", "code"].includes(value.format) && typeof value.content === "string";
  if (["markdown", "text", "html", "code"].includes(value.kind)) return typeof value.content === "string";
  if (value.kind === "image") return nonempty(value.src);
  if (value.kind === "diff") return typeof value.diff === "string";
  if (value.kind === "model-view") {
    return value.purpose === "product-gtm-local-model"
      && typeof value.question === "string"
      && typeof value.branchRef === "string"
      && Array.isArray(value.nodes)
      && Array.isArray(value.edges);
  }
  if (value.kind === "flow") {
    return value.purpose === "product-gtm-workflow"
      && typeof value.objective === "string"
      && Array.isArray(value.steps)
      && Array.isArray(value.edges);
  }
  return value.kind === "comparison"
    && ["before-after", "alternatives"].includes(value.variant)
    && Array.isArray(value.columns);
}

function safeId(value, fallback, used) {
  const base = String(value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || fallback;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  used.add(candidate);
  return candidate;
}

function legacyMapRecords(content) {
  const topLevel = array(content.nodes).map((entry) => ({ entry, layer: null }));
  const layered = array(content.layers).flatMap((layer) => {
    const group = record(layer);
    const label = group?.layer ?? group?.label ?? group?.name ?? null;
    return array(group?.nodes).map((entry) => ({ entry, layer: label }));
  });
  return [...topLevel, ...layered];
}

// Old agents could stage arbitrary `*-map` objects. Keep the stored object untouched, but project its
// source-bearing nodes through the existing provisional Canvas view rather than exposing serialization.
export function projectLegacyRelationshipMap(content, { title = null } = {}) {
  const value = record(content);
  const kind = String(value?.kind ?? "").toLowerCase();
  if (!value || (!kind.endsWith("-map") && kind !== "map")) return null;
  const entries = legacyMapRecords(value);
  if (!entries.length) return null;

  const used = new Set();
  const aliases = new Map();
  const nodes = entries.flatMap(({ entry, layer }, index) => {
    const item = record(entry);
    const label = item?.label ?? item?.name ?? item?.title;
    if (!nonempty(label)) return [];
    const id = safeId(item.id ?? label, `map-item-${index + 1}`, used);
    for (const alias of [item.id, item.name, item.label, item.title]) {
      if (nonempty(alias)) aliases.set(alias, id);
    }
    const role = item.role ?? item.detail ?? item.description ?? null;
    const detail = [layer, role].filter(nonempty).join(" · ") || undefined;
    const sourceRef = item.sourceRef ?? item.source ?? item.path ?? undefined;
    return [{
      id,
      label: String(label).trim(),
      ...(detail ? { detail } : {}),
      kind: "truth",
      state: "provisional",
      ...(nonempty(sourceRef) ? { sourceRef: String(sourceRef).trim() } : {}),
    }];
  });
  if (!nodes.length) return null;

  const edges = array(value.edges).flatMap((entry) => {
    const edge = record(entry);
    const from = aliases.get(edge?.from) ?? edge?.from;
    const to = aliases.get(edge?.to) ?? edge?.to;
    if (!nonempty(from) || !nonempty(to)) return [];
    return [{
      from: String(from),
      to: String(to),
      ...(nonempty(edge.label) ? { label: String(edge.label).trim() } : {}),
      kind: ["relationship", "dependency", "alternative", "return"].includes(edge.kind) ? edge.kind : "relationship",
    }];
  });
  const question = value.question ?? value.summary ?? title ?? "How does this project fit together?";
  return {
    kind: "model-view",
    purpose: "product-gtm-local-model",
    question: String(question).trim(),
    branchRef: "",
    nodes,
    edges,
  };
}
