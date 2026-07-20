// Canonical release projection. A release is an ordinary semantic object; this module only joins the
// thread/run/decision/outcome references needed by the founder workspace.

import crypto from "node:crypto";
import { getSemanticModel, mutateSemanticModel } from "./semantic-model-store.mjs";
import { listVentureDocs } from "./venture-store.mjs";

const list = (value) => Array.isArray(value) ? value : [];
const idOf = (ref, prefix) => String(ref ?? "").startsWith(prefix) ? String(ref).slice(prefix.length) : null;
const releaseRef = (id) => `object:${id}`;

function joined(model, release) {
  const ref = releaseRef(release.id);
  const relationships = list(model.relationships).filter((entry) => entry.fromRef === ref || entry.toRef === ref);
  const subjectRefs = new Set([ref, ...relationships.map((entry) => entry.fromRef === ref ? entry.toRef : entry.fromRef)]);
  const threads = list(model.threads).filter((entry) => list(entry.subjectRefs).some((subjectRef) => subjectRefs.has(subjectRef)));
  const threadRefs = new Set(threads.map((entry) => `thread:${entry.id}`));
  const runs = list(model.runs).filter((entry) => threadRefs.has(entry.threadRef) || list(entry.scopeRefs).some((scopeRef) => subjectRefs.has(scopeRef)));
  return { relationships, threads, runs };
}

function projection(model, release, decisions, outcomes, receipts = [], observationContracts = []) {
  const joins = joined(model, release);
  const decisionIds = new Set(joins.runs.flatMap((run) => list(run.decisionRefs)).map((ref) => idOf(ref, "decision:")).filter(Boolean));
  const outcomeIds = new Set(joins.runs.flatMap((run) => list(run.outcomeRefs)).map((ref) => idOf(ref, "outcome:")).filter(Boolean));
  const joinedDecisions = decisions.filter((entry) => decisionIds.has(entry.id));
  const joinedOutcomes = outcomes.filter((entry) => outcomeIds.has(entry.id) || entry.releaseRef === releaseRef(release.id));
  const runRefs = new Set(joins.runs.map((entry) => `run:${entry.id}`));
  const joinedReceipts = receipts.filter((entry) => runRefs.has(entry.runRef));
  const ended = Boolean(release.properties?.release?.endedAt);
  const lifecycle = ended ? "ended" : joinedDecisions.some((entry) => entry.releasedAt) ? "in-market" : "draft";
  const attention = [];
  if (joinedDecisions.some((entry) => entry.decision == null)) attention.push("decision");
  if (joinedDecisions.some((entry) => entry.lastExecutionError)) attention.push("failed-action");
  if (joinedDecisions.some((entry) => entry.needsReconnect)) attention.push("reconnect");
  if (release.properties?.release?.unresolvedJudgment) attention.push("judgment");
  const relatedObjectRefs = joins.relationships.map((entry) => entry.fromRef === releaseRef(release.id) ? entry.toRef : entry.fromRef);
  const observations = observationContracts.filter((entry) => entry.releaseRef === releaseRef(release.id));
  return {
    id: release.id, releaseRef: releaseRef(release.id), name: release.name, statement: release.statement,
    assertion: release.assertion, lifecycle, attention: [...new Set(attention)],
    updatedAt: release.updatedAt ?? release.createdAt ?? null, createdAt: release.createdAt ?? null,
    endedAt: release.properties?.release?.endedAt ?? null, endedBy: release.properties?.release?.endedBy ?? null,
    externalRefs: release.properties?.release?.externalRefs ?? {}, relatedObjectRefs,
    threadRefs: joins.threads.map((entry) => `thread:${entry.id}`), runRefs: [...runRefs],
    threads: joins.threads, runs: joins.runs, receipts: joinedReceipts,
    decisions: joinedDecisions, outcomes: joinedOutcomes, observations, relationships: joins.relationships,
  };
}

export function projectReleaseIndex(model, { decisions = [], outcomes = [], receipts = [], observationContracts = [], query = "" } = {}) {
  const needle = String(query ?? "").trim().toLowerCase();
  const releases = list(model.objects).filter((entry) => entry.type === "release")
    .map((entry) => projection(model, entry, decisions, outcomes, receipts, observationContracts))
    .filter((entry) => !needle || JSON.stringify(entry).toLowerCase().includes(needle))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const assigned = new Set(releases.flatMap((entry) => entry.decisions.map((decision) => decision.id)));
  return {
    ventureId: model.ventureId, revision: model.revision, releases,
    unassignedActions: decisions.filter((entry) => !assigned.has(entry.id)),
    counts: {
      needsYou: releases.filter((entry) => entry.attention.length).length,
      drafts: releases.filter((entry) => entry.lifecycle === "draft").length,
      inMarket: releases.filter((entry) => entry.lifecycle === "in-market").length,
      ended: releases.filter((entry) => entry.lifecycle === "ended").length,
    },
  };
}

export function buildReleaseIndex(ventureId, options = {}) {
  return projectReleaseIndex(getSemanticModel(ventureId, options), {
    decisions: listVentureDocs(ventureId, "decisions", options), outcomes: listVentureDocs(ventureId, "outcomes", options), receipts: listVentureDocs(ventureId, "receipts", options), observationContracts: listVentureDocs(ventureId, "observationContracts", options), query: options.query,
  });
}

export function buildReleaseDetail(ventureId, releaseId, options = {}) {
  const index = buildReleaseIndex(ventureId, options);
  const release = index.releases.find((entry) => entry.id === releaseId);
  if (!release) throw Object.assign(new Error(`No such release: ${releaseId}`), { status: 404, code: "semantic_model_missing_ref" });
  return { ...release, revision: index.revision };
}

function relationship(id, fromRef, toRef, label) {
  return { id, fromRef, toRef, label, type: "release-link", properties: {}, assertion: "founder-asserted", sourceRefs: [] };
}

export function createRelease({ ventureId, baseRevision, release, actor } = {}, options = {}) {
  if (actor?.authority !== "founder") throw Object.assign(new Error("Only the founder can create a release."), { status: 403 });
  const id = String(release?.id ?? `release-${crypto.randomBytes(8).toString("hex")}`);
  const object = { id, type: "release", name: String(release?.name ?? "").trim(), statement: String(release?.statement ?? ""), assertion: release?.assertion === "tentative" ? "tentative" : "founder-asserted", properties: { release: { externalRefs: {} } }, provenance: { kind: "founder-authored", actor: actor.id } };
  if (!object.name) throw Object.assign(new Error("A release needs a name."), { status: 400 });
  const operations = [{ op: "create-record", family: "objects", record: object }];
  if (release?.objectRef) operations.push({ op: "create-record", family: "relationships", record: relationship(`release-link-${crypto.randomBytes(8).toString("hex")}`, releaseRef(id), String(release.objectRef).replace(/^architecture:/, "object:"), String(release.linkLabel ?? "moves to market")) });
  if (release?.threadRef) {
    const model = getSemanticModel(ventureId, options);
    const threadId = idOf(release.threadRef, "thread:");
    const thread = model.threads.find((entry) => entry.id === threadId);
    if (!thread) throw Object.assign(new Error(`No such thread: ${threadId}`), { status: 404 });
    operations.push({ op: "update-record", family: "threads", id: thread.id, record: { subjectRefs: [...new Set([...list(thread.subjectRefs), releaseRef(id)])] } });
  }
  const next = mutateSemanticModel({ ventureId, baseRevision, operations, actor }, options);
  return { release: projection(next, next.objects.find((entry) => entry.id === id), listVentureDocs(ventureId, "decisions", options), listVentureDocs(ventureId, "outcomes", options), listVentureDocs(ventureId, "receipts", options), listVentureDocs(ventureId, "observationContracts", options)), releaseIndex: projectReleaseIndex(next, { decisions: listVentureDocs(ventureId, "decisions", options), outcomes: listVentureDocs(ventureId, "outcomes", options), receipts: listVentureDocs(ventureId, "receipts", options), observationContracts: listVentureDocs(ventureId, "observationContracts", options) }) };
}

export function mutateRelease({ ventureId, releaseId, baseRevision, mutations, actor } = {}, options = {}) {
  if (actor?.authority !== "founder") throw Object.assign(new Error("Only the founder can change a release."), { status: 403 });
  const model = getSemanticModel(ventureId, options);
  const current = model.objects.find((entry) => entry.id === releaseId && entry.type === "release");
  if (!current) throw Object.assign(new Error(`No such release: ${releaseId}`), { status: 404 });
  let object = structuredClone(current);
  const operations = [];
  for (const mutation of list(mutations)) {
    if (mutation.op === "rename") object.name = String(mutation.name ?? "").trim();
    else if (mutation.op === "update") { if (mutation.name != null) object.name = String(mutation.name).trim(); if (mutation.statement != null) object.statement = String(mutation.statement); }
    else if (mutation.op === "end") object.properties = { ...object.properties, release: { ...object.properties?.release, endedAt: mutation.at ?? new Date().toISOString(), endedBy: actor.id } };
    else if (mutation.op === "reopen") object.properties = { ...object.properties, release: { ...object.properties?.release, endedAt: null, endedBy: null } };
    else if (mutation.op === "link-object") operations.push({ op: "create-record", family: "relationships", record: relationship(mutation.id ?? `release-link-${crypto.randomBytes(8).toString("hex")}`, releaseRef(releaseId), String(mutation.objectRef).replace(/^architecture:/, "object:"), String(mutation.label ?? "moves to market")) });
    else if (mutation.op === "unlink-object") operations.push({ op: "remove-record", family: "relationships", id: String(mutation.relationshipRef ?? "").replace(/^relationship:/, "") });
    else if (mutation.op === "link-thread" || mutation.op === "unlink-thread") {
      const threadId = idOf(mutation.threadRef, "thread:");
      const thread = model.threads.find((entry) => entry.id === threadId);
      if (!thread) throw Object.assign(new Error(`No such thread: ${threadId}`), { status: 404 });
      const subjects = new Set(list(thread.subjectRefs));
      if (mutation.op === "link-thread") subjects.add(releaseRef(releaseId));
      else subjects.delete(releaseRef(releaseId));
      operations.push({ op: "update-record", family: "threads", id: thread.id, record: { subjectRefs: [...subjects] } });
    }
    else throw Object.assign(new Error(`Unsupported release mutation: ${mutation.op}`), { status: 400 });
  }
  if (!object.name) throw Object.assign(new Error("A release needs a name."), { status: 400 });
  if (JSON.stringify(object) !== JSON.stringify(current)) operations.unshift({ op: "update-record", family: "objects", id: releaseId, record: object });
  if (!operations.length) throw Object.assign(new Error("A release change needs at least one mutation."), { status: 400 });
  mutateSemanticModel({ ventureId, baseRevision, operations, actor }, options);
  return { release: buildReleaseDetail(ventureId, releaseId, options), releaseIndex: buildReleaseIndex(ventureId, options) };
}
