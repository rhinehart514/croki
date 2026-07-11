/**
 * Provider-neutral capability registry.
 *
 * This is deterministic host infrastructure, not a catalog of product or GTM work. A capability
 * declares its concrete effects and the registry derives its safety lane from those effects. Model
 * prose, provider identity, and capability names never participate in that classification.
 */

export const CAPABILITY_LANES = Object.freeze({
  READ_ONLY: "read-only",
  REVERSIBLE_LOCAL: "reversible-local",
  FOUNDER_WALL: "founder-wall",
});

export const MODEL_ACTORS = Object.freeze(["claude", "codex", "model", "agent"]);
const MODEL_ACTOR_SET = new Set(MODEL_ACTORS);
const EXPOSURES = Object.freeze(["operator", "http", "publicMcp"]);
const PRIVILEGED_OPERATIONS = new Set(["approval", "release"]);

function registryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function immutableCopy(value) {
  return deepFreeze(copy(value));
}

function strings(values, field) {
  if (values == null) return [];
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim())) {
    throw registryError("capability_invalid", `${field} must be an array of non-empty strings.`);
  }
  return [...new Set(values.map((value) => value.trim()))].sort();
}

function normalizeEffects(effects = {}) {
  if (!isPlainObject(effects)) throw registryError("capability_invalid", "effects must be an object.");
  return deepFreeze({
    readTargets: strings(effects.readTargets, "effects.readTargets"),
    writeTargets: strings(effects.writeTargets, "effects.writeTargets"),
    external: effects.external === true,
    irreversible: effects.irreversible === true,
    financial: effects.financial === true,
  });
}

/** Derive the execution lane solely from concrete, host-declared effects. */
export function classifyCapabilityEffects(effects = {}) {
  const normalized = normalizeEffects(effects);
  if (normalized.external || normalized.irreversible || normalized.financial) return CAPABILITY_LANES.FOUNDER_WALL;
  if (normalized.writeTargets.length > 0) return CAPABILITY_LANES.REVERSIBLE_LOCAL;
  return CAPABILITY_LANES.READ_ONLY;
}

export const classifyEffects = classifyCapabilityEffects;

function normalizeExposure(exposure = {}) {
  if (!isPlainObject(exposure)) throw registryError("capability_invalid", "exposure must be an object.");
  return deepFreeze(Object.fromEntries(EXPOSURES.map((key) => [key, exposure[key] === true])));
}

function normalizeApprovalPolicy(policy = {}, lane) {
  if (typeof policy === "string") policy = { required: policy !== "none", approvers: policy === "none" ? [] : [policy] };
  if (!isPlainObject(policy)) throw registryError("capability_invalid", "approvalPolicy must be an object.");
  const operation = String(policy.operation ?? policy.action ?? policy.kind ?? "execute").trim().toLowerCase();
  const required = policy.required === true || lane === CAPABILITY_LANES.FOUNDER_WALL;
  const approvers = strings(policy.approvers ?? (required ? ["founder"] : []), "approvalPolicy.approvers");
  if (lane === CAPABILITY_LANES.FOUNDER_WALL && !approvers.includes("founder")) {
    throw registryError("capability_invalid", "Founder-wall capabilities must name founder as an approver.");
  }
  return deepFreeze({ required, approvers, operation, modelMayRequest: policy.modelMayRequest !== false });
}

function normalizeSchema(schema, field) {
  if (schema == null) return deepFreeze({});
  if (!isPlainObject(schema)) throw registryError("capability_invalid", `${field} must be an open schema object.`);
  return immutableCopy(schema);
}

function normalizeActor(actor) {
  const value = typeof actor === "string" ? actor : actor?.type ?? actor?.kind ?? actor?.id;
  return String(value ?? "").trim().toLowerCase();
}

function isModelActor(actor) {
  return MODEL_ACTOR_SET.has(normalizeActor(actor));
}

function actorAllowed(allowedActors, actor) {
  const normalized = normalizeActor(actor);
  if (allowedActors.includes("*")) return true;
  if (allowedActors.includes(normalized)) return true;
  return isModelActor(normalized) && allowedActors.includes("model");
}

function assertStructural(value, schema, path) {
  if (!schema || Object.keys(schema).length === 0) return;
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    throw registryError("capability_schema_invalid", `${path} must be one of the declared values.`);
  }
  const type = schema.type;
  const valid = type == null
    || (type === "object" && isPlainObject(value))
    || (type === "array" && Array.isArray(value))
    || (type === "string" && typeof value === "string")
    || (type === "number" && typeof value === "number" && Number.isFinite(value))
    || (type === "integer" && Number.isInteger(value))
    || (type === "boolean" && typeof value === "boolean")
    || (type === "null" && value === null);
  if (!valid) throw registryError("capability_schema_invalid", `${path} must be ${type}.`);
  if (type === "object" && isPlainObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) throw registryError("capability_schema_invalid", `${path}.${key} is required.`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) assertStructural(value[key], childSchema, `${path}.${key}`);
    }
  }
  if (type === "array" && Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) throw registryError("capability_schema_invalid", `${path} has too few items.`);
    if (schema.maxItems != null && value.length > schema.maxItems) throw registryError("capability_schema_invalid", `${path} has too many items.`);
    if (schema.items) value.forEach((item, index) => assertStructural(item, schema.items, `${path}[${index}]`));
  }
}

function publicView(record) {
  return immutableCopy({
    id: record.id,
    description: record.description,
    inputSchema: record.inputSchema,
    outputSchema: record.outputSchema,
    source: record.source,
    allowedActors: record.allowedActors,
    exposure: record.exposure,
    effects: record.effects,
    approvalPolicy: record.approvalPolicy,
    lane: record.lane,
  });
}

function normalizeDefinition(definition) {
  if (!isPlainObject(definition)) throw registryError("capability_invalid", "Capability definition must be an object.");
  const id = String(definition.id ?? "").trim();
  if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(id)) {
    throw registryError("capability_invalid", "Capability id must be a non-empty stable identifier.");
  }
  if (typeof definition.handler !== "function") throw registryError("capability_invalid", `Capability "${id}" needs a handler.`);
  const effects = normalizeEffects(definition.effects);
  const lane = classifyCapabilityEffects(effects);
  return deepFreeze({
    id,
    description: String(definition.description ?? "").trim(),
    inputSchema: normalizeSchema(definition.inputSchema ?? definition.input_schema, "inputSchema"),
    outputSchema: normalizeSchema(definition.outputSchema ?? definition.output_schema, "outputSchema"),
    handler: definition.handler,
    source: immutableCopy(definition.source ?? "host"),
    allowedActors: deepFreeze(strings(definition.allowedActors ?? [], "allowedActors")),
    exposure: normalizeExposure(definition.exposure),
    effects,
    approvalPolicy: normalizeApprovalPolicy(definition.approvalPolicy, lane),
    lane,
  });
}

export class CapabilityRegistry {
  #records = new Map();

  constructor(definitions = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition) {
    const record = normalizeDefinition(definition);
    if (this.#records.has(record.id)) {
      throw registryError("capability_collision", `Capability "${record.id}" is already registered.`);
    }
    this.#records.set(record.id, record);
    return publicView(record);
  }

  has(id) {
    return this.#records.has(String(id));
  }

  get(id) {
    const record = this.#records.get(String(id));
    return record ? publicView(record) : null;
  }

  list(options = {}) {
    const actor = options.actor == null ? null : normalizeActor(options.actor);
    const exposure = options.exposure ?? options.surface ?? null;
    if (exposure != null && !EXPOSURES.includes(exposure)) throw registryError("capability_invalid", `Unknown exposure "${exposure}".`);
    return deepFreeze([...this.#records.values()]
      .filter((record) => actor == null || actorAllowed(record.allowedActors, actor))
      .filter((record) => exposure == null || record.exposure[exposure])
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(publicView));
  }

  viewForActor(actor, exposure = null) {
    return this.list({ actor, exposure });
  }

  async invoke(id, input = {}, context = {}) {
    const record = this.#records.get(String(id));
    if (!record) throw registryError("capability_unknown", `Unknown capability "${id}".`);
    const actor = normalizeActor(context.actor);
    if (!actor || !actorAllowed(record.allowedActors, actor)) {
      throw registryError("capability_actor_forbidden", `Actor "${actor || "(missing)"}" cannot invoke capability "${record.id}".`);
    }
    const exposure = context.exposure ?? context.surface ?? null;
    if (exposure != null && (!EXPOSURES.includes(exposure) || !record.exposure[exposure])) {
      throw registryError("capability_exposure_forbidden", `Capability "${record.id}" is not exposed on "${exposure}".`);
    }
    if (isModelActor(actor) && PRIVILEGED_OPERATIONS.has(record.approvalPolicy.operation)) {
      throw registryError("capability_model_authority_forbidden", `Model actors cannot invoke ${record.approvalPolicy.operation} capabilities.`);
    }
    if (record.lane === CAPABILITY_LANES.FOUNDER_WALL) {
      const approval = context.approval;
      const approvedBy = normalizeActor(approval?.actor ?? approval?.approvedBy);
      if (isModelActor(actor) || approval?.approved !== true || !record.approvalPolicy.approvers.includes(approvedBy)) {
        throw registryError("capability_founder_wall", `Capability "${record.id}" requires explicit founder approval at the wall.`);
      }
    }
    assertStructural(input, record.inputSchema, "input");
    // Keep caller-owned nested context (callbacks, cancellation signals, runtime handles) intact. The
    // registry adds immutable top-level metadata but must not freeze or clone those runtime objects.
    const invocationContext = Object.freeze({
      ...context,
      actor: context.actor,
      capability: publicView(record),
      lane: record.lane,
      idempotencyKey: context.idempotencyKey ?? null,
    });
    const result = await record.handler(input, invocationContext);
    assertStructural(result, record.outputSchema, "output");
    return result;
  }
}

export function createCapabilityRegistry(definitions = []) {
  return new CapabilityRegistry(definitions);
}
