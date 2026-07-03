import { productTruthsFromScan } from "../gtm-store.mjs";
import { normalizeEvidenceList } from "../evidence.mjs";
import { normalizeObjectEdge, normalizeObjectNode, genObjectGraphId } from "../object-graph-store.mjs";
import { now } from "../store-fs.mjs";

export const SPRAY_STRATEGY_PROMPT = `Generate shallow Strategy cards for a GTM object graph.
Return ONLY JSON: [{ "type": "wedge|positioning|value_prop|offer|channel|message|proof_point|conversion_path|<open>", "statement": "one plain sentence", "restsOn": ["node id"], "evidence": [{ "claim": "...", "source": "...", "solidity": "inferred" }], "confidence": 0.0, "claimsProduct": false }].
Every card must rest on supplied Product or Market node ids when possible. Do not rank. Do not invent traction.`;

const MARKET_TYPES = new Set(["buyer", "icp", "pain", "job", "trigger", "workaround", "competitor", "objection"]);
const STRATEGY_KIND_MAP = new Map([
  ["valueProp", "value_prop"],
  ["value_prop", "value_prop"],
  ["conversionPath", "conversion_path"],
  ["conversion_path", "conversion_path"],
  ["proof", "proof_point"],
]);

function sourceRef({ kind, ref, preview, at = now() }) {
  return { kind, ref, preview: preview || ref, at };
}

function citationSource(cite) {
  if (!cite?.file) return null;
  return `${cite.file}:${cite.line ?? 1}`;
}

function tokenSet(text) {
  return new Set(String(text ?? "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
}

function jaccard(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size && !right.size) return 1;
  const overlap = [...left].filter((token) => right.has(token)).length;
  return overlap / (left.size + right.size - overlap);
}

export function mergeNearDuplicateNodes(nodes) {
  const out = [];
  for (const node of nodes) {
    const prior = out.find((item) => item.domain === node.domain && item.type === node.type && jaccard(item.statement, node.statement) >= 0.8);
    if (!prior) {
      out.push(node);
    } else {
      prior.evidence = normalizeEvidenceList([...(prior.evidence ?? []), ...(node.evidence ?? [])]);
      prior.sources = [...(prior.sources ?? []), ...(node.sources ?? [])];
      prior.payload = { ...(prior.payload ?? {}), ...(node.payload ?? {}) };
    }
  }
  return out;
}

export function productNodesFromScan(report, { projectId = "default" } = {}) {
  const truths = productTruthsFromScan(report, { projectId });
  const nodes = truths.map((truth) => normalizeObjectNode({
    id: `obj-${truth.id}`,
    projectId,
    domain: "product",
    type: "capability",
    maturity: "typed",
    statement: truth.statement,
    evidence: truth.evidence,
    sources: truth.evidence.map((item) => sourceRef({ kind: "scan", ref: item.source, preview: item.notes || item.claim || item.source, at: item.capturedAt })),
    origin: "scan",
    originRef: truth.scanRef?.repo || report?.repo || null,
    payload: { citations: truth.evidence.map((item) => ({ source: item.source, text: item.notes })) },
  }));
  for (const gap of report?.gaps ?? []) {
    const citations = Array.isArray(gap.citations) ? gap.citations : [];
    const evidence = citations.map((cite) => ({
      claim: gap.summary || gap.title,
      source: citationSource(cite),
      solidity: "observed",
      notes: cite.text || cite.label || null,
    })).filter((item) => item.source);
    const measurementish = /attribution|track|event|measure|analytics|source/i.test(`${gap.id} ${gap.title} ${gap.summary}`);
    nodes.push(normalizeObjectNode({
      id: `obj-gap-${gap.id || genObjectGraphId("gap")}`,
      projectId,
      domain: "product",
      type: measurementish ? "measurement_gap" : "product_gap",
      maturity: "typed",
      statement: gap.title || gap.summary || "Scan found a product gap.",
      evidence,
      sources: evidence.map((item) => sourceRef({ kind: "scan", ref: item.source, preview: item.notes || item.claim })),
      origin: "scan",
      originRef: gap.id || report?.repo || null,
      payload: { gapId: gap.id ?? null, severity: gap.severity ?? null, recommendation: gap.recommendation ?? null },
    }));
  }
  return mergeNearDuplicateNodes(nodes);
}

export function marketObjectToNode(object, { projectId = object?.projectId ?? "default" } = {}) {
  const rawKind = String(object?.kind ?? "signal").trim();
  const strategyType = STRATEGY_KIND_MAP.get(rawKind) ?? rawKind;
  const domain = MARKET_TYPES.has(strategyType) ? "market" : "strategy";
  const type = domain === "market" ? strategyType : strategyType;
  return normalizeObjectNode({
    id: `obj-${object.id}`,
    projectId,
    domain,
    type,
    maturity: "typed",
    statement: object.statement,
    evidence: object.evidence,
    confidence: Number.isFinite(Number(object.confidence)) ? Math.round(Number(object.confidence) * 100) : null,
    sources: (object.evidence ?? []).map((item) => sourceRef({ kind: object.source || "web", ref: item.source || object.id, preview: item.notes || item.claim || object.statement, at: item.capturedAt })),
    origin: object.source === "founder-stated" ? "founder" : "spray",
    originRef: object.id,
    payload: { sourceKind: rawKind, openQuestions: object.openQuestions ?? [] },
  });
}

export function strategyCandidateToNode(candidate, { projectId = "default", nodeIds = new Set() } = {}) {
  const type = String(candidate?.type ?? "wedge").trim() || "wedge";
  const restsOn = (Array.isArray(candidate?.restsOn) ? candidate.restsOn : [])
    .map((id) => (typeof id === "string" ? id : id?.id))
    .filter((id) => id && nodeIds.has(id));
  const evidence = normalizeEvidenceList(candidate?.evidence);
  return normalizeObjectNode({
    id: candidate.id || genObjectGraphId("obj"),
    projectId,
    domain: "strategy",
    type,
    maturity: "typed",
    statement: candidate.statement,
    evidence,
    sources: evidence.map((item) => sourceRef({ kind: item.source ? "model-grounding" : "spray", ref: item.source || "strategy-spray", preview: item.claim || candidate.statement, at: item.capturedAt })),
    origin: "spray",
    originRef: candidate.sprayId ?? null,
    payload: {
      restsOn,
      modelConfidence: Number.isFinite(Number(candidate.confidence)) ? Math.min(1, Math.max(0, Number(candidate.confidence))) : null,
      claimsProduct: Boolean(candidate.claimsProduct),
      ...(candidate.payload && typeof candidate.payload === "object" ? candidate.payload : {}),
    },
  });
}

export function structuralSupportEdges(nodes, { projectId = "default" } = {}) {
  const ids = new Set(nodes.map((node) => node.id));
  const edges = [];
  const seen = new Set();
  for (const node of nodes) {
    for (const ref of node.payload?.restsOn ?? []) {
      const target = typeof ref === "string" ? ref : ref?.id;
      if (!ids.has(target)) continue;
      const key = `${target}\0${node.id}\0supports`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(normalizeObjectEdge({
        id: genObjectGraphId("edge"),
        projectId,
        source: target,
        target: node.id,
        type: "supports",
        status: "proposed",
        basis: [{ kind: "spray", ref: target, preview: `${target} grounds ${node.statement}`, at: now() }],
        confidence: 100,
      }));
    }
  }
  return edges;
}

export function sprayGraph({
  projectId = "default",
  scanReport = null,
  marketObjects = [],
  strategyCandidates = [],
  existingGraph = null,
} = {}) {
  const existingNodes = Array.isArray(existingGraph?.nodes) ? existingGraph.nodes : [];
  const productNodes = scanReport ? productNodesFromScan(scanReport, { projectId }) : [];
  const marketNodes = (Array.isArray(marketObjects) ? marketObjects : []).map((object) => marketObjectToNode(object, { projectId }));
  const baseNodes = mergeNearDuplicateNodes([...existingNodes, ...productNodes, ...marketNodes]);
  const nodeIds = new Set(baseNodes.map((node) => node.id));
  const strategyNodes = (Array.isArray(strategyCandidates) ? strategyCandidates : [])
    .filter((candidate) => candidate?.statement)
    .map((candidate) => strategyCandidateToNode(candidate, { projectId, nodeIds }));
  const nodes = mergeNearDuplicateNodes([...baseNodes, ...strategyNodes]);
  const edges = [
    ...(Array.isArray(existingGraph?.edges) ? existingGraph.edges : []),
    ...structuralSupportEdges(nodes, { projectId }),
  ];
  return {
    schemaVersion: 1,
    projectId,
    nodes,
    edges,
    revision: Number.isInteger(existingGraph?.revision) ? existingGraph.revision : 0,
    updatedAt: now(),
  };
}
