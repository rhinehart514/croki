// Production read model for returning to founder-directed work. Threads own durable identity and review;
// Runs, live drives, settlement receipts, and wall decisions remain the authoritative state sources.
// This module joins them without storing a second status model for the rail to drift from.

import { listActiveDrives } from "./active-drives.mjs";
import { getSemanticModel } from "./semantic-model-store.mjs";
import { listVentureDocs } from "./venture-store.mjs";
import { ROOT_THREAD_ID } from "./thread.mjs";
import { objectTerritory } from "./venture-traceability.mjs";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function time(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function newest(values, atFor) {
  return [...values].sort((a, b) => time(atFor(b)) - time(atFor(a)))[0] ?? null;
}

const PRODUCT_SECTIONS = new Map([
  ["direction", new Set(["direction", "vision", "concept"])],
  ["experiences", new Set(["experience", "surface", "product-loop"])],
  ["capabilities", new Set(["capability"])],
  ["systems", new Set(["system", "implementation"])],
  ["design-system", new Set(["design-system", "component", "token"])],
  ["releases", new Set(["release"])],
  ["product-evidence", new Set(["telemetry"])],
]);

const GTM_SECTIONS = new Map([
  ["market", new Set(["market"])],
  ["audiences", new Set(["audience", "need"])],
  ["positioning", new Set(["positioning", "promise", "claim"])],
  ["offer", new Set(["offer"])],
  ["distribution", new Set(["motion", "channel"])],
  ["campaigns", new Set(["campaign", "asset"])],
  ["market-evidence", new Set(["response", "revenue"])],
]);

function outlineSection(object, territory) {
  const explicit = String(object?.properties?.outline?.section ?? object?.properties?.section ?? "").trim();
  if (explicit) return explicit;
  const type = String(object?.type ?? object?.properties?.architecture?.role ?? "").trim();
  const sections = territory === "product" ? PRODUCT_SECTIONS : territory === "gtm" ? GTM_SECTIONS : new Map();
  for (const [section, types] of sections) if (types.has(type)) return section;
  return territory ? "other" : "venture-context";
}

function objectIdFromRef(ref) {
  const match = String(ref ?? "").match(/^(?:object|architecture):([^#]+)(?:#.*)?$/);
  return match?.[1] ?? null;
}

function explicitParentRef(object) {
  const value = String(object?.properties?.outline?.parentRef ?? object?.properties?.parentRef ?? "").trim();
  const id = objectIdFromRef(value);
  return id ? `object:${id}` : null;
}

function relationshipParents(model) {
  const parents = new Map();
  for (const relationship of list(model?.relationships)) {
    const type = String(relationship?.type ?? "").trim().toLowerCase();
    const label = String(relationship?.label ?? "").trim().toLowerCase();
    const from = objectIdFromRef(relationship?.fromRef);
    const to = objectIdFromRef(relationship?.toRef);
    if (!from || !to) continue;
    if (["contains", "parent-of"].includes(type) || ["contains", "parent of"].includes(label)) parents.set(to, `object:${from}`);
    if (["part-of", "child-of"].includes(type) || ["part of", "belongs to"].includes(label)) parents.set(from, `object:${to}`);
  }
  return parents;
}

// A disposable read projection over canonical objects and threads. Product/GTM are stable territories;
// sections are useful questions inside them, not stored folders. A thought appears beneath every object it
// explicitly names, while genuinely unscoped thoughts remain visible instead of being guessed into a bucket.
function projectOutline(model, items) {
  const parents = relationshipParents(model);
  const threadsByObject = new Map();
  const unplacedThreadRefs = [];
  for (const item of items) {
    const ids = [...new Set(item.subjectRefs.map(objectIdFromRef).filter(Boolean))];
    if (!ids.length) unplacedThreadRefs.push(item.threadRef);
    for (const id of ids) {
      if (!threadsByObject.has(id)) threadsByObject.set(id, []);
      threadsByObject.get(id).push(item.threadRef);
    }
  }
  const architectureRevision = Number.isInteger(model?.compatibility?.architecture?.revision)
    ? model.compatibility.architecture.revision
    : 0;
  const objects = list(model?.objects).map((object) => {
    const territory = objectTerritory(object);
    const architectureRole = String(object?.properties?.architecture?.role ?? "").trim() || null;
    return {
      id: object.id,
      objectRef: `object:${object.id}`,
      name: object.name,
      statement: object.statement,
      type: object.type,
      territory,
      sectionId: outlineSection(object, territory),
      parentRef: explicitParentRef(object) ?? parents.get(object.id) ?? null,
      assertion: object.assertion,
      provenance: object.provenance ?? null,
      threadRefs: threadsByObject.get(object.id) ?? [],
      targetable: Boolean(architectureRole),
      architectureRole,
      details: structuredClone({
        ...(object?.properties ?? {}),
        ...(object?.properties?.architecture?.fields ?? {}),
        ...(object?.properties?.outline?.details ?? {}),
      }),
      updatedAt: object.updatedAt ?? object.createdAt ?? null,
    };
  });
  const objectIds = new Set(objects.map((object) => object.id));
  const relationships = list(model?.relationships).flatMap((relationship) => {
    const fromId = objectIdFromRef(relationship.fromRef);
    const toId = objectIdFromRef(relationship.toRef);
    if (!fromId || !toId || !objectIds.has(fromId) || !objectIds.has(toId)) return [];
    return [{
      id: relationship.id,
      fromRef: `object:${fromId}`,
      toRef: `object:${toId}`,
      label: relationship.label,
      type: relationship.type,
      assertion: relationship.assertion,
      sourceRefs: list(relationship.sourceRefs),
    }];
  });
  return { architectureRevision, objects, relationships, unplacedThreadRefs };
}

function terminalFor(run, receipt, activeDrive) {
  if (!run || activeDrive) return null;
  if (receipt?.terminal?.kind) return receipt.terminal.kind;
  // A run absent from the process registry and lacking a durable settlement cannot honestly be called
  // complete. This includes provider interruption and the rarer completion/receipt persistence tear.
  return "interrupted";
}

function activityFor(activeDrive) {
  if (!activeDrive) return "idle";
  if (activeDrive.abortRequestedAt) return "stopping";
  if (activeDrive.state === "queued" || (activeDrive.queuedAt && !activeDrive.startedAt)) return "queued";
  return "running";
}

function decisionEvent(runs, decisionsById) {
  const pending = list(runs).flatMap((run) => list(run?.decisionRefs))
    .map((ref) => decisionsById.get(String(ref).replace(/^decision:/, "")))
    .filter((decision) => decision && decision.decision == null);
  const latest = newest(pending, (decision) => decision.updatedAt ?? decision.createdAt);
  if (!latest) return null;
  return {
    kind: "decision",
    ref: `decision:${latest.id}`,
    at: latest.updatedAt ?? latest.createdAt ?? null,
    summary: "Founder decision required",
  };
}

function latestEvent({ thread, run, activeDrive, receipt, pendingDecision }) {
  if (pendingDecision) return pendingDecision;
  if (activeDrive) {
    const kind = activityFor(activeDrive);
    return {
      kind,
      ref: `run:${run.id}#${kind}`,
      at: activeDrive.abortRequestedAt ?? activeDrive.startedAt ?? activeDrive.queuedAt ?? run.createdAt ?? null,
      summary: kind === "stopping" ? "Stop requested" : kind === "queued" ? "Queued" : "In progress",
    };
  }
  if (run && receipt) {
    return {
      kind: receipt.terminal.kind,
      ref: `run:${run.id}#terminal`,
      at: receipt.createdAt ?? receipt.terminal.at ?? run.completedAt ?? run.updatedAt ?? run.createdAt ?? null,
      summary: receipt.terminal.summary ?? receipt.terminal.terminalReason ?? null,
    };
  }
  if (run) {
    return {
      kind: "interrupted",
      ref: `run:${run.id}#interrupted`,
      at: run.completedAt ?? run.updatedAt ?? run.createdAt ?? null,
      summary: "No durable settlement was captured",
    };
  }
  return {
    kind: "created",
    ref: thread.originMessageRef ?? `thread:${thread.id}#created`,
    at: thread.updatedAt ?? thread.createdAt ?? null,
    summary: null,
  };
}

function itemFor({ ventureId, thread, runs, activeByRun, receiptByRun, decisionsById }) {
  const latestRun = newest(runs, (run) => {
    const active = activeByRun.get(run.id);
    const receipt = receiptByRun.get(run.id);
    return active?.abortRequestedAt ?? active?.startedAt ?? receipt?.createdAt ?? run.completedAt ?? run.updatedAt ?? run.createdAt;
  });
  const activeDrive = latestRun ? activeByRun.get(latestRun.id) ?? null : null;
  const receipt = latestRun ? receiptByRun.get(latestRun.id) ?? null : null;
  const terminal = terminalFor(latestRun, receipt, activeDrive);
  const pendingDecision = decisionEvent(runs, decisionsById);
  const latestMeaningfulEvent = latestEvent({ thread, run: latestRun, activeDrive, receipt, pendingDecision });
  const unread = thread.reviewedThrough !== latestMeaningfulEvent.ref;
  const attention = pendingDecision
    ? "decision"
    : ["failed", "interrupted"].includes(terminal)
      ? "failure"
      : unread && terminal != null
        ? "review"
        : "none";
  const subjectRefs = [...new Set(list(thread.subjectRefs))];
  return {
    threadRef: `thread:${thread.id}`,
    ventureRef: `venture:${ventureId}`,
    parentThreadRef: thread.parentThreadRef ?? null,
    originMessageRef: thread.originMessageRef ?? null,
    subjectRefs,
    focusRef: subjectRefs.find((ref) => String(ref).startsWith("bet:")) ?? `thread:${thread.id}`,
    founderIntent: thread.name,
    lifecycle: thread.lifecycle ?? "open",
    activity: activityFor(activeDrive),
    attention,
    terminal,
    unread,
    reviewedThrough: thread.reviewedThrough ?? null,
    latestMeaningfulEvent,
    runRefs: runs.map((run) => `run:${run.id}`),
    createdAt: thread.createdAt ?? null,
    updatedAt: latestMeaningfulEvent.at ?? thread.updatedAt ?? thread.createdAt ?? null,
  };
}

export function projectWorkIndex({ ventureId, model, activeDrives = [], receipts = [], decisions = [] } = {}) {
  if (!ventureId || !model) throw Object.assign(new Error("A work index needs venture truth."), { code: "work_index_invalid", status: 400 });
  const activeByRun = new Map(list(activeDrives).map((drive) => [drive.id, drive]));
  const receiptByRun = new Map(list(receipts).map((receipt) => [String(receipt.runRef ?? "").replace(/^run:/, ""), receipt]));
  const decisionsById = new Map(list(decisions).filter((decision) => decision?.id).map((decision) => [decision.id, decision]));
  const runsByThread = new Map();
  for (const run of list(model.runs)) {
    if (!runsByThread.has(run.threadRef)) runsByThread.set(run.threadRef, []);
    runsByThread.get(run.threadRef).push(run);
  }
  const items = list(model.threads)
    .filter((thread) => thread.id !== ROOT_THREAD_ID)
    .map((thread) => itemFor({
      ventureId,
      thread,
      runs: runsByThread.get(`thread:${thread.id}`) ?? [],
      activeByRun,
      receiptByRun,
      decisionsById,
    }))
    .sort((a, b) => {
      const priority = (item) => item.attention === "decision"
        ? 0
        : item.attention === "failure"
          ? 1
          : item.activity !== "idle"
            ? 2
            : item.attention === "review"
              ? 3
              : 4;
      const ranked = priority(a) - priority(b);
      if (ranked) return ranked;
      const unread = Number(b.unread) - Number(a.unread);
      if (unread) return unread;
      return time(b.updatedAt) - time(a.updatedAt) || a.threadRef.localeCompare(b.threadRef);
    });
  const indexedRuns = new Set(items.flatMap((item) => item.runRefs));
  return {
    ventureId,
    revision: model.revision,
    items,
    outline: projectOutline(model, items),
    counts: {
      total: items.length,
      attention: items.filter((item) => item.attention !== "none").length,
      active: items.filter((item) => item.activity !== "idle").length,
      unread: items.filter((item) => item.unread).length,
    },
    legacy: {
      unindexedRunCount: list(model.runs).filter((run) => !indexedRuns.has(`run:${run.id}`)).length,
    },
  };
}

export function buildWorkIndex(ventureId, options = {}) {
  return projectWorkIndex({
    ventureId,
    model: getSemanticModel(ventureId, options),
    activeDrives: listActiveDrives(ventureId),
    receipts: listVentureDocs(ventureId, "receipts", options),
    decisions: listVentureDocs(ventureId, "decisions", options),
  });
}
