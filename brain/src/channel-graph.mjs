function slug(value) {
  return String(value || "channel")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "channel";
}

export function channelIdFor(name, existingIds = []) {
  const base = slug(name);
  const used = new Set(existingIds);
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

// A new channel is intentionally blank. The founder or resident operator
// defines its motion by adding grounded nodes and edges. GTM IDE supplies the
// durable graph contract, not a hidden catalog of preferred GTM strategies.
export function createBlankChannelGraph({ id, name, objective = "", kind = "custom" }) {
  return {
    id,
    name,
    kind,
    objective,
    version: "1.0.0",
    revision: 0,
    nodes: [],
    edges: [],
    store: { path: `.gtm/flows/${id}.json`, runs: 0 },
  };
}

export function cloneChannelGraph(graph, { id, name, objective, kind }) {
  return {
    ...structuredClone(graph),
    id,
    name,
    objective: objective ?? graph.objective ?? "",
    kind: kind ?? graph.kind ?? "custom",
    revision: 0,
    store: { path: `.gtm/flows/${id}.json`, runs: 0 },
  };
}
