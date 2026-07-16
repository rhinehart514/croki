// Read-only Atlas projection: durable architecture plus live bet/work/wall/outcome truth. Projection
// reasons are derived and explicit; no score, confidence field, or causal claim is persisted here.

import { getArchitecture } from "./architecture.mjs";
import { getCurrentWorkingTheory } from "./architecture-proposals.mjs";
import { listVentureDocs } from "./venture-store.mjs";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function newest(items, field) {
  return items.slice().sort((left, right) => String(right?.[field] ?? "").localeCompare(String(left?.[field] ?? "")));
}

function campaignBetIds(campaign) {
  return [...new Set([campaign.governingBetId, ...list(campaign.supportingBetIds)].filter(Boolean))];
}

function campaignsForBet(campaigns, betId) {
  return campaigns.filter((campaign) => campaignBetIds(campaign).includes(betId));
}

function joinedLiveState(ventureId, document, options) {
  const bets = listVentureDocs(ventureId, "bets", options);
  const decisions = listVentureDocs(ventureId, "decisions", options);
  const outcomes = listVentureDocs(ventureId, "outcomes", options);
  const campaigns = document.elements.filter((entry) => entry.role === "campaign");
  const joinedBets = bets.flatMap((bet) => {
    const related = campaignsForBet(campaigns, bet.id);
    return related.map((campaign) => ({
      id: bet.id,
      campaignId: campaign.id,
      motionIds: campaign.motionIds,
      relation: campaign.governingBetId === bet.id ? "governing" : "supporting",
      intent: bet.intent,
      endedAt: bet.endedAt ?? null,
      architectureRevision: bet.architectureRevision ?? null,
      basis: "campaign-contract",
    }));
  });
  const work = bets.flatMap((bet) => list(bet.staged).flatMap((artifact) => {
    const related = campaignsForBet(campaigns, bet.id);
    return related.map((campaign) => ({
      id: artifact.id,
      betId: bet.id,
      campaignId: campaign.id,
      title: artifact.title ?? null,
      kind: artifact.kind ?? "artifact",
      stagedAt: artifact.stagedAt ?? null,
      updatedAt: artifact.updatedAt ?? null,
      architectureRevision: artifact.architectureRevision ?? bet.architectureRevision ?? null,
      exact: true,
      basis: "staged-work",
    }));
  }));
  const wall = decisions.flatMap((item) => {
    const related = campaignsForBet(campaigns, item.betId);
    return related.map((campaign) => ({
      id: item.id,
      betId: item.betId,
      workRef: item.workRef ?? null,
      campaignId: campaign.id,
      purpose: item.purpose ?? null,
      decision: item.decision ?? null,
      parkedAt: item.parkedAt ?? null,
      decidedAt: item.decidedAt ?? null,
      architectureRevision: item.architectureRevision ?? null,
      exact: true,
      basis: "wall-receipt",
    }));
  });
  const joinedOutcomes = outcomes.map((outcome) => {
    const related = outcome.betId ? campaignsForBet(campaigns, outcome.betId) : [];
    const exactWall = outcome.workRef
      ? decisions.find((item) => item.workRef === outcome.workRef && item.betId === outcome.betId && item.decision === "release")
      : null;
    return {
      id: outcome.id,
      betId: outcome.betId ?? null,
      workRef: outcome.workRef ?? null,
      campaignIds: related.map((entry) => entry.id),
      motionIds: [...new Set(related.flatMap((entry) => entry.motionIds))],
      outcomeKind: outcome.outcomeKind ?? null,
      body: outcome.body ?? null,
      source: outcome.source ?? null,
      observedAt: outcome.observedAt ?? null,
      attribution: outcome.attribution ?? "unattributed",
      join: exactWall
        ? { level: "exact", basis: "executed-wall-receipt", wallItemId: exactWall.id, causal: false }
        : related.length
          ? { level: "contextual", basis: "campaign-bet-contract", architectureRevision: outcome.architectureRevision ?? null, causal: false }
          : { level: "unattributed", basis: null, causal: false },
    };
  });
  return { bets: joinedBets, work, wall, outcomes: newest(joinedOutcomes, "observedAt") };
}

function derivePressure(document, joins) {
  const pressure = [];
  const campaigns = document.elements.filter((entry) => entry.role === "campaign");
  const motions = document.elements.filter((entry) => entry.role === "motion");
  const evidenceBySubject = new Map();
  for (const annotation of document.evidenceAnnotations) {
    const id = String(annotation.subjectRef).replace(/^architecture:/, "").split("#")[0];
    const entries = evidenceBySubject.get(id) ?? [];
    entries.push(annotation);
    evidenceBySubject.set(id, entries);
    if (annotation.stance === "challenges") pressure.push({ subjectId: id, reason: "challenged-claim", sourceRef: annotation.evidenceRef, detail: annotation.note });
  }
  for (const item of joins.wall.filter((entry) => !entry.decision)) {
    // Founder-facing detail is ordinary language (contract §4): the internal "wall" noun never
    // renders. sourceRef keeps the wall-item: identifier — a compatibility seam, never shown as copy.
    pressure.push({ subjectId: item.campaignId, reason: "held-release", sourceRef: `wall-item:${item.id}`, detail: "An exact act is waiting for your hand." });
  }
  for (const motion of motions) {
    if (!list(motion.productRefs).length) pressure.push({ subjectId: motion.id, reason: "missing-product-capability", sourceRef: null, detail: "This route is not yet grounded in how the product creates value." });
    const campaignIds = campaigns.filter((entry) => list(entry.motionIds).includes(motion.id)).map((entry) => entry.id);
    const hasReturnedEvidence = joins.outcomes.some((entry) => entry.motionIds.includes(motion.id));
    if (campaignIds.length && !hasReturnedEvidence && !evidenceBySubject.has(motion.id)) pressure.push({ subjectId: motion.id, reason: "missing-evidence", sourceRef: null, detail: "An active route has no attributable return yet." });
  }
  const systems = document.elements.filter((entry) => entry.role === "system");
  for (const system of systems) {
    const usingMotions = motions.filter((motion) => list(motion.systemIds).includes(system.id));
    const activeMotions = usingMotions.filter((motion) => campaigns.some((campaign) => list(campaign.motionIds).includes(motion.id)));
    if (activeMotions.length > 1) pressure.push({ subjectId: system.id, reason: "shared-system-contention", sourceRef: null, detail: `${activeMotions.length} active motions depend on this shared capability.`, motionIds: activeMotions.map((entry) => entry.id) });
  }
  for (const betJoin of joins.bets) {
    const work = joins.work.filter((entry) => entry.betId === betJoin.id);
    // Founder-facing detail is ordinary language (contract §4): "effort", not the internal "bet".
    // sourceRef keeps the bet: identifier — a compatibility seam, never rendered as copy.
    if (!work.length && !betJoin.endedAt) pressure.push({ subjectId: betJoin.campaignId, reason: "blocked-work", sourceRef: `bet:${betJoin.id}`, detail: "This effort has no prepared work yet." });
  }
  for (const outcome of joins.outcomes.filter((entry) => entry.join.level === "unattributed")) {
    pressure.push({ subjectId: null, reason: "unattributed-return", sourceRef: `outcome:${outcome.id}`, detail: "Reality returned without a supported architecture join." });
  }
  return pressure;
}

function elementLive(element, document, joins, pressure) {
  const elementPressure = pressure.filter((entry) => entry.subjectId === element.id);
  if (element.role === "system") {
    const motions = document.elements.filter((entry) => entry.role === "motion" && list(entry.systemIds).includes(element.id));
    return { motionIds: motions.map((entry) => entry.id), shared: motions.length > 1, pressure: elementPressure };
  }
  if (element.role === "motion") {
    const campaigns = document.elements.filter((entry) => entry.role === "campaign" && list(entry.motionIds).includes(element.id));
    return { campaignIds: campaigns.map((entry) => entry.id), outcomeIds: joins.outcomes.filter((entry) => entry.motionIds.includes(element.id)).map((entry) => entry.id), pressure: elementPressure };
  }
  if (element.role === "campaign") {
    return {
      bets: joins.bets.filter((entry) => entry.campaignId === element.id),
      work: joins.work.filter((entry) => entry.campaignId === element.id),
      wall: joins.wall.filter((entry) => entry.campaignId === element.id),
      outcomes: joins.outcomes.filter((entry) => entry.campaignIds.includes(element.id)),
      pressure: elementPressure,
    };
  }
  return { pressure: elementPressure };
}

function projectWorkingTheory(ventureId, options) {
  const theory = getCurrentWorkingTheory(ventureId, options);
  if (!theory) return null;
  const bets = listVentureDocs(ventureId, "bets", options);
  const decisions = listVentureDocs(ventureId, "decisions", options);
  const outcomes = listVentureDocs(ventureId, "outcomes", options);
  const requestedWorkRefs = new Set(
    [...theory.subjects, ...theory.relationships].flatMap((entry) => entry.workRefs ?? []),
  );
  const work = bets.flatMap((bet) => list(bet.staged)
    .filter((item) => requestedWorkRefs.has(item.id))
    .map((item) => ({ ...item, betId: bet.id, exact: true, basis: "working-theory-anchor" })));
  const workRefs = new Set(work.map((item) => item.id));
  const wall = decisions.filter((item) => item.workRef && workRefs.has(item.workRef)).map((item) => ({ ...item, exact: true, basis: "work-ref" }));
  const returned = outcomes.filter((item) => item.workRef && workRefs.has(item.workRef)).map((item) => ({ ...item, exact: true, causal: false, basis: "work-ref" }));
  const {
    operations: _operations,
    configurationRevision: _configurationRevision,
    decidedAt: _decidedAt,
    decision: _decision,
    ...visible
  } = theory;
  return { ...visible, joins: { work, wall, outcomes: returned } };
}

export function buildArchitectureProjection(ventureId, options = {}) {
  const document = getArchitecture(ventureId, options);
  const workingTheory = projectWorkingTheory(ventureId, options);
  const joins = joinedLiveState(ventureId, document, options);
  const pressure = derivePressure(document, joins);
  const elements = document.elements.map((element) => ({ ...element, live: elementLive(element, document, joins, pressure) }));
  const outline = elements.map((element) => ({
    id: element.id,
    role: element.role,
    name: element.name,
    relationshipCount: document.connections.filter((entry) => entry.fromRef.includes(element.id) || entry.toRef.includes(element.id)).length,
    pressureReasons: pressure.filter((entry) => entry.subjectId === element.id).map((entry) => entry.reason),
  }));
  return {
    ventureId,
    document,
    revision: document.revision,
    elements,
    connections: document.connections,
    groups: document.groups,
    evidenceAnnotations: document.evidenceAnnotations,
    pressure,
    joins,
    outline,
    workingTheory,
    omissions: {
      historicalRevisions: true,
      machinery: true,
      unassignedBets: listVentureDocs(ventureId, "bets", options).filter((bet) => !joins.bets.some((entry) => entry.id === bet.id)).length,
    },
  };
}

export function explainArchitecturePressure(ventureId, subjectId = null, options = {}) {
  const projection = buildArchitectureProjection(ventureId, options);
  return {
    revision: projection.revision,
    pressure: subjectId ? projection.pressure.filter((entry) => entry.subjectId === subjectId) : projection.pressure,
    note: "Each reason is derived independently; Drover does not assign an architecture health score.",
  };
}
