// Temporary schema-v1 read/write projection. New Product/GTM work never imports this module directly;
// the semantic model re-exports it only for storage migration and compatibility routes.

const ARCHITECTURE_ROLES = new Set(["concept", "product-loop", "system", "motion", "campaign"]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function fail(message) {
  throw Object.assign(new Error(message), { code: "semantic_model_compatibility_conflict", status: 409 });
}

function architectureMetadata(model) {
  return model.compatibility?.architecture ?? { revision: 0, intent: { statement: "", constraints: [] }, revisions: [], proposals: [] };
}

function compatibilityMetadata(current, stored = {}) {
  return {
    revision: Number.isInteger(current.revision) ? current.revision : 0,
    intent: structuredClone(current.intent ?? { statement: "", constraints: [] }),
    revisions: structuredClone(list(stored.revisions)),
    proposals: structuredClone(list(stored.proposals)),
    updatedAt: current.updatedAt ?? null,
    updatedBy: structuredClone(current.updatedBy ?? null),
  };
}

export function projectArchitectureCompatibility(model) {
  const metadata = architectureMetadata(model);
  const elements = model.objects.filter((entry) => ARCHITECTURE_ROLES.has(entry.properties?.architecture?.role)).map((entry) => {
    const architecture = entry.properties.architecture;
    return {
      id: entry.id,
      role: architecture.role,
      name: entry.name,
      ...(architecture.statementPresent ? { statement: entry.statement } : {}),
      ...(entry.provenance ? { provenance: structuredClone(entry.provenance) } : {}),
      ...structuredClone(architecture.fields ?? {}),
    };
  });
  const connections = model.relationships.filter((entry) => entry.properties?.architecture?.connection).map((entry) => ({
    id: entry.id, fromRef: entry.fromRef, toRef: entry.toRef, label: entry.label, assertion: entry.assertion,
    ...structuredClone(entry.properties.architecture.fields ?? {}),
  }));
  const groups = model.views.filter((entry) => entry.properties?.architecture?.group).map((entry) => ({
    id: entry.id, name: entry.name, memberRefs: structuredClone(entry.rootRefs), ...structuredClone(entry.properties.architecture.fields ?? {}),
  }));
  const evidenceAnnotations = model.insights.filter((entry) => entry.properties?.architecture?.evidence).map((entry) => ({
    id: entry.id, subjectRef: entry.subjectRefs[0], evidenceRef: entry.sourceRefs[0], stance: entry.stance,
    note: entry.statement, appliedBy: structuredClone(entry.appliedBy), appliedAt: entry.updatedAt ?? entry.createdAt,
    ...structuredClone(entry.properties.architecture.fields ?? {}),
  }));
  return {
    current: {
      schemaVersion: 1,
      ventureId: model.ventureId,
      revision: metadata.revision,
      intent: structuredClone(metadata.intent),
      elements, connections, groups, evidenceAnnotations,
      updatedAt: metadata.updatedAt ?? null,
      updatedBy: structuredClone(metadata.updatedBy ?? null),
    },
    revisions: structuredClone(list(metadata.revisions)),
    proposals: structuredClone(list(metadata.proposals)),
  };
}

function mergeDerived(existing, incoming, predicate, family) {
  const incomingIds = new Set(incoming.map((entry) => entry.id));
  for (const entry of existing) {
    if (incomingIds.has(entry.id) && !predicate(entry)) {
      fail(`Architecture compatibility cannot replace canonical ${family} record ${entry.id}.`);
    }
  }
  return [...existing.filter((entry) => !predicate(entry) && !incomingIds.has(entry.id)), ...incoming];
}

export function replaceArchitectureCompatibility(model, { current, revisions = [], proposals = [] }, { revision, updatedAt = current.updatedAt, updatedBy = current.updatedBy } = {}, { modelFromArchitecture }) {
  const lifted = modelFromArchitecture({ current, revisions, proposals, revision: model.revision }, model.ventureId);
  const next = structuredClone(model);
  next.objects = mergeDerived(next.objects, lifted.objects, (entry) => ARCHITECTURE_ROLES.has(entry.properties?.architecture?.role) || entry.properties?.workingTheory, "object");
  next.relationships = mergeDerived(next.relationships, lifted.relationships, (entry) => entry.properties?.architecture?.connection || entry.properties?.workingTheory, "relationship");
  next.views = mergeDerived(next.views, lifted.views, (entry) => entry.properties?.architecture?.group, "view");
  next.workflowContracts = mergeDerived(next.workflowContracts, lifted.workflowContracts, (entry) => entry.properties?.architecture?.campaign, "workflow contract");
  next.insights = mergeDerived(next.insights, lifted.insights, (entry) => entry.properties?.architecture?.evidence || entry.properties?.workingTheory, "insight");
  next.compatibility = { ...(next.compatibility ?? {}), architecture: compatibilityMetadata(current, { revisions, proposals }) };
  next.revision = revision ?? model.revision + 1;
  next.updatedAt = updatedAt ?? null;
  next.updatedBy = structuredClone(updatedBy ?? null);
  return next;
}
