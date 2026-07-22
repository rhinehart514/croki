import crypto from "node:crypto";

import { executeNpmDeploy } from "../connectors/execute/npm-deploy.mjs";
import { stampDeployContract } from "./deploy-contract.mjs";
import { getSemanticModel, mutateSemanticModel } from "./semantic-model-store.mjs";
import { getVentureDoc, listVentureDocs, now, setVentureDoc } from "./venture-store.mjs";

const text = (value) => String(value ?? "").trim() || null;
const list = (value) => Array.isArray(value) ? value : [];
const unique = (value) => [...new Set(list(value).map(text).filter(Boolean))];
const time = (value) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const OBSERVATION_COLLECTION = "observationContracts";
const MAX_BODY_BYTES = 128 * 1024;

function fail(message, code = "outward_action_invalid", status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function resolvedActor(input) {
  if (!new Set(["founder", "agent", "host"]).has(input?.authority) || !text(input?.id)) fail("Outward work needs a resolved actor.", "outward_action_authority_denied", 403);
  return { ...structuredClone(input), id: text(input.id) };
}

export function prepareOutwardAction({ ventureId, kind, subjectRefs = [], branchRefs = [], motionRefs = [], productDeltaRefs = [], workRefs = [], decisionRef, preparedMaterial = null, expectedReturn = null, actor } = {}, options = {}) {
  const preparedBy = resolvedActor(actor);
  const createdAt = now();
  const record = {
    id: `outward-action-${crypto.randomUUID()}`,
    ventureId,
    kind: text(kind) ?? fail("Outward work needs its real kind."),
    subjectRefs: unique(subjectRefs),
    branchRefs: unique(branchRefs),
    motionRefs: unique(motionRefs),
    productDeltaRefs: unique(productDeltaRefs),
    workRefs: unique(workRefs),
    decisionRef: text(decisionRef) ?? fail("Prepared outward work needs an exact founder decision reference."),
    executedAt: null,
    executorReceipt: null,
    executionLease: null,
    executionAttempts: [],
    lastExecutionError: null,
    needsReconnect: false,
    observationRefs: [],
    outcomeRefs: [],
    preparedMaterial: structuredClone(preparedMaterial),
    expectedReturn: structuredClone(expectedReturn),
    preparedBy,
    createdAt,
    updatedAt: createdAt,
  };
  const current = getSemanticModel(ventureId, options);
  const model = mutateSemanticModel({ ventureId, baseRevision: current.revision, operations: [{ op: "create-record", family: "outwardActions", record }], actor: preparedBy }, options);
  return structuredClone(model.outwardActions.find((entry) => entry.id === record.id));
}

function actionFrom(model, actionId) {
  const action = model.outwardActions.find((entry) => entry.id === actionId);
  if (!action) fail(`No such outward action: ${actionId}`, "outward_action_not_found", 404);
  return action;
}

function executionAttempt(outcome, attemptedAt) {
  return {
    id: `outward-attempt-${crypto.randomUUID()}`,
    attemptedAt,
    ok: outcome?.ok === true,
    adapter: text(outcome?.adapter),
    error: outcome?.ok === true ? null : text(outcome?.error) ?? "The outward action failed without a usable receipt.",
    needsReconnect: outcome?.ok === true ? false : Boolean(outcome?.needsReconnect),
  };
}

export async function executeOutwardAction({ ventureId, actionId, actor } = {}, options = {}, deps = {}) {
  const founder = resolvedActor(actor);
  if (founder.authority !== "founder") fail("Only the founder can execute outward work.", "outward_action_authority_denied", 403);
  if (typeof deps.execute !== "function") fail("No exact executor is available for this outward action.", "outward_action_executor_unavailable", 409);
  const current = getSemanticModel(ventureId, options);
  const action = actionFrom(current, actionId);
  if (action.executedAt) return structuredClone(action);
  if (action.executionLease) fail("This outward action already began execution. Verify the destination before preparing another action.", "outward_action_execution_unknown", 409);

  const attemptedAt = now();
  const lease = { id: `outward-execution-${crypto.randomUUID()}`, startedAt: attemptedAt, startedBy: founder.id };
  const acquiredModel = mutateSemanticModel({
    ventureId,
    baseRevision: current.revision,
    operations: [{ op: "update-record", family: "outwardActions", id: actionId, record: { ...action, executionLease: lease } }],
    actor: founder,
  }, options);
  const acquired = actionFrom(acquiredModel, actionId);
  let outcome;
  try {
    outcome = await deps.execute(structuredClone(acquired), options);
  } catch (error) {
    outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const attempt = executionAttempt(outcome, attemptedAt);
  const settling = getSemanticModel(ventureId, options);
  const active = actionFrom(settling, actionId);
  if (active.executionLease?.id !== lease.id) fail("The exact execution receipt lost its durable lease. Verify the destination before continuing.", "outward_action_execution_unknown", 409);
  const attempts = [...list(active.executionAttempts), attempt];
  const record = outcome?.ok === true
    ? {
        ...active,
        executedAt: text(outcome.executedAt) ?? attemptedAt,
        executorReceipt: structuredClone(outcome.receipt ?? {}),
        executionLease: null,
        executionAttempts: attempts,
        lastExecutionError: null,
        needsReconnect: false,
        updatedAt: now(),
      }
    : {
        ...active,
        executionLease: null,
        executionAttempts: attempts,
        lastExecutionError: attempt.error,
        needsReconnect: attempt.needsReconnect,
        updatedAt: now(),
      };
  const model = mutateSemanticModel({
    ventureId,
    baseRevision: settling.revision,
    operations: [{ op: "update-record", family: "outwardActions", id: actionId, record }],
    actor: founder,
  }, options);
  const saved = actionFrom(model, actionId);
  if (outcome?.ok !== true) {
    throw Object.assign(new Error(attempt.error), {
      code: attempt.needsReconnect ? "outward_action_reconnect_required" : "outward_action_execution_failed",
      status: attempt.needsReconnect ? 409 : 502,
      action: structuredClone(saved),
    });
  }
  return structuredClone(saved);
}

export function projectOutwardActions(ventureId, options = {}) {
  return structuredClone(getSemanticModel(ventureId, options).outwardActions);
}

function deployEffect(material) {
  if (!material || typeof material !== "object") return {};
  return material.effect && typeof material.effect === "object" ? material.effect : material;
}

export function prepareOutwardMaterial({ ventureId, kind, preparedMaterial } = {}, options = {}) {
  if (text(kind) !== "deploy") return structuredClone(preparedMaterial);
  const material = preparedMaterial && typeof preparedMaterial === "object" ? structuredClone(preparedMaterial) : {};
  const stamped = stampDeployContract(ventureId, { ...deployEffect(material), kind: "deploy" }, options);
  return material.effect && typeof material.effect === "object" ? { ...material, effect: stamped } : stamped;
}

export async function executePreparedOutwardAction(action, options = {}, deps = {}) {
  if (action.kind !== "deploy") return { ok: false, error: `No executor is available for outward action kind “${action.kind}”.` };
  const effect = deployEffect(action.preparedMaterial);
  if (effect.deployUnavailableReason) return { ok: false, error: effect.deployUnavailableReason };
  const outcome = await (deps.deploy ?? executeNpmDeploy)({ effect, ventureId: action.ventureId }, options);
  if (!outcome?.ok) return { ok: false, adapter: "verified-npm-deploy", error: outcome?.error ?? "The verified repository deploy did not complete.", ...(outcome?.needsReconnect ? { needsReconnect: true } : {}) };
  return {
    ok: true,
    adapter: "verified-npm-deploy",
    receipt: { adapter: "verified-npm-deploy", deploymentId: text(outcome.deploymentId), ...(outcome.detail && typeof outcome.detail === "object" ? structuredClone(outcome.detail) : {}) },
  };
}

export function recordOutwardExecution({ ventureId, actionId, executorReceipt, observationRefs = [], executedAt = now(), actor } = {}, options = {}) {
  const founder = resolvedActor(actor);
  if (founder.authority !== "founder") fail("Only the founder can authorize an outward execution receipt.", "outward_action_authority_denied", 403);
  const current = getSemanticModel(ventureId, options);
  const action = actionFrom(current, actionId);
  const record = { ...action, executedAt, executorReceipt: structuredClone(executorReceipt), observationRefs: unique(observationRefs), updatedAt: now() };
  const model = mutateSemanticModel({ ventureId, baseRevision: current.revision, operations: [{ op: "update-record", family: "outwardActions", id: actionId, record }], actor: founder }, options);
  return structuredClone(model.outwardActions.find((entry) => entry.id === actionId));
}

export function attachOutwardReturn({ ventureId, actionId, outcomeRefs = [], observationRefs = [], actor = { authority: "host", id: "evidence-return" } } = {}, options = {}) {
  const resolved = resolvedActor(actor);
  const current = getSemanticModel(ventureId, options);
  const action = actionFrom(current, actionId);
  const record = { ...action, outcomeRefs: unique([...action.outcomeRefs, ...outcomeRefs]), observationRefs: unique([...action.observationRefs, ...observationRefs]), updatedAt: now() };
  const model = mutateSemanticModel({ ventureId, baseRevision: current.revision, operations: [{ op: "update-record", family: "outwardActions", id: actionId, record }], actor: resolved }, options);
  return structuredClone(model.outwardActions.find((entry) => entry.id === actionId));
}

function expectedPlan(action) {
  const expected = action.expectedReturn && typeof action.expectedReturn === "object" ? action.expectedReturn : {};
  const target = expected.target && typeof expected.target === "object" ? expected.target : {};
  return { source: text(expected.source), target: { url: text(target.url ?? expected.url) }, purpose: text(expected.purpose), windowHours: Number(expected.windowHours), returnConditions: list(expected.returnConditions ?? expected.conditions) };
}

function normalizeCondition(input) {
  const type = text(input?.type);
  if (type === "http-status" && Number.isInteger(input?.equals)) return { type, equals: input.equals };
  if (type === "body-includes" && text(input?.value)) return { type, value: text(input.value) };
  if (type === "header-equals" && text(input?.name) && text(input?.value)) return { type, name: text(input.name).toLowerCase(), value: text(input.value) };
  fail("HTTP observation conditions must be an exact status, body inclusion, or header equality.");
}

function boundedWindow({ startsAt, endsAt, windowHours }, currentTime) {
  const start = time(startsAt) ?? time(currentTime);
  const hours = Number.isFinite(Number(windowHours)) ? Number(windowHours) : null;
  const end = time(endsAt) ?? (hours && hours > 0 ? start + Math.min(hours, 168) * 60 * 60 * 1000 : null);
  if (start == null || end == null || end <= start) fail("Observation needs an explicit bounded start and end.");
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
}

function exactTarget(expected, supplied) {
  const expectedUrl = text(expected?.url);
  const suppliedUrl = text(supplied?.url);
  if (!expectedUrl || (suppliedUrl && suppliedUrl !== expectedUrl)) fail("Observation cannot widen beyond the exact return target prepared with this action.", "outward_observation_scope_denied", 403);
  return { url: expectedUrl };
}

export function listOutwardObservations(ventureId, actionId, options = {}) {
  return listVentureDocs(ventureId, OBSERVATION_COLLECTION, options).filter((entry) => entry.actionRef === `outward-action:${actionId}`).sort((left, right) => String(right.grantedAt).localeCompare(String(left.grantedAt)));
}

export function grantOutwardObservation({ ventureId, actionId, source, target, purpose, startsAt, endsAt, windowHours, returnConditions, actor } = {}, options = {}, deps = {}) {
  if (actor?.authority !== "founder") fail("Only the founder can grant observation.", "outward_observation_authority_denied", 403);
  const action = actionFrom(getSemanticModel(ventureId, options), actionId);
  if (!action.executedAt) fail("Execute the exact outward action before watching for a return.", "outward_observation_source_unavailable", 409);
  const expected = expectedPlan(action);
  const resolvedSource = text(source) ?? expected.source;
  if (resolvedSource !== "http") fail("Only exact HTTP return observation is available for current outward actions.");
  const conditions = list(returnConditions ?? expected.returnConditions).map(normalizeCondition);
  if (!conditions.length) fail("Observation needs at least one exact return condition.");
  const grantedAt = deps.now?.() ?? now();
  const window = boundedWindow({ startsAt, endsAt, windowHours: windowHours ?? expected.windowHours }, grantedAt);
  const active = listOutwardObservations(ventureId, actionId, options).find((entry) => !entry.revokedAt && time(entry.endsAt) >= time(grantedAt));
  if (active) fail("This outward action already has an active observation window.", "outward_observation_already_active", 409);
  const contract = {
    id: `outward-observation-${crypto.randomUUID()}`, type: "outward-observation-contract", ventureId, actionRef: `outward-action:${actionId}`,
    source: resolvedSource, target: exactTarget(expected.target, target), purpose: text(purpose) ?? expected.purpose ?? "Watch for the exact return prepared with this action.",
    returnConditions: conditions, ...window, grantedAt, grantedBy: text(actor.id) ?? "founder", revokedAt: null, lastCheckedAt: null, lastResult: null,
    authority: { reads: ["http:exact-target"], writes: ["attributable-evidence"], denies: ["send", "publish", "deploy", "spend", "canonical-interpretation"] },
  };
  setVentureDoc(ventureId, OBSERVATION_COLLECTION, contract.id, contract, options);
  attachOutwardReturn({ ventureId, actionId, observationRefs: [`observation:${contract.id}`], actor: { authority: "host", id: "outward-observation" } }, options);
  return contract;
}

function evidenceKey(contract, result) {
  return crypto.createHash("sha256").update(JSON.stringify({ contractId: contract.id, state: result.state, facts: result.facts })).digest("hex");
}

export async function checkOutwardObservation({ ventureId, actionId, observationId } = {}, options = {}, deps = {}) {
  const contract = getVentureDoc(ventureId, OBSERVATION_COLLECTION, observationId, options);
  if (!contract || contract.actionRef !== `outward-action:${actionId}`) fail(`No such outward observation: ${observationId}`, "outward_observation_not_found", 404);
  if (contract.revokedAt) fail("Observation was revoked. No source was read.", "outward_observation_revoked", 409);
  const checkedAt = deps.now?.() ?? now();
  const checkedTime = time(checkedAt);
  if (checkedTime < time(contract.startsAt)) fail("The observation window has not opened. No source was read.", "outward_observation_not_started", 409);
  if (checkedTime > time(contract.endsAt)) fail("The observation window closed. No source was read.", "outward_observation_expired", 409);
  if (typeof deps.observe !== "function") fail("No observation adapter is available for this return.", "outward_observation_adapter_unavailable", 409);
  let result;
  try { result = await deps.observe(structuredClone(contract), options); }
  catch (error) { result = { state: "failed", error: error instanceof Error ? error.message : String(error), facts: null }; }
  if (!new Set(["returned", "silence", "failed"]).has(result?.state)) result = { state: "failed", error: "The observation adapter returned no usable state.", facts: null };
  const updated = { ...contract, lastCheckedAt: checkedAt, lastResult: { ...structuredClone(result), checkedAt } };
  setVentureDoc(ventureId, OBSERVATION_COLLECTION, contract.id, updated, options);
  if (result.state === "failed") return { contract: updated, evidence: null };
  const key = evidenceKey(contract, result);
  const prior = listVentureDocs(ventureId, "outcomes", options).find((entry) => entry.actionRef === contract.actionRef && entry.evidenceKey === key);
  if (prior) return { contract: updated, evidence: prior };
  const evidence = { id: `outward-return-${crypto.randomUUID()}`, type: "outward-return", ventureId, actionRef: contract.actionRef, observationContractRef: `observation:${contract.id}`, state: result.state, source: contract.source, target: structuredClone(contract.target), facts: structuredClone(result.facts), evidenceKey: key, observedAt: checkedAt, interpretation: null };
  setVentureDoc(ventureId, "outcomes", evidence.id, evidence, options);
  attachOutwardReturn({ ventureId, actionId, observationRefs: [`observation:${contract.id}`], outcomeRefs: [`outcome:${evidence.id}`], actor: { authority: "host", id: "outward-observation" } }, options);
  return { contract: updated, evidence };
}

export function revokeOutwardObservation({ ventureId, actionId, observationId, actor } = {}, options = {}) {
  if (actor?.authority !== "founder") fail("Only the founder can revoke observation.", "outward_observation_authority_denied", 403);
  const contract = getVentureDoc(ventureId, OBSERVATION_COLLECTION, observationId, options);
  if (!contract || contract.actionRef !== `outward-action:${actionId}`) fail(`No such outward observation: ${observationId}`, "outward_observation_not_found", 404);
  if (contract.revokedAt) return contract;
  const updated = { ...contract, revokedAt: now(), revokedBy: text(actor.id) ?? "founder" };
  setVentureDoc(ventureId, OBSERVATION_COLLECTION, contract.id, updated, options);
  return updated;
}

function observationTarget(input, { allowInsecure = false } = {}) {
  let target;
  try { target = new URL(String(input ?? "")); } catch { throw new Error("The prepared return target is not a valid URL."); }
  if (target.username || target.password) throw new Error("Return observation refuses URLs containing credentials.");
  if (target.protocol !== "https:" && !(allowInsecure && target.protocol === "http:")) throw new Error("Return observation requires an exact HTTPS target.");
  return target;
}

async function readBoundedBody(response) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (length < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value).subarray(0, MAX_BODY_BYTES - length);
    chunks.push(chunk); length += chunk.length;
    if (chunk.length < value.length) { await reader.cancel(); break; }
  }
  return Buffer.concat(chunks);
}

export async function observeHttpReturn(contract, _options = {}, deps = {}) {
  const target = observationTarget(contract?.target?.url, { allowInsecure: deps.allowInsecure === true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 15_000);
  try {
    const response = await (deps.fetch ?? fetch)(target, { method: "GET", redirect: "error", signal: controller.signal, headers: { "user-agent": "Drover return observer" } });
    const body = await readBoundedBody(response);
    const bodyText = body.toString("utf8");
    const conditions = contract.returnConditions.map((condition) => ({ ...condition, matched: condition.type === "http-status" ? response.status === condition.equals : condition.type === "body-includes" ? bodyText.includes(condition.value) : condition.type === "header-equals" ? response.headers.get(condition.name) === condition.value : false }));
    const facts = { url: target.toString(), status: response.status, contentType: response.headers.get("content-type"), bodyDigest: crypto.createHash("sha256").update(body).digest("hex"), bodyBytesObserved: body.length, conditions };
    return { state: conditions.every((condition) => condition.matched) ? "returned" : "silence", facts };
  } catch (error) {
    return { state: "failed", error: error instanceof Error ? error.message : String(error), facts: null };
  } finally { clearTimeout(timer); }
}
