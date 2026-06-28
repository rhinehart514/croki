import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateAgentCreationPolicy } from "./agent-policy-store.mjs";

const SCHEMA_VERSION = 1;

function now() {
  return new Date().toISOString();
}

function root(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54);
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function fileFor(projectId, options = {}) {
  return path.join(root(options), "capability-foundry", `${safeId(projectId)}.json`);
}

// Where a born agent's on-disk definition lives. It sits under the SAME foundry root the
// .json store uses (root()) — not a new home — so the definition travels with its store.
// agent-bridge's loader tries this path first, then falls back to ~/.claude/agents/<ref>.md.
function artifactFileFor(ref, options = {}) {
  return path.join(root(options), "capability-foundry", "agents", `${safeId(ref)}.md`);
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

// Atomically write raw text (the agent-definition markdown). Same temp+rename as write(), but
// without the JSON encoding — the file on disk is the literal markdown the bridge reads.
function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, String(text));
  fs.renameSync(tmp, file);
}

function emptyStore(projectId) {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    blueprints: [],
    profiles: [],
    instances: [],
    evaluations: [],
  };
}

export function loadCapabilityFoundry(projectId = "default", options = {}) {
  const file = fileFor(projectId, options);
  if (!fs.existsSync(file)) return emptyStore(projectId);
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  if (stored?.schemaVersion === SCHEMA_VERSION && Array.isArray(stored.instances)) return stored;
  return {
    ...emptyStore(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    blueprints: arr(stored?.blueprints),
    profiles: arr(stored?.profiles),
    instances: arr(stored?.instances),
    evaluations: arr(stored?.evaluations),
  };
}

export function saveCapabilityFoundry(store, options = {}) {
  const durable = {
    ...emptyStore(store.projectId),
    ...store,
    schemaVersion: SCHEMA_VERSION,
  };
  write(fileFor(durable.projectId, options), durable);
  return durable;
}

export function assemblePersonalizationProfile({ project, program, policy, priorRunState = [] } = {}) {
  const repository = project?.sharedContext?.repository ?? {};
  const gaps = Array.isArray(repository.evidence) && repository.evidence.length
    ? []
    : ["No product evidence has been attached to this project yet."];
  return {
    id: `profile-${slug(program?.id || policy?.id || "agent")}-${crypto.randomBytes(3).toString("hex")}`,
    projectId: project?.id ?? "default",
    programId: program?.id ?? null,
    creationPolicyId: policy?.id ?? null,
    productTruth: repository.evidence ?? [],
    buyerHypothesis: program?.buyerHypothesis ?? {},
    channelHypothesis: program?.channelHypothesis ?? {},
    founderTaste: project?.sharedContext?.founderTaste ?? {},
    marketMemory: {
      outcomes: project?.sharedContext?.outcomes ?? [],
      productFeedback: project?.sharedContext?.productFeedback ?? [],
      experiments: project?.sharedContext?.experiments ?? [],
    },
    priorRunState,
    knownBlindSpots: [
      ...gaps,
      ...(program?.measurementPlan?.blindSpots ?? []),
    ],
    assembledAt: now(),
  };
}

// An agent's identity is its REF within a project — not the program that first reached for it.
// One engine, many channels: when two channels both want "prospect-researcher", they get the SAME
// instance, so personalization and learning land once and the canvas can draw it once with fan-out
// edges instead of a copy per lane. The store file is already per-project, so the ref alone is the
// stable lineage key.
function instanceId(ref) {
  return `agent-instance-${slug(ref)}`;
}

function latestInstance(instances) {
  return [...instances].sort((a, b) =>
    (b.version ?? 1) - (a.version ?? 1)
    || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  )[0];
}

export function listAgentInstances(projectId = "default", options = {}) {
  return loadCapabilityFoundry(projectId, options).instances;
}

export function getAgentInstance(projectId = "default", instanceId, options = {}) {
  const instance = loadCapabilityFoundry(projectId, options).instances.find((item) => item.id === instanceId);
  if (!instance) throw new Error(`Agent instance not found: ${instanceId}`);
  return instance;
}

export function createPersonalizedAgent({ project, program, policy, agentOpportunity, priorRunState = [] } = {}, options = {}) {
  const validation = validateAgentCreationPolicy(policy);
  if (!validation.ok) throw new Error(`Cannot create personalized agent: ${validation.errors.join(" ")}`);
  const projectId = project?.id || options.projectId || "default";
  const job = String(agentOpportunity?.objective || agentOpportunity?.title || "").trim();
  if (!job) throw new Error("No agent without a specific job.");
  const ref = String(agentOpportunity.ref || slug(agentOpportunity.title)).trim();
  if (!ref) throw new Error("No agent without a ref.");
  const store = loadCapabilityFoundry(projectId, options);
  const baseInstanceId = instanceId(ref);
  // Shared by reference: match on ref across the whole project, not on the program that asked.
  // A channel reaching for an agent another channel already minted reuses it (same policy → same
  // instance); a genuinely different creation policy versions the shared lineage forward.
  const matching = store.instances.filter((item) => item.ref === ref);
  const existingForPolicy = matching.find((item) => item.creationPolicyId === policy.id);
  if (existingForPolicy) {
    const profile = store.profiles.find((item) => item.id === existingForPolicy.personalizationProfileId)
      ?? assemblePersonalizationProfile({ project, program, policy, priorRunState });
    return { instance: existingForPolicy, profile };
  }
  const version = matching.length ? (latestInstance(matching).version ?? matching.length) + 1 : 1;
  const id = `${baseInstanceId}-v${version}`;
  const profile = assemblePersonalizationProfile({ project, program, policy, priorRunState });
  const previous = matching.length ? latestInstance(matching) : null;
  const createdAt = now();
  const artifactPath = artifactFileFor(ref, options);
  const instance = {
    id,
    lineageId: baseInstanceId,
    previousInstanceId: previous?.id ?? null,
    projectId,
    ref,
    blueprintId: agentOpportunity.blueprintId || `blueprint-${slug(agentOpportunity.title || ref)}`,
    programId: program.id,
    channelId: agentOpportunity.channelId ?? null,
    sourceOpportunityId: agentOpportunity.id ?? null,
    job,
    inputContract: policy.requiredInputs,
    outputContract: policy.requiredOutputs,
    personalizationProfileId: profile.id,
    creationPolicyId: policy.id,
    artifactPath,
    evaluationSignals: policy.evaluationSignals,
    version,
    status: "active",
    createdAt,
    updatedAt: now(),
  };
  saveCapabilityFoundry({
    ...store,
    profiles: [...store.profiles, profile].slice(-500),
    instances: [...store.instances, instance],
  }, options);
  // Persist the agent's definition where artifactPath points, so the model the bridge invokes
  // can actually read it. Idempotent (one ref → one stable file) and best-effort: a write failure
  // never blocks agent creation — the bridge falls back to the ref-only label when no file loads.
  try {
    const markdown = agentInstanceMarkdown({ instance, policy, profile, agentOpportunity });
    writeText(artifactPath, markdown);
  } catch {
    // best effort — the definition is a convenience for the bridge, not a correctness invariant
  }
  return { instance, profile };
}

export function createNextAgentVersion({ project, program, previousInstance, policy, priorRunState = [] } = {}, options = {}) {
  if (!previousInstance) throw new Error("Previous agent instance is required.");
  const agentOpportunity = {
    id: previousInstance.sourceOpportunityId,
    title: previousInstance.job,
    objective: previousInstance.job,
    ref: previousInstance.ref,
    blueprintId: previousInstance.blueprintId,
    channelId: previousInstance.channelId,
  };
  return createPersonalizedAgent({ project, program, policy, agentOpportunity, priorRunState }, options);
}

export function recordAgentEvaluation(evaluation = {}, options = {}) {
  const projectId = evaluation.projectId || options.projectId || "default";
  if (!evaluation.agentInstanceId) throw new Error("Agent evaluation requires an agent instance.");
  const store = loadCapabilityFoundry(projectId, options);
  const durable = {
    id: evaluation.id || `eval-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    projectId,
    programId: evaluation.programId ?? null,
    runId: evaluation.runId ?? null,
    nodeId: evaluation.nodeId ?? null,
    agentInstanceId: evaluation.agentInstanceId,
    creationPolicyId: evaluation.creationPolicyId ?? null,
    status: evaluation.status || "observed",
    outputContractSatisfied: Boolean(evaluation.outputContractSatisfied),
    evidenceUsed: Boolean(evaluation.evidenceUsed),
    uncertaintyPreserved: Boolean(evaluation.uncertaintyPreserved),
    founderSignals: Array.isArray(evaluation.founderSignals) ? evaluation.founderSignals : [],
    runFailure: evaluation.runFailure ?? null,
    recommendations: Array.isArray(evaluation.recommendations) ? evaluation.recommendations : [],
    createdAt: now(),
  };
  saveCapabilityFoundry({
    ...store,
    evaluations: [...store.evaluations, durable].slice(-1000),
  }, options);
  return durable;
}

export function evaluateAgentInstancesFromRun({ projectId = "default", graph, result, signals = [] } = {}, options = {}) {
  const evaluations = [];
  for (const node of graph?.nodes ?? []) {
    if (node.kind !== "agent" || !node.config?.agentInstanceId) continue;
    const nodeResult = result?.nodes?.[node.id] ?? {};
    const items = Array.isArray(nodeResult.items) ? nodeResult.items : [];
    const founderSignals = signals.filter((signal) =>
      (signal.policyIds ?? []).includes(node.config.creationPolicyId)
    ).map((signal) => signal.id);
    const evidenceUsed = items.some((item) => Array.isArray(item.evidence) && item.evidence.length)
      || items.some((item) => item.evidence || item.citations || item.source);
    const uncertaintyPreserved = items.some((item) => item.uncertainty || item.confidence || item.assumptions);
    const outputContractSatisfied = Boolean(nodeResult.ok) && nodeResult.contractAudit?.state !== "blocked";
    const recommendations = [];
    if (!outputContractSatisfied) recommendations.push("Tighten the output contract or agent prompt.");
    if (!evidenceUsed) recommendations.push("Require explicit evidence in the agent output.");
    if (!uncertaintyPreserved) recommendations.push("Require uncertainty or assumptions in the agent output.");
    if (founderSignals.length) recommendations.push("Revise the creation policy from founder gate feedback.");
    evaluations.push(recordAgentEvaluation({
      projectId,
      programId: node.config.programId ?? graph?.outcomeProgramId ?? null,
      runId: result?.runId ?? null,
      nodeId: node.id,
      agentInstanceId: node.config.agentInstanceId,
      creationPolicyId: node.config.creationPolicyId ?? null,
      status: nodeResult.ok ? "evaluated" : "failed",
      outputContractSatisfied,
      evidenceUsed,
      uncertaintyPreserved,
      founderSignals,
      runFailure: nodeResult.ok ? null : nodeResult.error ?? "Agent node did not complete.",
      recommendations,
    }, { ...options, projectId }));
  }
  return evaluations;
}

function lines(title, values) {
  const list = arr(values).filter(Boolean);
  if (!list.length) return `## ${title}\n\nNone recorded yet.\n`;
  return `## ${title}\n\n${list.map((item) => `- ${String(item)}`).join("\n")}\n`;
}

export function agentInstanceMarkdown({ instance, policy, profile, agentOpportunity } = {}) {
  return `---
name: ${instance.ref}
description: ${instance.job}
tools: Read, Glob, Grep, WebSearch, WebFetch
model: ${agentOpportunity?.model || (agentOpportunity?.provider === "codex" ? "gpt-5" : "sonnet")}
provider: ${agentOpportunity?.provider || "claude"}
programId: ${instance.programId}
agentInstanceId: ${instance.id}
creationPolicyId: ${instance.creationPolicyId}
---

# ${agentOpportunity?.title || instance.ref}

${agentOpportunity?.prompt || instance.job}

## Job

${instance.job}

${lines("Input Contract", instance.inputContract)}
${lines("Output Contract", instance.outputContract)}
${lines("Evidence Requirements", policy.evidenceRequirements)}
${lines("Positive Rules", policy.positiveRules)}
${lines("Negative Rules", policy.negativeRules)}
${lines("Safety Rules", policy.safetyRules)}
${lines("Evaluation Signals", instance.evaluationSignals)}
## Personalization Profile

- Program: ${profile.programId}
- Profile: ${profile.id}
- Product evidence count: ${profile.productTruth.length}
- Known blind spots: ${profile.knownBlindSpots.length}

Return only a JSON array of result objects. Preserve evidence, dates, and uncertainty.
`;
}
