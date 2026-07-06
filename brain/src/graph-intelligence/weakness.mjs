import { hasSourcedEvidence, solidityRank, SOLIDITY_LADDER } from "../evidence.mjs";
import { sourceStandsOnData } from "../source-entry.mjs";
import { contractCompleteness } from "../path-portfolio.mjs";
import { normalizeWeakness, genObjectGraphId } from "../object-graph-store.mjs";
import { now } from "../store-fs.mjs";

export const WEAKNESS_KINDS = ["evidence", "specificity", "product", "measurement", "execution", "performance"];
export const PHASE1_WEAKNESS_KINDS = ["evidence", "product", "measurement", "execution"];

// These frozen SEVERITY numbers (the `severity: ... ? 80 : 50` calls below) and this kind ORDER are
// the hardcoded JUDGMENT the canvas renders. Detection itself (does a node have sourced evidence, is a
// contract complete) stays deterministic here.
export const PRIMARY_WEAKNESS_PRECEDENCE = [
  "performance",
  "execution",
  "measurement",
  "product",
  "specificity",
  "evidence",
];

function sourceRef({ kind = "founder", ref = "stored-node", preview = ref, at = now() } = {}) {
  return { kind, ref, preview, at };
}

function nodeReceipt(node, fallback = "stored object node") {
  if (Array.isArray(node?.sources) && node.sources.length) return node.sources;
  if (Array.isArray(node?.evidence) && node.evidence.length) {
    return node.evidence.map((item) => sourceRef({
      kind: item.source ? "evidence" : "founder",
      ref: item.source || node.id,
      preview: item.notes || item.claim || item.source || fallback,
      at: item.capturedAt || now(),
    }));
  }
  return [sourceRef({ kind: node?.origin || "founder", ref: node?.originRef || node?.id || "node", preview: fallback })];
}

function weakness({ node, kind, statement, detectedFrom, signal, threshold, severity = null, repair }) {
  return normalizeWeakness({
    id: genObjectGraphId("weak"),
    kind,
    statement,
    detectedFrom,
    detectedAt: now(),
    signal,
    threshold,
    severity,
    status: "open",
    repair,
  });
}

function isFounderOnlyEvidence(node) {
  const evidence = Array.isArray(node?.evidence) ? node.evidence : [];
  if (!evidence.length) return true;
  const sourced = evidence.filter((item) => item?.source);
  if (!sourced.length) return true;
  return sourced.every((item) => /founder/i.test(`${item.source} ${item.notes ?? ""}`));
}

function detectEvidence(node) {
  if (["runs", "pipeline", "customer", "measurement"].includes(node?.domain)) return { status: "unmeasured" };
  const evidence = Array.isArray(node?.evidence) ? node.evidence : [];
  const sources = Array.isArray(node?.sources) ? node.sources : [];
  if (!evidence.length && !sources.length) return { status: "unmeasured" };
  const effective = node?.solidity ?? null;
  if (effective && effective !== "speculative" && hasSourcedEvidence(evidence) && !isFounderOnlyEvidence(node)) {
    return { status: "clear" };
  }
  return {
    status: "fired",
    weakness: weakness({
      node,
      kind: "evidence",
      statement: "Only weak or founder-provided evidence supports this card.",
      detectedFrom: nodeReceipt(node, "evidence audit found no sourced support"),
      signal: {
        evidenceCount: evidence.length,
        sourcedEvidenceCount: evidence.filter((item) => item?.source).length,
        solidity: effective,
        founderOnly: isFounderOnlyEvidence(node),
      },
      threshold: "Fires when the node has no sourced evidence, speculative solidity, or only founder-origin support.",
      severity: effective === "speculative" || effective == null ? 80 : 50,
      repair: {
        verb: "find_evidence",
        statement: "Find external or observed evidence for this claim.",
        targetNodeId: node?.id ?? null,
        compilable: true,
      },
    }),
  };
}

function observedProductSupport(node, graph) {
  const nodesById = new Map((graph?.nodes ?? []).map((item) => [item.id, item]));
  return (graph?.edges ?? [])
    .filter((edge) => edge.target === node?.id && edge.type === "supports" && edge.status !== "challenged" && edge.status !== "removed")
    .map((edge) => nodesById.get(edge.source))
    .filter((source) => source?.domain === "product" && source.solidity === "observed");
}

function detectProduct(node, graph) {
  const restsOnProduct = Array.isArray(node?.payload?.restsOn)
    && node.payload.restsOn.some((ref) => String(ref?.type ?? ref?.kind ?? "").toLowerCase().includes("product"));
  const isStrategyClaim =
    node?.domain === "strategy" &&
    (node?.payload?.claimsProduct === true || restsOnProduct);
  const isWinGap = node?.domain === "product" && ["product_gap", "measurement_gap"].includes(node?.type);
  if (!isStrategyClaim && !isWinGap) return { status: "unmeasured" };
  const support = observedProductSupport(node, graph);
  if (isStrategyClaim && support.length) return { status: "clear" };
  return {
    status: "fired",
    weakness: weakness({
      node,
      kind: "product",
      statement: isWinGap ? "The scan found a product proof gap." : "This claim has no observed product proof yet.",
      detectedFrom: nodeReceipt(node, "product proof audit"),
      signal: { observedProductSupport: support.length, claimsProduct: Boolean(node?.payload?.claimsProduct), nodeType: node?.type },
      threshold: "Fires when a product-behavior claim has no supporting observed Product node, or when the scan produced a gap card.",
      severity: support.length ? 30 : 75,
      repair: {
        verb: isWinGap ? "patch_product" : "add_product_proof",
        statement: isWinGap ? "Patch the product gap or add proof that closes it." : "Add product proof before using this claim.",
        targetNodeId: node?.id ?? null,
        compilable: true,
      },
    }),
  };
}

function measurementTargets(node, graph) {
  const nodesById = new Map((graph?.nodes ?? []).map((item) => [item.id, item]));
  return (graph?.edges ?? [])
    .filter((edge) => edge.source === node?.id && edge.type === "measured_by" && edge.status !== "challenged" && edge.status !== "removed")
    .map((edge) => nodesById.get(edge.target))
    .filter(Boolean);
}

function contractFromNode(node) {
  if (node?.domain === "measurement" && node?.type === "contract") return node.payload ?? {};
  if (node?.payload?.measurement && typeof node.payload.measurement === "object") return node.payload.measurement;
  if (node?.payload?.measurementContract && typeof node.payload.measurementContract === "object") return node.payload.measurementContract;
  return null;
}

export function missingContractQuarters(contract) {
  const missing = [];
  if (!Array.isArray(contract?.outcomeKinds) || contract.outcomeKinds.length === 0) missing.push("outcomeKinds");
  if (!Array.isArray(contract?.sources) || contract.sources.length === 0) missing.push("sources");
  if (!String(contract?.joinKey ?? "").trim()) missing.push("joinKey");
  if (!String(contract?.successCriteria ?? "").trim()) missing.push("successCriteria");
  return missing;
}

function detectMeasurement(node, graph) {
  const shouldMeasure =
    (node?.domain === "runs" && ["path", "run", "success_criteria"].includes(node?.type)) ||
    (node?.domain === "strategy" && node?.payload?.requiresMeasurement === true) ||
    (node?.domain === "product" && node?.type === "measurement_gap");
  if (!shouldMeasure) return { status: "unmeasured" };
  if (node?.domain === "product" && node?.type === "measurement_gap") {
    return {
      status: "fired",
      weakness: weakness({
        node,
        kind: "measurement",
        statement: "The scan found a missing attribution link.",
        detectedFrom: nodeReceipt(node, "scan-derived measurement gap"),
        signal: { gapId: node?.payload?.gapId ?? node?.id, severity: node?.payload?.severity ?? null },
        threshold: "Scan-derived measurement_gap nodes always carry a Measurement weakness until repaired.",
        severity: node?.payload?.severity === "high" ? 90 : 70,
        repair: {
          verb: "patch_measurement",
          statement: node?.payload?.recommendation || "Patch the measurement contract or attribution key.",
          targetNodeId: node?.id ?? null,
          compilable: true,
        },
      }),
    };
  }
  const contracts = measurementTargets(node, graph).map(contractFromNode).filter(Boolean);
  if (!contracts.length) {
    return {
      status: "fired",
      weakness: weakness({
        node,
        kind: "measurement",
        statement: "This path has no measurement contract yet.",
        detectedFrom: nodeReceipt(node, "measurement audit found no measured_by edge"),
        signal: { contractCount: 0, missing: ["contract"] },
        threshold: "Fires when a path/run/strategy card has no measured_by edge to a Measurement contract.",
        severity: 85,
        repair: {
          verb: "patch_measurement",
          statement: "Bind an outcome, source, join key, and success criterion.",
          targetNodeId: node?.id ?? null,
          compilable: true,
        },
      }),
    };
  }
  const best = contracts.reduce((current, contract) =>
    contractCompleteness(contract) > contractCompleteness(current) ? contract : current,
  contracts[0]);
  const completeness = contractCompleteness(best);
  if (completeness >= 1) return { status: "clear" };
  const missing = missingContractQuarters(best);
  return {
    status: "fired",
    weakness: weakness({
      node,
      kind: "measurement",
      statement: `This measurement contract is missing ${missing.join(", ")}.`,
      detectedFrom: nodeReceipt(node, "measurement contract audit"),
      signal: { completeness, missing },
      threshold: "Fires when a bound Measurement contract is incomplete; joinKey missing is always repairable before the gate.",
      severity: Math.round((1 - completeness) * 100),
      repair: {
        verb: "patch_measurement",
        statement: `Add ${missing.join(", ")} to the measurement contract.`,
        targetNodeId: node?.id ?? null,
        compilable: true,
      },
    }),
  };
}

function listSourceStands(node) {
  const mode = node?.payload?.mode ?? node?.payload?.sourceMode;
  const config = {
    id: node?.id,
    category: "source",
    connector: node?.payload?.connector ?? (mode === "provided" ? "manual" : null),
    kind: mode === "discovered" ? "agent" : "tool",
    config: {
      items: node?.payload?.items,
      csv: node?.payload?.csv,
      endpoint: node?.payload?.endpoint,
      sourceChannelId: node?.payload?.sourceNodeId,
    },
  };
  return sourceStandsOnData(config);
}

function hasSourceableList(node, graph) {
  const nodesById = new Map((graph?.nodes ?? []).map((item) => [item.id, item]));
  const linkedLists = (graph?.edges ?? [])
    .filter((edge) => edge.status !== "removed" && edge.status !== "challenged")
    .filter((edge) => edge.type === "uses" || edge.type === "targets")
    .filter((edge) => edge.source === node?.id || edge.target === node?.id)
    .map((edge) => nodesById.get(edge.source === node?.id ? edge.target : edge.source))
    .filter((item) => item?.domain === "audience" && item?.type === "list");
  return linkedLists.some(listSourceStands);
}

function detectExecution(node, graph) {
  const needsList =
    (node?.domain === "audience" && node?.type === "list") ||
    (node?.domain === "strategy" && node?.payload?.requiresAudienceList === true) ||
    (node?.domain === "runs" && ["path", "run"].includes(node?.type) && node?.payload?.requiresAudienceList === true);
  if (!needsList) return { status: "unmeasured" };
  const stands = node?.domain === "audience" && node?.type === "list" ? listSourceStands(node) : hasSourceableList(node, graph);
  if (stands) return { status: "clear" };
  return {
    status: "fired",
    weakness: weakness({
      node,
      kind: "execution",
      statement: "No sourceable audience list exists for this path yet.",
      detectedFrom: nodeReceipt(node, "audience sourceability audit"),
      signal: { sourceableList: false, nodeType: node?.type },
      threshold: "Fires when the node needs reachable people/accounts and no list, connector, derived source, or discovered source stands on data.",
      severity: 70,
      repair: {
        verb: node?.domain === "audience" ? "source_list" : "alternate_channel",
        statement: node?.domain === "audience" ? "Source this list or switch it to a discovered source." : "Choose a channel with a sourceable list.",
        targetNodeId: node?.id ?? null,
        compilable: true,
      },
    }),
  };
}

export function computeNodeConfidence(node) {
  const evidence = Array.isArray(node?.evidence) ? node.evidence.filter((item) => item?.source) : [];
  if (!evidence.length) return null;
  const len = SOLIDITY_LADDER.length;
  const strengths = evidence.map((item) => Math.max(0, (len - solidityRank(item.solidity)) / len));
  const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
  return Math.round(mean * 100);
}

export function detectWeakness(node, graph = {}) {
  const outcomes = {
    evidence: detectEvidence(node),
    product: detectProduct(node, graph),
    measurement: detectMeasurement(node, graph),
    execution: detectExecution(node, graph),
    specificity: { status: "unmeasured" },
    performance: { status: "unmeasured" },
  };
  const weaknesses = PHASE1_WEAKNESS_KINDS
    .map((kind) => outcomes[kind])
    .filter((outcome) => outcome?.status === "fired" && outcome.weakness)
    .map((outcome) => outcome.weakness);
  const report = Object.fromEntries(WEAKNESS_KINDS.map((kind) => [kind, outcomes[kind]?.status ?? "unmeasured"]));
  return { weaknesses, report, confidence: computeNodeConfidence(node) };
}

export function weaknessReport(node, graph = {}) {
  return detectWeakness(node, graph).report;
}

export function primaryWeakness(weaknesses = []) {
  const open = weaknesses.filter((item) => item?.status === "open");
  return open.sort((a, b) => PRIMARY_WEAKNESS_PRECEDENCE.indexOf(a.kind) - PRIMARY_WEAKNESS_PRECEDENCE.indexOf(b.kind))[0] ?? null;
}

export function deriveWeaknessForGraph(input) {
  const graph = {
    ...(input && typeof input === "object" ? input : {}),
    nodes: Array.isArray(input?.nodes) ? input.nodes : [],
    edges: Array.isArray(input?.edges) ? input.edges : [],
  };
  const nodes = graph.nodes.map((node) => {
    const detected = detectWeakness(node, graph);
    return {
      ...node,
      confidence: detected.confidence,
      weaknesses: detected.weaknesses,
      weaknessReport: detected.report,
    };
  });
  return { ...graph, nodes };
}
