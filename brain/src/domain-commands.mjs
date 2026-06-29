import { appendDomainEvent } from "./domain-events.mjs";
import {
  buildProductModel,
  buildPinnedSignal,
  getProductModel,
  normalizeProductModel,
  reviseProductModel,
  syncProductModelStoreFromEvents,
} from "./product-model-store.mjs";
import { blankGenerate } from "./product-model-generator.mjs";

export async function executeDomainCommand(command, input = {}, options = {}) {
  switch (command) {
    case "DeriveProductModel":
      return DeriveProductModel(input, options);
    case "ReviseProductModel":
      return ReviseProductModel(input, options);
    case "RecordProductSignal":
      return RecordProductSignal(input, options);
    default:
      throw new Error(`Unsupported domain command: ${command}`);
  }
}

function syncProductModelProjection(projectId = "default", options = {}) {
  return syncProductModelStoreFromEvents(projectId, options);
}

// DeriveProductModel — the first-draft generation. Runs the injectable generator over the scan
// grounding, normalizes the proposed bags through the pollution guard, builds the full aggregate,
// appends ONE event carrying the FULL model (the full-aggregate-in-data rule is load-bearing for
// rebuild), and returns the projected record. The generator is injectable (blankGenerate default;
// the route injects createClaudeProductModeler).
export async function DeriveProductModel(input = {}, options = {}) {
  const projectId = input.projectId || options.projectId || "default";
  const generate = options.generate ?? input.generate ?? blankGenerate;
  const result = await generate({ grounding: input.grounding, repo: input.repo, market: input.market });
  const proposed = normalizeProductModel(result?.model ?? {});
  const model = buildProductModel({
    ...proposed,
    projectId,
    generatedBy: result?.meta?.blank ? "blank" : (input.generatedBy ?? "claude"),
    groundingRef: input.groundingRef,
  }, { ...options, projectId });
  appendDomainEvent(projectId, {
    type: "ProductModelDerived",
    aggregateType: "ProductModel",
    aggregateId: model.id,
    data: model,
  }, options);
  return syncProductModelProjection(projectId, options).find((item) => item.id === model.id) ?? model;
}

// ReviseProductModel — a founder edit (or an accepted re-derivation). Applies the changed bags,
// bumps version, preserves lineageId, sets previousModelId. The event carries the FULL revised
// model (not a diff).
export function ReviseProductModel(input = {}, options = {}) {
  const projectId = input.projectId || options.projectId || "default";
  const modelId = input.modelId || input.id;
  if (!modelId) throw new Error("ReviseProductModel requires a modelId.");
  // Strip the command-routing keys; only the editable bags (+ generatedBy/groundingRef) reach the
  // store's whitelist.
  const { modelId: _m, id: _i, projectId: _p, generate: _g, ...patch } = input;
  const revised = reviseProductModel(modelId, { ...patch, projectId }, { ...options, projectId });
  appendDomainEvent(projectId, {
    type: "ProductModelRevised",
    aggregateType: "ProductModel",
    aggregateId: revised.id,
    data: revised,
  }, options);
  return syncProductModelProjection(projectId, options).find((item) => item.id === revised.id) ?? revised;
}

// RecordProductSignal — the "living" stroke. Pins an already-persisted FeedbackSignal onto a
// specific element (or the whole model). Appends a ProductSignalRecorded event carrying the
// PinnedSignal; the projection folds it onto the model's pinnedSignals. The signal body stays in
// feedback-ledger.mjs (the authoritative store); only the pin is recorded here.
export function RecordProductSignal(input = {}, options = {}) {
  const projectId = input.projectId || options.projectId || "default";
  const modelId = input.modelId ?? input.id ?? getProductModel(projectId, { ...options, projectId })?.id;
  if (!modelId) throw new Error("RecordProductSignal requires a product model to pin onto.");
  const pin = buildPinnedSignal(input);
  appendDomainEvent(projectId, {
    type: "ProductSignalRecorded",
    aggregateType: "ProductModel",
    aggregateId: modelId,
    data: pin,
  }, options);
  return syncProductModelProjection(projectId, options).find((item) => item.id === modelId);
}
