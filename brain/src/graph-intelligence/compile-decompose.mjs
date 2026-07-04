function isBindableMeasurement(contract) {
  if (!contract || typeof contract !== "object") return false;
  return Boolean(
    (Array.isArray(contract.outcomeKinds) && contract.outcomeKinds.length) ||
    (Array.isArray(contract.sources) && contract.sources.length) ||
    String(contract.joinKey ?? "").trim() ||
    String(contract.successCriteria ?? "").trim(),
  );
}

function missingMeasurement(contract) {
  if (!contract || typeof contract !== "object") return ["contract"];
  const missing = [];
  if (!Array.isArray(contract.outcomeKinds) || !contract.outcomeKinds.length) missing.push("outcomeKinds");
  if (!Array.isArray(contract.sources) || !contract.sources.length) missing.push("sources");
  if (!String(contract.joinKey ?? "").trim()) missing.push("joinKey");
  if (!String(contract.successCriteria ?? "").trim()) missing.push("successCriteria");
  return missing;
}

function compactNode(node) {
  return {
    id: node.id,
    domain: node.domain,
    type: node.type,
    statement: node.statement,
    solidity: node.solidity ?? null,
    weaknesses: (node.weaknesses ?? []).filter((item) => item.status === "open").map((item) => ({ kind: item.kind, statement: item.statement })),
  };
}

export function buildCompileDecompositionGrounding({ graph, pathNodeIds = [], contract = null, grounding = null } = {}) {
  const nodeById = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const pathNodes = pathNodeIds.map((id) => nodeById.get(id)).filter(Boolean);
  return {
    path: pathNodes.map(compactNode),
    productTruths: grounding?.productTruths ?? [],
    marketObjects: grounding?.marketObjects ?? [],
    measurement: contract ?? null,
    measurementBindable: isBindableMeasurement(contract),
    measurementWeakness: isBindableMeasurement(contract) ? null : { missing: missingMeasurement(contract) },
  };
}

export function normalizeRunPlan(input = {}, { pathId = null, contract = null } = {}) {
  const plan = input && typeof input === "object" ? input : {};
  const measurement = plan.measurement && typeof plan.measurement === "object" ? plan.measurement : contract;
  return {
    pathId: plan.pathId || pathId,
    audience: plan.audience && typeof plan.audience === "object" ? plan.audience : null,
    assets: Array.isArray(plan.assets) ? plan.assets.filter((item) => item && typeof item === "object") : [],
    tasks: Array.isArray(plan.tasks) ? plan.tasks.filter((item) => item && typeof item === "object") : [],
    patch: plan.patch && typeof plan.patch === "object" ? plan.patch : null,
    measurement: measurement ?? null,
    gates: Array.isArray(plan.gates) ? plan.gates.filter((item) => item && typeof item === "object") : [],
    execution: Array.isArray(plan.execution) ? plan.execution.filter((item) => item && typeof item === "object") : [],
  };
}

export async function decomposeRunPlan({ graph, pathNodeIds = [], contract = null, grounding = null, decompose = null, pathId = null } = {}) {
  if (typeof decompose !== "function") {
    return normalizeRunPlan({}, { pathId, contract });
  }
  const raw = await decompose(buildCompileDecompositionGrounding({ graph, pathNodeIds, contract, grounding }));
  return normalizeRunPlan(raw?.runPlan ?? raw, { pathId, contract });
}
