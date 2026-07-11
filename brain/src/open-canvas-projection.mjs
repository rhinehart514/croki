// Read-only projection of the provider-neutral goal and open-work authorities into the
// canonical woven canvas. The authorities remain the source of truth; this module only adds
// addressable anchors, explanatory relationships, and honest resolution issues.

import { detectGoalConflicts } from "./goal-conflicts.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function stableRef(value, fallbackType = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const type = clean(value.type ?? value.kind ?? fallbackType).toLowerCase();
  const id = clean(value.id ?? value.ref ?? value.key);
  return type && id ? { type, id } : null;
}

function refKey(ref) {
  return ref?.type && ref?.id ? `${ref.type}:${ref.id}` : null;
}

function recordProject(record) {
  return clean(record?.projectId ?? record?.project);
}

function active(records, includeRetired) {
  return (Array.isArray(records) ? records : []).filter((record) => includeRetired || !record?.retiredAt);
}

function compareRef(left, right) {
  return refKey(left)?.localeCompare(refKey(right)) ?? 0;
}

function sameConflictReceipt(conflict, decision) {
  if (!decision || clean(decision.conflictId) !== clean(conflict.id)) return false;
  if (refKey(stableRef(decision.objectRef)) !== refKey(stableRef(conflict.objectRef))) return false;
  const left = (decision.goalRefs ?? []).map((ref) => refKey(stableRef(ref))).filter(Boolean).sort();
  const right = (conflict.goalRefs ?? []).map((ref) => refKey(stableRef(ref))).filter(Boolean).sort();
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function authority(owner, record, projectId, id) {
  return {
    owner,
    id,
    projectId,
    revision: Number.isInteger(record?.revision) ? record.revision : 0,
    updatedAt: record?.updatedAt ?? record?.createdAt ?? null,
  };
}

function goalAnchor(goal, projectId) {
  return {
    id: `anchor:goal:${goal.id}`,
    ref: { type: "goal", id: goal.id },
    kind: "goal",
    label: goal.statement,
    body: goal,
    facets: {
      authority: "goal",
      semantic: "goal",
      epistemic: "founder-intent",
      status: goal.status ?? "active",
    },
    capabilities: {
      inspect: true,
      revise: true,
      relate: true,
      changeStatus: true,
      retire: true,
      history: false,
    },
    authority: authority("goal-store", goal, projectId, goal.id),
  };
}

function artifactAnchor(artifact, projectId) {
  const id = clean(artifact.artifactId ?? artifact.id);
  const kind = clean(artifact.kind) || "work-object";
  return {
    id: `anchor:work-artifact:${id}`,
    ref: { type: "work-artifact", id },
    // Business kinds are intentionally open. Known facts, inferences, decisions, and outcomes
    // therefore remain different kinds rather than collapsing into a generic "artifact" card.
    kind,
    label: clean(artifact.title ?? artifact.summary) || id,
    body: artifact,
    facets: {
      authority: "open-work",
      semantic: kind,
      epistemic: clean(artifact.provenance) || "unspecified",
      contentType: clean(artifact.contentType) || "application/json",
      format: clean(artifact.format) || "json",
      status: clean(artifact.status) || "active",
    },
    capabilities: {
      inspect: true,
      revise: true,
      relate: true,
      changeStatus: false,
      retire: true,
      history: true,
    },
    authority: authority("work-artifact-store", artifact, projectId, id),
  };
}

function productChangeAnchor(change, projectId) {
  const id = clean(change?.id);
  return {
    id: `anchor:product-change:${id}`,
    ref: { type: "product-change", id },
    kind: "code-change",
    label: clean(change?.title) || id,
    body: change,
    facets: {
      authority: "product-change",
      semantic: "code-change",
      epistemic: "generated",
      contentType: "text/x-diff",
      status: clean(change?.reviewRevision?.status ?? change?.status) || "unknown",
      provider: clean(change?.provider) || null,
      model: clean(change?.model) || null,
    },
    capabilities: { inspect: true, revise: false, relate: true, review: true, retire: false, history: true },
    authority: authority("product-change-receipts", change?.reviewRevision ?? change, projectId, id),
  };
}

function regionAnchor(region, projectId) {
  return {
    id: `anchor:work-region:${region.id}`,
    ref: { type: "work-region", id: region.id },
    kind: "work-region",
    label: region.title,
    body: region,
    facets: {
      authority: "canvas-region",
      semantic: "spatial-region",
      status: region.archivedAt ? "archived" : "active",
      collapsed: Boolean(region.collapsed),
    },
    capabilities: { inspect: true, revise: true, relate: false, retire: true, history: false },
    authority: authority("canvas-region-store", region, projectId, region.id),
  };
}

function issueKey(issue) {
  return `${clean(issue?.kind)}|${clean(issue?.ref)}|${clean(issue?.owner)}|${clean(issue?.projectId)}`;
}

function relationSignature(source, target, kind) {
  return `${refKey(source)}|${clean(kind)}|${refKey(target)}`;
}

function relationReceipt(record, type, id) {
  return {
    recordRef: { type, id },
    revision: Number.isInteger(record?.revision) ? record.revision : 0,
    provenance: record?.provenance ?? record?.declaredProvenance ?? null,
    basis: Array.isArray(record?.basis) ? record.basis : [],
    createdBy: record?.createdBy ?? null,
    // Provider details stay attributable on source receipts, never in the authority owner/type.
    modelReceipts: Array.isArray(record?.modelReceipts) ? record.modelReceipts : [],
    toolReceipts: Array.isArray(record?.toolReceipts) ? record.toolReceipts : [],
  };
}

/**
 * Add multi-goal and open-work records to an already canonical woven canvas.
 * This function is pure: it neither reads stores nor mutates the supplied canvas or records.
 */
export function projectOpenCanvas(canvas = {}, input = {}, options = {}) {
  const projectId = clean(input.projectId ?? options.projectId);
  if (!projectId) throw new Error("A projectId is required to project open canvas work.");
  const includeRetired = options.includeRetired === true;
  const projected = structuredClone(canvas ?? {});
  projected.anchors = Array.isArray(projected.anchors) ? projected.anchors : [];
  projected.relationships = Array.isArray(projected.relationships) ? projected.relationships : [];
  projected.regions = Array.isArray(projected.regions) ? projected.regions : [];
  // Conflicts are derived from the current authority heads on every projection; never carry a stale
  // detection forward from an older canvas snapshot.
  projected.conflicts = [];
  projected.state = projected.state && typeof projected.state === "object"
    ? projected.state
    : { kind: "empty", stale: false, issues: [] };
  projected.state.issues = Array.isArray(projected.state.issues) ? projected.state.issues : [];

  const issues = [...projected.state.issues];
  const anchorKeys = new Set(projected.anchors.map((item) => refKey(item?.ref)).filter(Boolean));
  const newAnchors = [];
  const foreign = [];
  const acceptRecord = (record, owner, identity) => {
    const ownerProject = recordProject(record);
    if (!ownerProject || ownerProject === projectId) return true;
    foreign.push({
      kind: "project-mismatch",
      ref: `${owner}:${identity}`,
      owner,
      projectId: ownerProject,
    });
    return false;
  };

  const goals = active(input.goals, includeRetired)
    .filter((goal) => acceptRecord(goal, "goal-store", clean(goal?.id)))
    .sort((a, b) => clean(a.id).localeCompare(clean(b.id)));
  const artifacts = active(input.artifacts, includeRetired)
    .filter((item) => acceptRecord(item, "work-artifact-store", clean(item?.artifactId ?? item?.id)))
    .sort((a, b) => clean(a.artifactId ?? a.id).localeCompare(clean(b.artifactId ?? b.id)));
  const productChanges = (Array.isArray(input.productChanges) ? input.productChanges : [])
    .filter((item) => acceptRecord(item, "product-change-receipts", clean(item?.id)))
    .filter((item) => clean(item?.id))
    .sort((a, b) => clean(a.id).localeCompare(clean(b.id)));
  const regions = (Array.isArray(input.regions) ? input.regions : [])
    .filter((item) => includeRetired || !item?.archivedAt)
    .filter((item) => acceptRecord(item, "canvas-region-store", clean(item?.id)))
    .sort((a, b) => clean(a.id).localeCompare(clean(b.id)));

  for (const goal of goals) {
    const anchor = goalAnchor(goal, projectId);
    const key = refKey(anchor.ref);
    if (!anchorKeys.has(key)) {
      anchorKeys.add(key);
      newAnchors.push(anchor);
    }
  }
  for (const artifact of artifacts) {
    const anchor = artifactAnchor(artifact, projectId);
    const key = refKey(anchor.ref);
    if (!anchorKeys.has(key)) {
      anchorKeys.add(key);
      newAnchors.push(anchor);
    }
  }
  for (const change of productChanges) {
    const anchor = productChangeAnchor(change, projectId);
    const key = refKey(anchor.ref);
    if (!anchorKeys.has(key)) {
      anchorKeys.add(key);
      newAnchors.push(anchor);
    }
  }
  for (const region of regions) {
    const anchor = regionAnchor(region, projectId);
    const key = refKey(anchor.ref);
    if (!anchorKeys.has(key)) {
      anchorKeys.add(key);
      newAnchors.push(anchor);
    }
  }
  projected.anchors.push(...newAnchors.sort((a, b) => compareRef(a.ref, b.ref)));
  projected.regions = regions.map((region) => cloneRegion(region));

  const relationSignatures = new Set(projected.relationships.map((item) => relationSignature(item?.source, item?.target, item?.kind)));
  const relationIds = new Set(projected.relationships.map((item) => item?.id).filter(Boolean));
  const newRelationships = [];
  const addRelationship = ({ id, source, target, kind, owner, record = null, recordType = null }) => {
    const normalizedSource = stableRef(source);
    const normalizedTarget = stableRef(target);
    const normalizedKind = clean(kind) || "related";
    if (!normalizedSource || !normalizedTarget) return;
    const signature = relationSignature(normalizedSource, normalizedTarget, normalizedKind);
    if (relationSignatures.has(signature)) return;
    relationSignatures.add(signature);
    let stableId = id;
    if (relationIds.has(stableId)) stableId = `${stableId}:${signature}`;
    relationIds.add(stableId);
    const resolved = anchorKeys.has(refKey(normalizedSource)) && anchorKeys.has(refKey(normalizedTarget));
    const relationship = {
      id: stableId,
      source: normalizedSource,
      target: normalizedTarget,
      kind: normalizedKind,
      ...(clean(record?.label) ? { label: clean(record.label) } : {}),
      resolved,
      authority: authority(owner, record, projectId, record?.relationshipId ?? record?.id ?? stableId),
      ...(record ? {
        receipt: relationReceipt(record, recordType, record?.relationshipId ?? record?.id),
        capabilities: {
          inspect: recordType === "goal-relation" || recordType === "work-relationship-revision",
          revise: recordType === "goal-relation" || recordType === "work-relationship-revision",
          history: recordType === "goal-relation" || recordType === "work-relationship-revision",
          retire: recordType === "goal-relation" || recordType === "work-relationship-revision",
          restore: recordType === "goal-relation" || recordType === "work-relationship-revision",
        },
        disposition: ["inferred", "speculative", "proposed"].includes(clean(record.provenance).toLowerCase())
          ? "proposed"
          : "accepted",
      } : {}),
    };
    newRelationships.push(relationship);
    if (!resolved) issues.push({ kind: "unresolved", ref: stableId, owner });
  };

  const goalRelations = active(input.goalRelations, includeRetired)
    .filter((record) => acceptRecord(record, "goal-store", clean(record?.id)))
    .sort((a, b) => clean(a.id).localeCompare(clean(b.id)));
  const explicitGoalPairs = new Set();
  for (const relation of goalRelations) {
    const source = stableRef(relation.sourceRef, "goal");
    const target = stableRef(relation.targetRef, "goal");
    if (source && target) explicitGoalPairs.add([refKey(source), refKey(target)].sort().join("|"));
    addRelationship({
      id: `relation:goal-relation:${clean(relation.id)}`,
      source,
      target,
      kind: relation.kind,
      owner: "goal-store",
      record: relation,
      recordType: "goal-relation",
    });
  }

  for (const goal of goals) {
    const goalRef = { type: "goal", id: goal.id };
    if (goal.originRef) addRelationship({
      id: `relation:goal:${goal.id}:origin:${refKey(goal.originRef)}`,
      source: stableRef(goal.originRef), target: goalRef, kind: "originated", owner: "goal-store", record: goal, recordType: "goal",
    });
    for (const ref of [...(goal.scopeRefs ?? [])].map((item) => stableRef(item)).filter(Boolean).sort(compareRef)) addRelationship({
      id: `relation:goal:${goal.id}:scope:${refKey(ref)}`,
      source: goalRef, target: ref, kind: "scoped-to", owner: "goal-store", record: goal, recordType: "goal",
    });
    for (const ref of [...(goal.currentWorkRefs ?? [])].map((item) => stableRef(item)).filter(Boolean).sort(compareRef)) addRelationship({
      id: `relation:goal:${goal.id}:work:${refKey(ref)}`,
      source: goalRef, target: ref, kind: "current-work", owner: "goal-store", record: goal, recordType: "goal",
    });
    for (const ref of [...(goal.relatedGoalRefs ?? [])].map((item) => stableRef(item, "goal")).filter(Boolean).sort(compareRef)) {
      const pair = [refKey(goalRef), refKey(ref)].sort().join("|");
      if (explicitGoalPairs.has(pair)) continue;
      addRelationship({
        id: `relation:goal:${goal.id}:related:${refKey(ref)}`,
        source: goalRef, target: ref, kind: "related", owner: "goal-store", record: goal, recordType: "goal",
      });
    }
  }

  for (const artifact of artifacts) {
    const artifactId = clean(artifact.artifactId ?? artifact.id);
    const artifactRef = { type: "work-artifact", id: artifactId };
    for (const ref of [...(artifact.refs ?? [])].map((item) => stableRef(item)).filter(Boolean).sort(compareRef)) addRelationship({
      id: `relation:work-artifact:${artifactId}:reference:${refKey(ref)}`,
      source: artifactRef, target: ref, kind: "references", owner: "work-artifact-store", record: artifact, recordType: "work-artifact-revision",
    });
    for (const ref of [...(artifact.parentRefs ?? [])].map((item) => stableRef(item)).filter(Boolean).sort(compareRef)) addRelationship({
      id: `relation:work-artifact:${artifactId}:parent:${refKey(ref)}`,
      source: ref, target: artifactRef, kind: "derived-into", owner: "work-artifact-store", record: artifact, recordType: "work-artifact-revision",
    });
  }

  for (const region of regions) {
    for (const ref of [...(region.memberRefs ?? [])].map((item) => stableRef(item)).filter(Boolean).sort(compareRef)) addRelationship({
      id: `relation:work-region:${region.id}:member:${refKey(ref)}`,
      source: { type: "work-region", id: region.id },
      target: ref,
      kind: "contains",
      owner: "canvas-region-store",
      record: region,
      recordType: "work-region",
    });
  }

  const workRelationships = active(input.workRelationships, includeRetired)
    .filter((record) => acceptRecord(record, "work-artifact-store", clean(record?.relationshipId ?? record?.id)))
    .sort((a, b) => clean(a.relationshipId ?? a.id).localeCompare(clean(b.relationshipId ?? b.id)));
  for (const relation of workRelationships) addRelationship({
    id: `relation:work-relationship:${clean(relation.relationshipId ?? relation.id)}`,
    source: relation.sourceRef,
    target: relation.targetRef,
    kind: relation.kind,
    owner: "work-artifact-store",
    record: relation,
    recordType: "work-relationship-revision",
  });

  // Conflict receipts prove shared durable context, not semantic incompatibility. They remain an advisory
  // projection and never change state.kind, add a state issue, or block execution.
  const decisions = Array.isArray(input.conflictDecisions) ? input.conflictDecisions : [];
  const decisionsByConflict = new Map(decisions.map((decision) => [clean(decision?.conflictId), decision]));
  const detectedConflicts = detectGoalConflicts({ goals, artifacts, workRelationships }).map((conflict) => {
    const decision = decisionsByConflict.get(conflict.id);
    if (!sameConflictReceipt(conflict, decision)) return conflict;
    return {
      ...conflict,
      status: "resolved",
      resolution: structuredClone(decision),
    };
  });
  projected.conflicts.push(...detectedConflicts);
  projected.conflicts.sort((a, b) => clean(a?.id).localeCompare(clean(b?.id)));
  const conflictsByRef = new Map();
  for (const conflict of projected.conflicts) {
    for (const ref of [conflict.objectRef, ...(conflict.goalRefs ?? [])]) {
      const key = refKey(ref);
      if (!key) continue;
      const list = conflictsByRef.get(key) ?? [];
      list.push({
        id: conflict.id, goalCount: conflict.goalCount, summary: conflict.summary,
        detail: conflict.detail, blocking: false, status: conflict.status,
        objectRef: conflict.objectRef, goalRefs: conflict.goalRefs,
        ...(conflict.resolution ? { resolution: conflict.resolution } : {}),
      });
      conflictsByRef.set(key, list);
    }
  }
  for (const anchor of projected.anchors) {
    if (anchor.facets && Object.hasOwn(anchor.facets, "goalConflicts")) delete anchor.facets.goalConflicts;
    const conflicts = conflictsByRef.get(refKey(anchor.ref));
    if (conflicts?.length) anchor.facets = { ...(anchor.facets ?? {}), goalConflicts: conflicts };
  }

  projected.relationships.push(...newRelationships.sort((a, b) => a.id.localeCompare(b.id)));
  issues.push(...foreign);
  const uniqueIssues = new Map(issues.map((issue) => [issueKey(issue), issue]));
  projected.state.issues = [...uniqueIssues.values()];
  const hasMaterial = projected.anchors.some((anchor) => anchor?.kind !== "product");
  projected.state.kind = projected.state.issues.some((issue) => issue?.kind !== "stale")
    ? "partial"
    : hasMaterial ? "ready" : "empty";
  projected.state.stale = Boolean(projected.state.stale);
  return projected;
}

/** Load a project-scoped projection through explicitly supplied readers. */
export function loadOpenCanvasProjection({ projectId, canvas, includeRetired = false } = {}, readers = {}) {
  const scope = clean(projectId);
  if (!scope) throw new Error("A projectId is required to load open canvas work.");
  const required = ["readGoals", "readGoalRelations", "readArtifacts", "readWorkRelationships"];
  for (const name of required) {
    if (typeof readers[name] !== "function") throw new Error(`An injected ${name} reader is required.`);
  }
  const readOptions = { includeRetired };
  return projectOpenCanvas(canvas, {
    projectId: scope,
    goals: readers.readGoals(scope, readOptions),
    goalRelations: readers.readGoalRelations(scope, readOptions),
    artifacts: readers.readArtifacts(scope, readOptions),
    workRelationships: readers.readWorkRelationships(scope, readOptions),
    productChanges: typeof readers.readProductChanges === "function" ? readers.readProductChanges(scope, readOptions) : [],
    regions: typeof readers.readRegions === "function" ? readers.readRegions(scope, readOptions) : [],
    conflictDecisions: typeof readers.readConflictDecisions === "function"
      ? readers.readConflictDecisions(scope, readOptions)?.decisions ?? []
      : [],
  }, { includeRetired });
}

function cloneRegion(region) {
  return structuredClone(region);
}
