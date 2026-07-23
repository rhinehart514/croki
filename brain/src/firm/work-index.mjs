// Production read model for returning to founder-directed work. Threads own durable identity and review;
// Runs, live drives, settlement receipts, and wall decisions remain the authoritative state sources.
// This module joins them without storing a second status model for the rail to drift from.

import { listActiveDrives } from "./active-drives.mjs";
import { codeDriftForVenture, newestCodeDriftByThread } from "./git-ship.mjs";
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

// Just-touched work keeps its place above the quiet divider for this long. Two minutes mirrors the
// adoption grace window T3 Code uses for the same partition: long enough that a message whose run has
// not registered yet is never mistaken for finished work, short enough that stale rows settle.
export const SETTLED_ACTIVITY_GRACE_MS = 2 * 60 * 1_000;

// Settled is derived at read time from real state, like every other facet here — never stored, so it
// cannot drift. Anything blocked on the founder or still moving is active; the two-sided grace bound
// keeps a skewed future timestamp from pinning a row active for the whole skew, and a row with no
// honest timestamp at all stays active rather than being quietly filed away.
function settledFor({ pendingDecision, activity, lastActivityMs, now }) {
  if (pendingDecision) return false;
  if (activity !== "idle") return false;
  if (!lastActivityMs) return false;
  return Math.abs(now - lastActivityMs) > SETTLED_ACTIVITY_GRACE_MS;
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
      at: activeDrive.abortRequestedAt ?? activeDrive.lastBeatAt ?? activeDrive.startedAt ?? activeDrive.queuedAt ?? run.createdAt ?? null,
      summary: kind === "stopping" ? "Stop requested" : kind === "queued" ? "Queued" : activeDrive.activity ?? "In progress",
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

function itemFor({ ventureId, thread, runs, activeByRun, receiptByRun, decisionsById, now }) {
  const latestRun = newest(runs, (run) => {
    const active = activeByRun.get(run.id);
    const receipt = receiptByRun.get(run.id);
    return active?.abortRequestedAt ?? active?.lastBeatAt ?? active?.startedAt ?? receipt?.createdAt ?? run.completedAt ?? run.updatedAt ?? run.createdAt;
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
  const betIds = new Set(runs.flatMap((run) => list(run.betRefs)).map((ref) => String(ref).replace(/^bet:/, "")));
  const relevantDrives = [...activeByRun.values()].filter((drive) => runs.some((run) => run.id === drive.id) || betIds.has(drive.betId));
  const participantRefs = [...new Set([
    ...list(thread.participantRefs),
    ...runs.flatMap((run) => list(run.participantRefs)),
    ...relevantDrives.map((drive) => drive.teammateRef).filter(Boolean),
  ])];
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
    settled: settledFor({
      pendingDecision,
      activity: activityFor(activeDrive),
      lastActivityMs: Math.max(time(latestMeaningfulEvent.at), time(thread.updatedAt), time(thread.createdAt)),
      now,
    }),
    reviewedThrough: thread.reviewedThrough ?? null,
    latestMeaningfulEvent,
    runRefs: runs.map((run) => `run:${run.id}`),
    betRefs: [...new Set(runs.flatMap((run) => list(run.betRefs)))],
    decisionRefs: [...new Set(runs.flatMap((run) => list(run.decisionRefs)))],
    outcomeRefs: [...new Set(runs.flatMap((run) => list(run.outcomeRefs)))],
    pinnedAt: thread?.properties?.navigation?.pinnedAt ?? null,
    participantRefs,
    activeParticipantRefs: [...new Set(relevantDrives.map((drive) => drive.teammateRef).filter(Boolean))],
    createdAt: thread.createdAt ?? null,
    updatedAt: latestMeaningfulEvent.at ?? thread.updatedAt ?? thread.createdAt ?? null,
  };
}

function searchable(value) {
  try { return JSON.stringify(value ?? "").toLocaleLowerCase(); } catch { return String(value ?? "").toLocaleLowerCase(); }
}

function searchMatches(item, query, { messages, bets, decisions, outcomes }) {
  const needle = String(query ?? "").trim().toLocaleLowerCase();
  if (!needle) return [];
  const refs = [];
  const betIds = new Set([...item.subjectRefs, ...item.betRefs].filter((ref) => ref.startsWith("bet:")).map((ref) => ref.slice(4)));
  if (searchable(item.founderIntent).includes(needle)) refs.push({ kind: "message", ref: item.originMessageRef ?? item.threadRef, label: item.founderIntent });
  for (const message of messages) {
    const exact = item.originMessageRef === `conversation:${message.id}` || item.threadMessageRefs?.includes(`conversation:${message.id}`);
    if ((!exact && !betIds.has(message.betId)) || !searchable(message.content).includes(needle)) continue;
    refs.push({ kind: "message", ref: `conversation:${message.id}`, label: String(message.content).slice(0, 120) });
  }
  for (const bet of bets) {
    if (!betIds.has(bet.id)) continue;
    for (const artifact of list(bet.staged)) {
      if (!searchable([artifact.title, artifact.content]).includes(needle)) continue;
      refs.push({ kind: "artifact", ref: `work:${artifact.id}`, label: artifact.title ?? "Visual work" });
    }
    for (const evidence of list(bet.evidence)) {
      if (!searchable(evidence).includes(needle)) continue;
      refs.push({ kind: "evidence", ref: evidence.id ? `evidence:${evidence.id}` : `bet:${bet.id}#evidence`, label: evidence.title ?? evidence.summary ?? "Evidence" });
    }
  }
  const runIds = new Set(item.runRefs.map((ref) => ref.slice(4)));
  const decisionIds = new Set(item.decisionRefs.map((ref) => String(ref).replace(/^decision:/, "")));
  const outcomeIds = new Set(item.outcomeRefs.map((ref) => String(ref).replace(/^outcome:/, "")));
  for (const decision of decisions) {
    if (!betIds.has(decision.betId) && !decisionIds.has(decision.id) && !runIds.has(String(decision.runRef ?? "").replace(/^run:/, ""))) continue;
    if (searchable(decision).includes(needle)) refs.push({ kind: "decision", ref: `decision:${decision.id}`, label: decision.summary ?? decision.purpose ?? "Decision" });
  }
  for (const outcome of outcomes) {
    if (!betIds.has(outcome.betId) && !outcomeIds.has(outcome.id)) continue;
    if (searchable(outcome).includes(needle)) refs.push({ kind: "evidence", ref: `outcome:${outcome.id}`, label: outcome.summary ?? outcome.kind ?? "Outcome" });
  }
  return refs;
}

function legacyFamilies(bets) {
  const byId = new Map(list(bets).map((bet) => [bet.id, bet]));
  const rootFor = (bet) => {
    let current = bet;
    const seen = new Set();
    while (current?.forkedFrom && byId.has(current.forkedFrom) && !seen.has(current.forkedFrom)) {
      seen.add(current.id);
      current = byId.get(current.forkedFrom);
    }
    return current ?? bet;
  };
  const families = new Map();
  for (const bet of list(bets)) {
    const root = rootFor(bet);
    if (!families.has(root.id)) families.set(root.id, { root, bets: [] });
    families.get(root.id).bets.push(bet);
  }
  return [...families.values()];
}

function legacyItemsFor({ ventureId, bets, messages, decisions, outcomes, activeDrives, now }) {
  return legacyFamilies(bets).map((family) => {
    const ids = new Set(family.bets.map((bet) => bet.id));
    const familyMessages = list(messages).filter((message) => ids.has(message.betId));
    const familyDecisions = list(decisions).filter((decision) => ids.has(decision.betId));
    const pending = newest(familyDecisions.filter((decision) => decision.decision == null), (decision) => decision.updatedAt ?? decision.createdAt ?? decision.parkedAt);
    const familyOutcomes = list(outcomes).filter((outcome) => ids.has(outcome.betId));
    const latestOutcome = newest(familyOutcomes, (outcome) => outcome.updatedAt ?? outcome.createdAt ?? outcome.observedAt);
    const drives = list(activeDrives).filter((drive) => ids.has(drive.betId));
    const latestDrive = newest(drives, (drive) => drive.abortRequestedAt ?? drive.startedAt);
    const latestBet = newest(family.bets, (bet) => bet.updatedAt ?? bet.endedAt ?? list(bet.events).at(-1)?.at ?? bet.createdAt);
    // Only an exact bet-scoped message may name a legacy thread. A merely-nearby unscoped founder
    // message can have produced several sibling roots, and assigning that same sentence to every row
    // makes distinct historical work indistinguishable in the rail. When the exact join is absent, the
    // durable bet intent is the honest compatibility label.
    const founder = familyMessages.find((message) => message.role === "founder") ?? null;
    const latestMeaningfulEvent = pending
      ? { kind: "decision", ref: `decision:${pending.id}`, at: pending.updatedAt ?? pending.createdAt ?? pending.parkedAt ?? null, summary: "Founder decision required" }
      : latestDrive
        ? { kind: activityFor(latestDrive), ref: `run:${latestDrive.id}#${activityFor(latestDrive)}`, at: latestDrive.abortRequestedAt ?? latestDrive.startedAt ?? null, summary: "In progress" }
        : latestOutcome
          ? { kind: "outcome", ref: `outcome:${latestOutcome.id}`, at: latestOutcome.updatedAt ?? latestOutcome.createdAt ?? latestOutcome.observedAt ?? null, summary: latestOutcome.summary ?? latestOutcome.body ?? "Evidence returned" }
          : { kind: "created", ref: `bet:${family.root.id}#legacy`, at: latestBet?.updatedAt ?? latestBet?.createdAt ?? null, summary: null };
    const lifecycle = family.bets.every((bet) => bet.endedAt) ? "closed" : "open";
    return {
      threadRef: `thread:legacy-${family.root.id}`,
      ventureRef: `venture:${ventureId}`,
      parentThreadRef: `thread:${ROOT_THREAD_ID}`,
      originMessageRef: founder ? `conversation:${founder.id}` : null,
      subjectRefs: family.bets.map((bet) => `bet:${bet.id}`),
      focusRef: `bet:${family.root.id}`,
      founderIntent: founder?.content ?? family.root.intent ?? "Founder direction",
      lifecycle,
      activity: activityFor(latestDrive),
      attention: pending ? "decision" : latestOutcome ? "review" : "none",
      terminal: lifecycle === "closed" ? "completed" : null,
      unread: Boolean(pending || latestOutcome),
      settled: settledFor({
        pendingDecision: pending,
        activity: activityFor(latestDrive),
        lastActivityMs: Math.max(time(latestMeaningfulEvent.at), time(latestBet?.updatedAt), time(latestBet?.createdAt)),
        now,
      }),
      reviewedThrough: null,
      latestMeaningfulEvent,
      runRefs: [],
      betRefs: family.bets.map((bet) => `bet:${bet.id}`),
      decisionRefs: familyDecisions.map((decision) => `decision:${decision.id}`),
      outcomeRefs: familyOutcomes.map((outcome) => `outcome:${outcome.id}`),
      threadMessageRefs: familyMessages.map((message) => `conversation:${message.id}`),
      pinnedAt: null,
      participantRefs: [...new Set(family.bets.map((bet) => bet.teammateRef).filter(Boolean))],
      activeParticipantRefs: [...new Set(drives.map((drive) => drive.teammateRef).filter(Boolean))],
      createdAt: family.root.createdAt ?? null,
      updatedAt: latestMeaningfulEvent.at ?? latestBet?.updatedAt ?? latestBet?.createdAt ?? null,
      legacy: true,
    };
  });
}

function workPriority(item) {
  return item.attention === "decision" ? 0
    : item.attention === "failure" ? 1
      : item.activity !== "idle" ? 2
        : item.attention === "review" ? 3 : 4;
}

function compareWorkItems(a, b) {
  const ranked = workPriority(a) - workPriority(b);
  if (ranked) return ranked;
  const unread = Number(b.unread) - Number(a.unread);
  if (unread) return unread;
  return time(b.updatedAt) - time(a.updatedAt) || a.threadRef.localeCompare(b.threadRef);
}

export function projectWorkIndex({ ventureId, model, activeDrives = [], receipts = [], decisions = [], messages = [], bets = [], outcomes = [], codeDrift = [], query = "", now = Date.now() } = {}) {
  if (!ventureId || !model) throw Object.assign(new Error("A work index needs venture truth."), { code: "work_index_invalid", status: 400 });
  const driftByThread = newestCodeDriftByThread(list(codeDrift));
  const activeByRun = new Map(list(activeDrives).map((drive) => [drive.id, drive]));
  const receiptByRun = new Map(list(receipts).map((receipt) => [String(receipt.runRef ?? "").replace(/^run:/, ""), receipt]));
  const decisionsById = new Map(list(decisions).filter((decision) => decision?.id).map((decision) => [decision.id, decision]));
  const runsByThread = new Map();
  for (const run of list(model.runs)) {
    if (!runsByThread.has(run.threadRef)) runsByThread.set(run.threadRef, []);
    runsByThread.get(run.threadRef).push(run);
  }
  const canonicalItems = list(model.threads)
    .filter((thread) => thread.id !== ROOT_THREAD_ID && !thread.deletedAt)
    .map((thread) => itemFor({
      ventureId,
      thread,
      runs: runsByThread.get(`thread:${thread.id}`) ?? [],
      activeByRun,
      receiptByRun,
      decisionsById,
      now,
    }))
    .map((item) => ({
      ...item,
      drift: driftByThread.get(item.threadRef) ?? null,
      threadMessageRefs: list(model.threads.find((thread) => `thread:${thread.id}` === item.threadRef)?.messageRefs),
    }))
    .sort(compareWorkItems);
  const canonicalBetIds = new Set([
    ...list(model.threads).flatMap((thread) => list(thread.subjectRefs)),
    ...list(model.runs).flatMap((run) => list(run.betRefs)),
  ].filter((ref) => String(ref).startsWith("bet:")).map((ref) => String(ref).replace(/^bet:/, "")));
  const legacyBets = list(bets).filter((bet) => !canonicalBetIds.has(bet.id));
  // Migration is additive: creating the first canonical Thread must not make every older direction
  // disappear. Project unclaimed bet families beside canonical threads until exact joins exist.
  const legacyItems = legacyItemsFor({ ventureId, bets: legacyBets, messages, decisions, outcomes, activeDrives, now });
  const allItems = [...canonicalItems, ...legacyItems].sort(compareWorkItems);
  const items = String(query ?? "").trim()
    ? allItems.map((item) => ({ ...item, matchRefs: searchMatches(item, query, { messages, bets, decisions, outcomes }) }))
      .filter((item) => item.matchRefs.length)
    : allItems;
  for (const item of items) {
    delete item.threadMessageRefs;
    delete item.betRefs;
    delete item.decisionRefs;
    delete item.outcomeRefs;
  }
  const indexedRuns = new Set(allItems.flatMap((item) => item.runRefs));
  return {
    ventureId,
    revision: model.revision,
    items,
    outline: projectOutline(model, allItems),
    counts: {
      total: allItems.length,
      attention: allItems.filter((item) => item.attention !== "none").length,
      active: allItems.filter((item) => item.activity !== "idle").length,
      unread: allItems.filter((item) => item.unread).length,
      matchCount: items.length,
    },
    legacy: {
      unindexedRunCount: list(model.runs).filter((run) => !indexedRuns.has(`run:${run.id}`)).length,
    },
  };
}

export function buildWorkIndex(ventureId, options = {}) {
  const messages = listVentureDocs(ventureId, "conversation", options);
  const bets = listVentureDocs(ventureId, "bets", options);
  const outcomes = listVentureDocs(ventureId, "outcomes", options);
  let codeDrift = [];
  try { codeDrift = codeDriftForVenture(ventureId, options); } catch { /* drift is informative only */ }
  return projectWorkIndex({
    ventureId,
    model: getSemanticModel(ventureId, options),
    activeDrives: listActiveDrives(ventureId),
    receipts: listVentureDocs(ventureId, "receipts", options),
    decisions: listVentureDocs(ventureId, "decisions", options),
    messages,
    bets,
    outcomes,
    codeDrift,
    query: options.query ?? "",
  });
}
