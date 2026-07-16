// configuration.mjs — one readable, versioned description of how this venture's firm operates.
//
// This is configuration, not orchestration. It names the participants and the conditions under
// which they work; it does not turn personalities into boxes in a flowchart or grant a model new
// authority. Existing crew seeds the first document so old ventures continue unchanged. Once the
// document exists, founder-applied versions are the source of truth and each change leaves a
// reversible receipt beside it in the venture's local directory.

import crypto from "node:crypto";
import { getVentureDoc, now, setVentureDoc, venturePersistence } from "./venture-store.mjs";
import { teammateSoulStore } from "../teammate-soul-store.mjs";

const CONFIGURATION_KEY = "firm";
const SCHEMA_VERSION = 1;
const RUNTIME_IDS = new Set(["claude-code", "codex", "anthropic"]);
const PRESENTATIONS = new Set([
  "teammate",
  "employee",
  "agent",
  "direct-model",
  "specialist",
  "team",
  "automation",
  "custom",
]);
const ACTIVATIONS = new Set(["direct", "relevant", "direct-or-relevant", "watch"]);
const OUTWARD_AUTHORITY = new Set(["blocked", "wall"]);

function text(value, fallback = null) {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(entry)).filter(Boolean))];
}

function field(object, key, fallback) {
  return object && Object.prototype.hasOwnProperty.call(object, key) ? object[key] : fallback;
}

function nullableRuntime(value) {
  const runtime = text(value);
  if (runtime && !RUNTIME_IDS.has(runtime)) throw new Error(`Unknown configured runtime: ${runtime}`);
  return runtime;
}

function finiteNumber(value, { fallback = null, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`Invalid numeric firm configuration value: ${value}.`);
  }
  return number;
}

function wholeNumber(value, { fallback, min, max }) {
  const number = finiteNumber(value, { fallback, min, max });
  if (!Number.isInteger(number)) throw new Error(`Invalid whole-number firm configuration value: ${value}.`);
  return number;
}

function defaultConfiguration(createdAt = now()) {
  return {
    id: CONFIGURATION_KEY,
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    presentation: {
      participant: "teammate",
      participantLabel: "teammate",
      collectiveLabel: "crew",
    },
    defaults: {
      runtime: null,
      model: null,
      maxSteps: 24,
    },
    organization: {
      shape: "flat",
      instructions: null,
      relationships: [],
    },
    coordination: {
      mode: "adaptive",
      coordinatorRef: null,
      maxPasses: 4,
      protocols: ["direct", "consult", "relay", "panel", "debate", "red-team", "synthesis", "watch"],
      stopWhen: [
        "another pass is unlikely to change the decision",
        "remaining uncertainty is founder judgment or taste",
      ],
    },
    authority: {
      outwardEffects: "wall",
      configurationChanges: "founder",
    },
    agents: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function normalizeAgent(input = {}, fallback = {}) {
  const ref = text(input.ref, fallback.ref);
  if (!ref) throw new Error("Every configured participant needs a ref.");
  const runtime = nullableRuntime(field(input.runtime, "provider", fallback.runtime?.provider));
  const activation = text(input.activation, fallback.activation ?? "direct-or-relevant");
  if (!ACTIVATIONS.has(activation)) throw new Error(`Unknown activation mode: ${activation}`);
  const outwardEffects = text(input.authority?.outwardEffects, fallback.authority?.outwardEffects ?? "wall");
  if (!OUTWARD_AUTHORITY.has(outwardEffects)) {
    throw new Error("Configured participants may block outward effects or send them to the wall; they cannot bypass it.");
  }
  return {
    ref,
    name: text(input.name, fallback.name ?? ref),
    label: text(input.label, fallback.label),
    perspective: text(input.perspective, fallback.perspective),
    temperament: stringList(input.temperament ?? fallback.temperament),
    contributes: stringList(input.contributes ?? fallback.contributes),
    boundaries: stringList(input.boundaries ?? fallback.boundaries),
    activation,
    capabilities: {
      firmTools: input.capabilities?.firmTools !== false,
      additional: stringList(input.capabilities?.additional ?? fallback.capabilities?.additional),
    },
    context: {
      scope: text(input.context?.scope, fallback.context?.scope ?? "venture"),
      instructions: text(input.context?.instructions, fallback.context?.instructions),
    },
    memory: {
      scope: text(input.memory?.scope, fallback.memory?.scope ?? "venture-soul"),
      instructions: text(input.memory?.instructions, fallback.memory?.instructions),
    },
    runtime: {
      provider: runtime,
      model: text(field(input.runtime, "model", fallback.runtime?.model)),
    },
    budget: {
      maxSteps: finiteNumber(input.budget?.maxSteps ?? fallback.budget?.maxSteps, { min: 1, max: 500 }),
      dailySpendUsd: finiteNumber(input.budget?.dailySpendUsd ?? fallback.budget?.dailySpendUsd, { min: 0 }),
    },
    authority: { outwardEffects },
    evaluation: {
      signals: stringList(input.evaluation?.signals ?? fallback.evaluation?.signals),
      instructions: text(input.evaluation?.instructions, fallback.evaluation?.instructions),
    },
  };
}

function normalizeConfiguration(input = {}, current = defaultConfiguration()) {
  const participant = text(input.presentation?.participant, current.presentation.participant);
  if (!PRESENTATIONS.has(participant)) throw new Error(`Unknown participant presentation: ${participant}`);
  const outwardEffects = text(input.authority?.outwardEffects, current.authority.outwardEffects);
  if (!OUTWARD_AUTHORITY.has(outwardEffects)) {
    throw new Error("The firm may block outward effects or send them to the wall; configuration cannot bypass it.");
  }
  const runtime = nullableRuntime(field(input.defaults, "runtime", current.defaults.runtime));
  const agentsInput = input.agents ?? current.agents;
  if (!Array.isArray(agentsInput)) throw new Error("Firm configuration agents must be an array.");
  const agents = agentsInput.map((agent) => normalizeAgent(agent));
  if (new Set(agents.map((agent) => agent.ref)).size !== agents.length) {
    throw new Error("Configured participant refs must be unique.");
  }
  const coordinatorRef = text(field(input.coordination, "coordinatorRef", current.coordination.coordinatorRef));
  if (coordinatorRef && !agents.some((agent) => agent.ref === coordinatorRef)) {
    throw new Error(`Configured coordinator "${coordinatorRef}" is not a participant in this firm.`);
  }
  const agentRefs = new Set(agents.map((agent) => agent.ref));
  const relationshipsInput = input.organization?.relationships ?? current.organization?.relationships ?? [];
  if (!Array.isArray(relationshipsInput)) throw new Error("Firm organization relationships must be an array.");
  const relationships = relationshipsInput.map((relationship) => {
    const from = text(relationship?.from);
    const to = text(relationship?.to);
    const kind = text(relationship?.kind);
    if (!from || !to || !kind) throw new Error("Each organization relationship needs from, to, and kind.");
    if (!agentRefs.has(from) || !agentRefs.has(to)) {
      throw new Error(`Organization relationship ${from} → ${to} must connect configured participants.`);
    }
    return { from, to, kind, label: text(relationship?.label) };
  });
  return {
    id: CONFIGURATION_KEY,
    schemaVersion: SCHEMA_VERSION,
    revision: current.revision,
    presentation: {
      participant,
      participantLabel: text(input.presentation?.participantLabel, current.presentation.participantLabel),
      collectiveLabel: text(input.presentation?.collectiveLabel, current.presentation.collectiveLabel),
    },
    defaults: {
      runtime,
      model: text(field(input.defaults, "model", current.defaults.model)),
      maxSteps: finiteNumber(input.defaults?.maxSteps ?? current.defaults.maxSteps, { fallback: 24, min: 1, max: 500 }),
    },
    organization: {
      shape: text(input.organization?.shape, current.organization?.shape ?? "flat"),
      instructions: text(field(input.organization, "instructions", current.organization?.instructions)),
      relationships,
    },
    coordination: {
      mode: text(input.coordination?.mode, current.coordination.mode),
      coordinatorRef,
      maxPasses: wholeNumber(input.coordination?.maxPasses ?? current.coordination.maxPasses, {
        fallback: 4,
        min: 1,
        max: 32,
      }),
      protocols: stringList(input.coordination?.protocols ?? current.coordination.protocols),
      stopWhen: stringList(input.coordination?.stopWhen ?? current.coordination.stopWhen),
    },
    authority: {
      outwardEffects,
      configurationChanges: "founder",
    },
    agents,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
  };
}

function seededAgent(ventureId, entry, options) {
  const soul = teammateSoulStore.get(ventureId, entry.ref, options);
  return normalizeAgent({ ref: entry.ref, name: soul?.name ?? entry.ref });
}

function initialConfiguration(ventureId, options) {
  const createdAt = now();
  const initial = defaultConfiguration(createdAt);
  const roster = getVentureDoc(ventureId, "crew", "roster", options)?.teammates ?? [];
  return { ...initial, agents: roster.map((entry) => seededAgent(ventureId, entry, options)), revision: 1 };
}

export function getFirmConfiguration(ventureId, options = {}) {
  const existing = getVentureDoc(ventureId, "configuration", CONFIGURATION_KEY, options);
  if (existing) return normalizeConfiguration(existing, existing);
  const initial = initialConfiguration(ventureId, options);
  try {
    return venturePersistence(options, ventureId).compareAndSet("configuration", CONFIGURATION_KEY, 0, initial);
  } catch (error) {
    if (error?.code !== "PERSISTENCE_CONFLICT") throw error;
    const winner = getVentureDoc(ventureId, "configuration", CONFIGURATION_KEY, options);
    if (!winner) throw error;
    return normalizeConfiguration(winner, winner);
  }
}

export function ensureInitialFirmParticipant(ventureId, ref, options = {}) {
  const current = getFirmConfiguration(ventureId, options);
  const existing = configuredAgent(current, ref);
  if (existing) return current;
  if (current.revision !== 1 || current.agents.length !== 0) return current;
  const soul = teammateSoulStore.get(ventureId, ref, options);
  return applyFirmConfiguration({
    ventureId,
    expectedRevision: current.revision,
    configuration: {
      ...current,
      agents: [normalizeAgent({ ref, name: soul?.name ?? ref })],
    },
    summary: `Formed the first participant, ${soul?.name ?? ref}`,
    source: "compatibility-seed",
  }, options).configuration;
}

function syncRoster(ventureId, configuration, options) {
  const current = getVentureDoc(ventureId, "crew", "roster", options)?.teammates ?? [];
  const summonedAtByRef = new Map(current.map((entry) => [entry.ref, entry.summonedAt]));
  for (const agent of configuration.agents) {
    teammateSoulStore.ensure(ventureId, agent.ref, { name: agent.name }, options);
  }
  const teammates = configuration.agents.map((agent) => ({
    ref: agent.ref,
    summonedAt: summonedAtByRef.get(agent.ref) ?? configuration.updatedAt,
  }));
  setVentureDoc(ventureId, "crew", "roster", { teammates, updatedAt: configuration.updatedAt }, options);
}

function receiptId(revision) {
  const stamp = now().replace(/\D/g, "").slice(0, 17);
  return `configuration-${String(revision).padStart(6, "0")}-${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

function proposalId() {
  const stamp = now().replace(/\D/g, "").slice(0, 17);
  return `configuration-proposal-${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

function mergeConfiguration(current, changes = {}) {
  return {
    ...current,
    ...changes,
    presentation: { ...current.presentation, ...(changes.presentation ?? {}) },
    defaults: { ...current.defaults, ...(changes.defaults ?? {}) },
    organization: { ...current.organization, ...(changes.organization ?? {}) },
    coordination: { ...current.coordination, ...(changes.coordination ?? {}) },
    authority: { ...current.authority, ...(changes.authority ?? {}) },
    agents: changes.agents ?? current.agents,
  };
}

export function proposeFirmConfiguration({
  ventureId,
  changes,
  summary,
  rationale = null,
  proposedBy,
} = {}, options = {}) {
  if (!ventureId) throw new Error("proposeFirmConfiguration() needs a ventureId.");
  if (!text(summary)) throw new Error("A firm configuration proposal needs a summary.");
  if (!text(proposedBy)) throw new Error("A firm configuration proposal needs a proposedBy ref.");
  const current = getFirmConfiguration(ventureId, options);
  const createdAt = now();
  const proposed = normalizeConfiguration(mergeConfiguration(current, changes), current);
  const proposal = {
    id: proposalId(),
    type: "firm-configuration-proposal",
    status: "pending",
    baseRevision: current.revision,
    proposedRevision: current.revision + 1,
    proposedBy: text(proposedBy),
    summary: text(summary),
    rationale: text(rationale),
    before: current,
    proposed: { ...proposed, revision: current.revision + 1, updatedAt: createdAt },
    createdAt,
  };
  setVentureDoc(ventureId, "configuration", proposal.id, proposal, options);
  return proposal;
}

export function applyFirmConfigurationProposal({ ventureId, proposalId: targetId, expectedRevision } = {}, options = {}) {
  const proposal = getVentureDoc(ventureId, "configuration", targetId, options);
  if (!proposal || proposal.type !== "firm-configuration-proposal") {
    throw new Error(`No such firm configuration proposal: ${targetId}`);
  }
  if (proposal.status !== "pending") throw new Error(`Firm configuration proposal ${targetId} is already ${proposal.status}.`);
  if (proposal.baseRevision !== expectedRevision) {
    const error = new Error(`Proposal ${targetId} was based on revision ${proposal.baseRevision}, not ${expectedRevision}.`);
    error.code = "PERSISTENCE_CONFLICT";
    throw error;
  }
  const applied = applyFirmConfiguration({
    ventureId,
    expectedRevision,
    configuration: proposal.proposed,
    summary: proposal.summary,
    source: `proposal:${targetId}`,
  }, options);
  setVentureDoc(ventureId, "configuration", targetId, {
    ...proposal,
    status: "applied",
    appliedRevision: applied.configuration.revision,
    receiptId: applied.receipt.id,
    appliedAt: now(),
  }, options);
  return applied;
}

export function proposeCapabilityAttachment({ ventureId, agentRef, capability } = {}, options = {}) {
  const current = getFirmConfiguration(ventureId, options);
  const agent = configuredAgent(current, agentRef);
  if (!agent) throw new Error(`No configured participant has ref "${agentRef}".`);
  const capabilityName = text(capability);
  if (!capabilityName) throw new Error("A capability attachment needs a capability name.");
  if (agent.capabilities.additional.includes(capabilityName)) {
    throw new Error(`${agent.name} already has the ${capabilityName} capability.`);
  }
  return proposeFirmConfiguration({
    ventureId,
    proposedBy: "founder-canvas",
    summary: `Give ${agent.name} the ${capabilityName} capability`,
    rationale: "Proposed from the canvas. Applying it changes the firm configuration; it does not grant host authority by itself.",
    changes: {
      agents: current.agents.map((entry) => entry.ref === agentRef ? {
        ...entry,
        capabilities: {
          ...entry.capabilities,
          additional: [...entry.capabilities.additional, capabilityName],
        },
      } : entry),
    },
  }, options);
}

export function applyFirmConfiguration({
  ventureId,
  expectedRevision,
  configuration,
  summary = "Updated firm configuration",
  source = "founder",
} = {}, options = {}) {
  if (!ventureId) throw new Error("applyFirmConfiguration() needs a ventureId.");
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error("applyFirmConfiguration() needs the current positive expectedRevision.");
  }
  const current = getFirmConfiguration(ventureId, options);
  if (current.revision !== expectedRevision) {
    const error = new Error(`Stale firm configuration revision: expected ${expectedRevision}, current ${current.revision}.`);
    error.code = "PERSISTENCE_CONFLICT";
    error.expectedRevision = expectedRevision;
    error.actualRevision = current.revision;
    throw error;
  }
  const updatedAt = now();
  const normalized = normalizeConfiguration(configuration, current);
  const next = { ...normalized, revision: expectedRevision + 1, createdAt: current.createdAt, updatedAt };
  const saved = venturePersistence(options, ventureId)
    .compareAndSet("configuration", CONFIGURATION_KEY, expectedRevision, next);
  syncRoster(ventureId, saved, options);
  const receipt = {
    id: receiptId(saved.revision),
    type: "firm-configuration-change",
    revision: saved.revision,
    source: text(source, "founder"),
    summary: text(summary, "Updated firm configuration"),
    before: current,
    after: saved,
    createdAt: updatedAt,
  };
  setVentureDoc(ventureId, "configuration", receipt.id, receipt, options);
  return { configuration: saved, receipt };
}

export function restoreFirmConfiguration({ ventureId, expectedRevision, receiptId: targetId } = {}, options = {}) {
  const receipt = getVentureDoc(ventureId, "configuration", targetId, options);
  if (!receipt || receipt.type !== "firm-configuration-change") {
    throw new Error(`No such firm configuration receipt: ${targetId}`);
  }
  return applyFirmConfiguration({
    ventureId,
    expectedRevision,
    configuration: receipt.before,
    summary: `Restored configuration before “${receipt.summary}”`,
    source: "founder-restore",
  }, options);
}

export function configuredAgent(configuration, ref) {
  return configuration.agents.find((agent) => agent.ref === ref) ?? null;
}

export { CONFIGURATION_KEY, SCHEMA_VERSION };
