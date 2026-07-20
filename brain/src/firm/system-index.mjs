// Venture-system read model and founder mutation adapter. The projection is disposable; canonical
// objects and relationships remain in the semantic model, and compatibility-owned architecture keeps
// using its existing mutation seam.

import crypto from "node:crypto";

import { getSemanticModel, mutateSemanticModel } from "./semantic-model-store.mjs";
import { listVentureDocs } from "./venture-store.mjs";
import { deriveVentureTraceability, objectTerritory } from "./venture-traceability.mjs";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function objectId(ref) {
  const match = String(ref ?? "").match(/^(?:object|architecture):([^#]+)/);
  return match?.[1] ?? null;
}

function searchText(value) {
  try { return JSON.stringify(value ?? "").toLocaleLowerCase(); } catch { return String(value ?? "").toLocaleLowerCase(); }
}

function attentionFor(model) {
  const traceability = deriveVentureTraceability(model);
  const byObject = new Map();
  const add = (ref, kind, reason) => {
    const id = objectId(ref);
    if (!id) return;
    if (!byObject.has(id)) byObject.set(id, []);
    byObject.get(id).push({ kind, reason });
  };
  for (const gap of traceability.gaps) {
    add(gap.objectRef ?? gap.fromRef ?? gap.toRef, gap.kind, gap.reason);
  }
  const connected = new Set(model.relationships.flatMap((entry) => [objectId(entry.fromRef), objectId(entry.toRef)]).filter(Boolean));
  for (const object of model.objects) {
    if (object.assertion === "tentative") add(`object:${object.id}`, "tentative", "Drover's current read still needs founder judgment.");
    if (!connected.has(object.id) && model.objects.length > 1) add(`object:${object.id}`, "disconnected", "This is not connected to the operating system yet.");
  }
  return byObject;
}

function returnedEvidence(model, outcomes) {
  const canonicalIds = new Set(model.objects.map((object) => object.id));
  const objects = [];
  const relationships = [];
  for (const outcome of outcomes) {
    const releaseId = objectId(outcome.releaseRef);
    if (!releaseId || !canonicalIds.has(releaseId)) continue;
    const affected = model.relationships.flatMap((entry) => {
      if (objectId(entry.fromRef) === releaseId) return [objectId(entry.toRef)];
      if (objectId(entry.toRef) === releaseId) return [objectId(entry.fromRef)];
      return [];
    }).filter((id) => id && id !== releaseId && canonicalIds.has(id));
    const id = `outcome:${outcome.id}`;
    const kind = text(outcome.outcomeKind);
    objects.push({
      id, objectRef: `outcome:${outcome.id}`, name: kind ? `${kind[0].toUpperCase()}${kind.slice(1)} returned` : "Evidence returned",
      statement: text(outcome.body) ?? "A release-scoped source returned evidence.", type: "return", territory: null,
      assertion: "tentative", provenance: { kind: "release-observation", sourceRef: `outcome:${outcome.id}` },
      properties: { returnedEvidence: { outcomeRef: `outcome:${outcome.id}`, releaseRef: outcome.releaseRef, observationContractRef: outcome.observationContractRef ?? null, from: outcome.from ?? null, source: outcome.source ?? null, observedAt: outcome.observedAt ?? null, attribution: outcome.attribution ?? "unattributed", affectedObjectRefs: [...new Set(affected.map((entry) => `object:${entry}`))], interpretation: "unresolved" } },
      compatibilityOwned: false, architectureRole: null, threadRefs: [], attention: [],
      createdAt: outcome.observedAt ?? null, updatedAt: outcome.observedAt ?? null, projectionOnly: true,
    });
    for (const affectedId of new Set(affected)) relationships.push({
      id: `return-${outcome.id}-${affectedId}`, relationshipRef: `return:${outcome.id}:${affectedId}`,
      fromRef: `object:${id}`, toRef: `object:${affectedId}`, label: "returned through this release",
      type: "evidence-return", assertion: "tentative", sourceRefs: [`outcome:${outcome.id}`],
      properties: { projectionOnly: true }, compatibilityOwned: false, projectionOnly: true,
    });
  }
  return { objects, relationships };
}

export function projectSystemIndex(model, { scope = "system", query = "", outcomes = [] } = {}) {
  const normalizedScope = ["system", "product", "gtm", "attention"].includes(scope) ? scope : "system";
  const needle = text(query)?.toLocaleLowerCase() ?? "";
  const attention = attentionFor(model);
  const threadsByObject = new Map();
  for (const thread of list(model.threads)) {
    for (const ref of list(thread.subjectRefs)) {
      const id = objectId(ref);
      if (!id) continue;
      if (!threadsByObject.has(id)) threadsByObject.set(id, []);
      threadsByObject.get(id).push(`thread:${thread.id}`);
    }
  }
  const returns = returnedEvidence(model, outcomes);
  const objects = [...model.objects.map((object) => ({
    id: object.id,
    objectRef: `object:${object.id}`,
    name: object.name,
    statement: object.statement,
    type: object.type,
    territory: objectTerritory(object),
    assertion: object.assertion,
    provenance: object.provenance ?? null,
    properties: object.properties ?? {},
    compatibilityOwned: Boolean(object.properties?.architecture || object.properties?.workingTheory),
    architectureRole: text(object.properties?.architecture?.role),
    threadRefs: [...new Set([
      ...(threadsByObject.get(object.id) ?? []),
      text(object.properties?.coding?.threadRef),
    ].filter(Boolean))],
    attention: attention.get(object.id) ?? [],
    createdAt: object.createdAt ?? null,
    updatedAt: object.updatedAt ?? object.createdAt ?? null,
  })), ...returns.objects].filter((object) => {
    if (normalizedScope === "product" && object.territory !== "product") return false;
    if (normalizedScope === "gtm" && object.territory !== "gtm") return false;
    if (normalizedScope === "attention" && !object.attention.length) return false;
    return !needle || searchText(object).includes(needle);
  });
  const visible = new Set(objects.map((object) => object.id));
  const relationships = [...model.relationships, ...returns.relationships].filter((relationship) => {
    const from = objectId(relationship.fromRef);
    const to = objectId(relationship.toRef);
    if (!from || !to) return false;
    if (normalizedScope === "system") return !needle || visible.has(from) || visible.has(to) || searchText(relationship).includes(needle);
    return visible.has(from) && visible.has(to);
  }).map((relationship) => ({ ...structuredClone(relationship), relationshipRef: `relationship:${relationship.id}`, compatibilityOwned: Boolean(relationship.properties?.architecture?.connection) }));
  return {
    ventureId: model.ventureId,
    revision: model.revision,
    architectureRevision: model.compatibility?.architecture?.revision ?? 0,
    scope: normalizedScope,
    objects,
    relationships,
    counts: {
      total: model.objects.length,
      product: model.objects.filter((object) => objectTerritory(object) === "product").length,
      gtm: model.objects.filter((object) => objectTerritory(object) === "gtm").length,
      attention: attention.size,
      matchCount: objects.length,
    },
  };
}

export function buildSystemIndex(ventureId, options = {}) {
  return projectSystemIndex(getSemanticModel(ventureId, options), { ...options, outcomes: listVentureDocs(ventureId, "outcomes", options) });
}

function generatedId(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
}

function founderObject(input, actor) {
  const name = text(input.name);
  const territory = text(input.territory);
  if (!name) throw Object.assign(new Error("A system object needs a name."), { status: 400 });
  if (!["product", "gtm"].includes(territory)) throw Object.assign(new Error("Choose Product or GTM for this object."), { status: 400 });
  return {
    id: text(input.id) ?? generatedId("object"),
    type: text(input.type) ?? "open",
    name,
    statement: text(input.statement) ?? "",
    assertion: "founder-asserted",
    provenance: { kind: "founder-authored", actor: actor.id },
    properties: { ...(input.properties ?? {}), territory },
  };
}

export function applySystemMutations({ ventureId, baseRevision, mutations, actor } = {}, options = {}) {
  if (actor?.authority !== "founder") throw Object.assign(new Error("Only the founder can change the venture system."), { status: 403 });
  if (!Array.isArray(mutations) || !mutations.length) throw Object.assign(new Error("A system change needs at least one mutation."), { status: 400 });
  const model = getSemanticModel(ventureId, options);
  const operations = mutations.map((mutation) => {
    if (mutation?.op === "create-object") return { op: "create-record", family: "objects", record: founderObject(mutation.object ?? mutation, actor) };
    if (mutation?.op === "update-object") {
      const id = objectId(mutation.objectRef) ?? text(mutation.id);
      const current = model.objects.find((entry) => entry.id === id);
      if (!current) throw Object.assign(new Error(`No such system object: ${id}`), { status: 404 });
      if (current.properties?.architecture || current.properties?.workingTheory) {
        throw Object.assign(new Error("This object is compatibility-owned. Change it through the architecture editor."), { code: "semantic_model_compatibility_owned", status: 409 });
      }
      const territory = mutation.territory == null ? current.properties?.territory : text(mutation.territory);
      if (territory != null && !["product", "gtm"].includes(territory)) throw Object.assign(new Error("Choose Product or GTM for this object."), { status: 400 });
      return { op: "update-record", family: "objects", id, record: {
        ...(mutation.name != null ? { name: text(mutation.name) } : {}),
        ...(mutation.statement != null ? { statement: String(mutation.statement) } : {}),
        properties: { ...current.properties, ...(territory ? { territory } : {}) },
      } };
    }
    if (mutation?.op === "create-relationship") {
      const fromRef = String(mutation.fromRef ?? "").replace(/^architecture:/, "object:");
      const toRef = String(mutation.toRef ?? "").replace(/^architecture:/, "object:");
      const label = text(mutation.label);
      if (!label) throw Object.assign(new Error("A connection needs a plain-language label."), { status: 400 });
      return { op: "create-record", family: "relationships", record: {
        id: text(mutation.id) ?? generatedId("relationship"), fromRef, toRef, label,
        type: text(mutation.type) ?? "founder-connection", properties: {}, assertion: "founder-asserted", sourceRefs: [],
      } };
    }
    if (mutation?.op === "update-relationship") {
      const id = String(mutation.relationshipRef ?? mutation.id ?? "").replace(/^relationship:/, "");
      return { op: "update-record", family: "relationships", id, record: {
        ...(mutation.label != null ? { label: text(mutation.label) } : {}),
      } };
    }
    if (mutation?.op === "remove-relationship") {
      const id = String(mutation.relationshipRef ?? mutation.id ?? "").replace(/^relationship:/, "");
      return { op: "remove-record", family: "relationships", id };
    }
    throw Object.assign(new Error(`Unsupported system mutation: ${mutation?.op ?? "missing"}`), { status: 400 });
  });
  const next = mutateSemanticModel({ ventureId, baseRevision, operations, actor }, options);
  return { model: next, systemIndex: projectSystemIndex(next, { outcomes: listVentureDocs(ventureId, "outcomes", options) }) };
}
