import crypto from "node:crypto";
import { persistence } from "./persistence.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "agent-policies";

function now() {
  return new Date().toISOString();
}

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54);
}

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function emptyStore(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, policies: [] };
}

export function loadAgentPolicyStore(projectId = "default", options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(projectId));
  if (!stored) return emptyStore(projectId);
  if (stored?.schemaVersion === SCHEMA_VERSION && Array.isArray(stored.policies)) return stored;
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    policies: Array.isArray(stored?.policies) ? stored.policies : [],
  };
}

export function saveAgentPolicyStore(store, options = {}) {
  const durable = {
    ...store,
    schemaVersion: SCHEMA_VERSION,
    policies: Array.isArray(store.policies) ? store.policies : [],
  };
  persistence(options).set(COLLECTION, safeId(durable.projectId), durable);
  return durable;
}

export function listAgentCreationPolicies(projectId = "default", options = {}) {
  return loadAgentPolicyStore(projectId, options).policies;
}

export function validateAgentCreationPolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== "object") errors.push("Policy must be an object.");
  if (!String(policy?.purpose || "").trim()) errors.push("Policy purpose is required.");
  if (!arr(policy?.requiredInputs).length) errors.push("Policy requires at least one input contract.");
  if (!arr(policy?.requiredOutputs).length) errors.push("Policy requires at least one output contract.");
  if (!arr(policy?.evidenceRequirements).length) errors.push("Policy requires evidence requirements.");
  if (!arr(policy?.defaultEvaluationSignals ?? policy?.evaluationSignals).length) errors.push("Policy requires evaluation signals.");
  return { ok: errors.length === 0, errors };
}

export function createAgentCreationPolicy(input = {}, options = {}) {
  const projectId = input.projectId || options.projectId || "default";
  const store = loadAgentPolicyStore(projectId, options);
  const existingIds = new Set(store.policies.map((policy) => policy.id));
  const base = slug(input.id || input.purpose || input.sourceOpportunityId);
  let id = `policy-${base || crypto.randomBytes(4).toString("hex")}`;
  let i = 2;
  while (existingIds.has(id)) id = `policy-${base}-${i++}`;
  const createdAt = now();
  const policy = {
    id,
    lineageId: input.lineageId ?? id,
    previousPolicyId: input.previousPolicyId ?? null,
    projectId,
    programId: input.programId ?? null,
    sourceOpportunityId: input.sourceOpportunityId ?? null,
    scope: input.scope || "program",
    purpose: String(input.purpose || "").trim(),
    positiveRules: arr(input.positiveRules),
    negativeRules: arr(input.negativeRules),
    evidenceRequirements: arr(input.evidenceRequirements),
    safetyRules: arr(input.safetyRules),
    requiredInputs: arr(input.requiredInputs),
    requiredOutputs: arr(input.requiredOutputs),
    evaluationSignals: arr(input.evaluationSignals ?? input.defaultEvaluationSignals),
    tasteVersion: input.tasteVersion ?? 0,
    marketMemoryVersion: input.marketMemoryVersion ?? 0,
    productEvidenceVersion: input.productEvidenceVersion ?? 0,
    feedbackSignalIds: [],
    version: 1,
    revisionReason: input.revisionReason ?? null,
    createdAt,
    updatedAt: createdAt,
  };
  const validation = validateAgentCreationPolicy(policy);
  if (!validation.ok) throw new Error(`Invalid agent creation policy: ${validation.errors.join(" ")}`);
  saveAgentPolicyStore({ ...store, policies: [...store.policies, policy] }, options);
  return policy;
}

function tasteRules(founderTaste = {}) {
  return {
    positive: [
      ...arr(founderTaste.policies),
      ...arr(founderTaste.approvedPatterns).map((rule) => `Prefer founder-approved pattern: ${rule}`),
    ],
    negative: arr(founderTaste.rejectedPatterns).map((rule) => `Avoid founder-rejected pattern: ${rule}`),
  };
}

export function ensureAgentCreationPolicy({ project, program, agentOpportunity }, options = {}) {
  const projectId = project?.id || options.projectId || "default";
  const store = loadAgentPolicyStore(projectId, options);
  const existing = store.policies.find((policy) =>
    policy.programId === program.id && policy.sourceOpportunityId === agentOpportunity.id
  );
  if (existing) return latestPolicy(store.policies.filter((policy) =>
    policy.programId === program.id && policy.sourceOpportunityId === agentOpportunity.id
  ));
  const taste = tasteRules(project?.sharedContext?.founderTaste ?? {});
  const evidenceRequirements = agentOpportunity.evidence?.length
    ? agentOpportunity.evidence.map((item) => `Use cited product evidence: ${item.file}:${item.line}`)
    : ["Separate product facts from hypotheses; do not claim code proof without a citation."];
  return createAgentCreationPolicy({
    projectId,
    programId: program.id,
    sourceOpportunityId: agentOpportunity.id,
    purpose: agentOpportunity.objective || agentOpportunity.title,
    positiveRules: taste.positive,
    negativeRules: [
      ...taste.negative,
      "Do not use generic compliments, vague personalization, or unsupported outcome claims.",
    ],
    evidenceRequirements,
    safetyRules: [
      "External effects must pass through a founder gate.",
      "Preserve uncertainty and cite the product evidence used.",
    ],
    requiredInputs: ["programContext", "productTruth", "upstreamItems"],
    requiredOutputs: ["structuredResults", "evidence", "uncertainty"],
    evaluationSignals: ["founderDecision", "founderEdit", "runFailure", "observedOutcome"],
    tasteVersion: project?.sharedContext?.version ?? 0,
    marketMemoryVersion: project?.sharedContext?.version ?? 0,
    productEvidenceVersion: project?.sharedContext?.version ?? 0,
  }, options);
}

function uniqueAppend(existing, additions) {
  const seen = new Set(arr(existing));
  const next = [...arr(existing)];
  for (const item of arr(additions)) {
    if (seen.has(item)) continue;
    seen.add(item);
    next.push(item);
  }
  return next.slice(-50);
}

export function reviseAgentPolicyFromFeedback(policyId, signals = [], options = {}) {
  const projectId = options.projectId || signals.find((signal) => signal.projectId)?.projectId || "default";
  const store = loadAgentPolicyStore(projectId, options);
  const policy = store.policies.find((item) => item.id === policyId);
  if (!policy) throw new Error(`Agent creation policy not found: ${policyId}`);
  const revision = structuredPolicyRevision(policy, signals);
  if (!revision.changed) return policy;
  const version = (policy.version ?? 1) + 1;
  const base = `${policy.lineageId || policy.id}-v${version}`;
  const existingIds = new Set(store.policies.map((item) => item.id));
  let id = base;
  let i = 2;
  while (existingIds.has(id)) id = `${base}-${i++}`;
  const next = {
    ...policy,
    id,
    lineageId: policy.lineageId || policy.id,
    previousPolicyId: policy.id,
    positiveRules: revision.positiveRules,
    negativeRules: revision.negativeRules,
    evidenceRequirements: revision.evidenceRequirements,
    safetyRules: revision.safetyRules,
    evaluationSignals: revision.evaluationSignals,
    feedbackSignalIds: uniqueAppend(policy.feedbackSignalIds, signals.map((signal) => signal.id)),
    version,
    revisionReason: revision.reason,
    createdAt: now(),
    updatedAt: now(),
  };
  saveAgentPolicyStore({ ...store, policies: [...store.policies, next] }, options);
  return next;
}

function structuredPolicyRevision(policy, signals = []) {
  let positiveRules = arr(policy.positiveRules);
  let negativeRules = arr(policy.negativeRules);
  let evidenceRequirements = arr(policy.evidenceRequirements);
  let safetyRules = arr(policy.safetyRules);
  let evaluationSignals = arr(policy.evaluationSignals);
  const reasons = [];
  for (const signal of signals) {
    if (signal.type === "FounderRejection" && signal.summary) {
      negativeRules = uniqueAppend(negativeRules, [`Avoid output the founder rejected: ${signal.summary}`]);
      evaluationSignals = uniqueAppend(evaluationSignals, ["founderRejection"]);
      reasons.push("founder rejection");
    }
    if (signal.type === "FounderEdit" && signal.summary) {
      positiveRules = uniqueAppend(positiveRules, [`Prefer founder edit direction: ${signal.summary}`]);
      evaluationSignals = uniqueAppend(evaluationSignals, ["founderEdit"]);
      reasons.push("founder edit");
    }
    if (signal.type === "RunFailure" && signal.summary) {
      safetyRules = uniqueAppend(safetyRules, [`Prevent repeat run failure: ${signal.summary}`]);
      evaluationSignals = uniqueAppend(evaluationSignals, ["runFailure"]);
      reasons.push("run failure");
    }
    if (signal.type === "MeasurementBlindSpot" && signal.summary) {
      evidenceRequirements = uniqueAppend(evidenceRequirements, [`Repair measurement blind spot: ${signal.summary}`]);
      evaluationSignals = uniqueAppend(evaluationSignals, ["measurementBlindSpot"]);
      reasons.push("measurement blind spot");
    }
    if (signal.type === "ObservedOutcome" && signal.summary) {
      positiveRules = uniqueAppend(positiveRules, [`Preserve behavior linked to observed outcome: ${signal.summary}`]);
      evaluationSignals = uniqueAppend(evaluationSignals, ["observedOutcome"]);
      reasons.push("observed outcome");
    }
  }
  const changed = stable(policy.positiveRules) !== stable(positiveRules)
    || stable(policy.negativeRules) !== stable(negativeRules)
    || stable(policy.evidenceRequirements) !== stable(evidenceRequirements)
    || stable(policy.safetyRules) !== stable(safetyRules)
    || stable(policy.evaluationSignals) !== stable(evaluationSignals);
  return {
    changed,
    positiveRules,
    negativeRules,
    evidenceRequirements,
    safetyRules,
    evaluationSignals,
    reason: [...new Set(reasons)].join(", ") || "feedback",
  };
}

function latestPolicy(policies) {
  return [...policies].sort((a, b) =>
    (b.version ?? 1) - (a.version ?? 1)
    || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  )[0];
}

function stable(value) {
  return JSON.stringify(value ?? null);
}
