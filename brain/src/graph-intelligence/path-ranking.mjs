import { clamp01, composeRankingSignals, mean, rankingStrength } from "../path-portfolio.mjs";
import { tiltedSignalWeights } from "../reallocation.mjs";
import { primaryWeakness } from "./weakness.mjs";

const WALK_EDGE_TYPES = new Set(["leads_to", "targets", "uses", "produced"]);
const WEAKNESS_PENALTY = {
  performance: 0.3,
  execution: 0.2,
  measurement: 0.15,
  product: 0.15,
  specificity: 0.1,
  evidence: 0.1,
};

function pathKey(nodeIds) {
  return [...new Set(nodeIds)].sort().join("\0");
}

function compactWords(text, limit = 4) {
  const stop = new Set(["the", "a", "an", "to", "for", "with", "and", "or", "of", "in", "on", "this", "that"]);
  const words = String(text ?? "")
    .replace(/[^a-z0-9\s'’-]/gi, " ") // keep apostrophes so "you're" doesn't split into "You Re"
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !stop.has(word.toLowerCase()));
  const selected = words.slice(0, limit);
  return selected.length ? selected.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") : null;
}

function candidateName(candidate, nodes) {
  const storedPath = nodes.find((node) => node.domain === "runs" && node.type === "path");
  // Prefer the model-authored summary the path generator already wrote (carried as the path node's
  // statement) over hand-picking words — the strategist named the bet, so use its name. Only a
  // BFS-discovered candidate with no stored path (no model name) falls through to the word-picker.
  const summary = String(storedPath?.statement ?? "").trim();
  if (summary) return summary;
  const bet = storedPath?.payload?.bet ?? {};
  const betName = compactWords([bet.buyer, bet.channel || bet.offer || bet.message].filter(Boolean).join(" "), 5);
  if (betName) return betName;
  const preferred = nodes.find((node) => node.domain === "strategy" && ["wedge", "positioning", "offer", "channel", "message", "value_prop"].includes(node.type))
    ?? nodes.find((node) => node.domain === "market")
    ?? nodes[0];
  return compactWords(preferred?.statement, 5) || "Testable Path";
}

function dedupeCandidates(candidates) {
  const out = [];
  for (const candidate of candidates) {
    const set = new Set(candidate.nodeIds);
    const duplicate = out.find((other) => {
      const otherSet = new Set(other.nodeIds);
      const overlap = [...set].filter((id) => otherSet.has(id)).length;
      return overlap / Math.max(set.size, otherSet.size, 1) >= 0.8;
    });
    if (!duplicate) {
      out.push(candidate);
    } else if ((candidate.score ?? 0) > (duplicate.score ?? 0)) {
      const index = out.indexOf(duplicate);
      out[index] = candidate;
    }
  }
  return out;
}

export function enumerateCandidates(graph = {}) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.filter((node) => !node.retiredAt) : [];
  const edges = Array.isArray(graph.edges) ? graph.edges.filter((edge) => edge.status !== "removed" && edge.status !== "challenged") : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const candidates = [];

  for (const pathNode of nodes.filter((node) => node.domain === "runs" && node.type === "path")) {
    const refs = Array.isArray(pathNode.payload?.restsOn) ? pathNode.payload.restsOn : [];
    const refIds = refs.map((ref) => (typeof ref === "string" ? ref : ref?.id)).filter(Boolean);
    const nodeIds = [pathNode.id, ...refIds.filter((id) => nodeById.has(id))];
    const edgeIds = edges
      .filter((edge) => nodeIds.includes(edge.source) && nodeIds.includes(edge.target))
      .map((edge) => edge.id);
    candidates.push({ pathId: pathNode.id, nodeIds: [...new Set(nodeIds)], edgeIds, source: "stored" });
  }

  const outgoing = new Map();
  for (const edge of edges) {
    if (!WALK_EDGE_TYPES.has(edge.type)) continue;
    if (edge.confidence < 40) continue;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge);
  }

  for (const start of nodes.filter((node) => node.domain === "strategy")) {
    const queue = [{ nodeIds: [start.id], edgeIds: [] }];
    let emitted = false;
    for (let depth = 0; depth < 8 && queue.length; depth += 1) {
      const level = queue.splice(0, 8);
      for (const partial of level) {
        const lastId = partial.nodeIds.at(-1);
        const last = nodeById.get(lastId);
        if (last && partial.nodeIds.length > 1 && ["pipeline", "customer", "runs", "assets", "audience"].includes(last.domain)) {
          candidates.push({ pathId: `walk:${pathKey(partial.nodeIds)}`, nodeIds: partial.nodeIds, edgeIds: partial.edgeIds, source: "walk" });
          emitted = true;
        }
        for (const edge of outgoing.get(lastId) ?? []) {
          if (partial.nodeIds.includes(edge.target)) continue;
          queue.push({ nodeIds: [...partial.nodeIds, edge.target], edgeIds: [...partial.edgeIds, edge.id] });
        }
      }
    }
    if (!emitted) {
      candidates.push({ pathId: `walk:${start.id}`, nodeIds: [start.id], edgeIds: [], source: "single" });
    }
  }

  return dedupeCandidates(candidates);
}

export function computeObjectPathSignals(candidate, graph = {}, weights) {
  const nodesById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const nodes = candidate.nodeIds.map((id) => nodesById.get(id)).filter(Boolean);
  const productNodes = nodes.filter((node) => node.domain === "product");
  const channelNodes = nodes.filter((node) => node.type === "channel" || node.domain === "audience");
  const measurementNodes = nodes.filter((node) => node.domain === "measurement" || node.type === "success_criteria");
  const evidenceStrength = mean(nodes.map((node) => rankingStrength(node.solidity)));
  const productReadiness = mean(productNodes.map((node) => rankingStrength(node.solidity)));
  const channelReachability = mean(channelNodes.map((node) => rankingStrength(node.solidity)));
  const measurementReadiness = measurementNodes.length
    ? mean(measurementNodes.map((node) => rankingStrength(node.solidity) || (node.type === "contract" ? 0.75 : 0.25)))
    : 0;
  const complexity = Math.min(nodes.length, 8) / 8;
  const confidenceSignals = nodes.map((node) => Number(node.confidence) / 100).filter(Number.isFinite);
  const upside = confidenceSignals.length ? mean(confidenceSignals) : evidenceStrength;
  const founderFit = nodes.length ? nodes.filter((node) => node.origin === "founder").length / nodes.length : 0;
  return composeRankingSignals({
    evidenceStrength, productReadiness, channelReachability, measurementReadiness,
    complexity, upside, founderFit,
  }, weights);
}

export function scorePath(candidate, graph = {}, weights) {
  const signals = computeObjectPathSignals(candidate, graph, weights);
  const nodesById = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const nodes = candidate.nodeIds.map((id) => nodesById.get(id)).filter(Boolean);
  const firedWeaknesses = nodes.flatMap((node) => (node.weaknesses ?? []).filter((item) => item.status === "open"));
  const penalty = firedWeaknesses.reduce((score, item) => score * (1 - (WEAKNESS_PENALTY[item.kind] ?? 0.05)), 1);
  const score = clamp01(signals.composite * penalty);
  const weakestLink = nodes
    .map((node) => ({ nodeId: node.id, weakness: primaryWeakness(node.weaknesses ?? []), signal: Math.min(rankingStrength(node.solidity), Number(node.confidence ?? 0) / 100 || 0) }))
    .filter((item) => item.weakness)
    .sort((a, b) => a.signal - b.signal)[0] ?? null;
  return { ...candidate, name: candidateName(candidate, nodes), score, signals, weakestLink };
}

export function recommend(graph = {}, { limit = 8, ...options } = {}) {
  // The founder-tunable ranking weights, passed through the LEARN tilt (Area 3): the founder's saved
  // base (seed defaults out of the box, a gate-tuned table once saved) is the anchor, and the machine's
  // measured outcomes nudge it — bounded, clamped, never inverted — toward the ranking dimensions that
  // correlate with motions actually converting. With nothing measured the tilt is a no-op and `weights`
  // is byte-identical to the founder's base. Scoped to this graph's project, honoring any test root in
  // options so an isolated run never reads the real store.
  const { weights } = tiltedSignalWeights({ ...options, projectId: options.projectId ?? graph.projectId });
  const candidates = enumerateCandidates(graph);
  if (!candidates.length) {
    return {
      rankedPaths: [],
      highlighted: [],
      reason: "scan found no product truths and research returned nothing",
      weights,
    };
  }
  const rankedPaths = candidates
    .map((candidate) => scorePath(candidate, graph, weights))
    .sort((a, b) =>
      b.score - a.score ||
      b.signals.evidenceStrength - a.signals.evidenceStrength ||
      String(a.pathId).localeCompare(String(b.pathId)),
    )
    .slice(0, limit);
  // Highlight an actual ROUTE, not a lone high-evidence card. A single node scores well on evidence
  // but is not "a path to revenue" — the founder needs a spine to trace. Prefer the best-scored path
  // that spans at least a few nodes, falling back only when no real route exists.
  // Highest-scored path that is an actual route (≥2 nodes), not a lone card — respect score, just skip
  // the single-node "paths" that aren't a spine to trace.
  const highlighted = rankedPaths.find((path) => new Set(path.nodeIds).size >= 2) ?? rankedPaths[0];
  return {
    rankedPaths,
    highlighted: highlighted ? [highlighted] : [],
    weights,
  };
}
