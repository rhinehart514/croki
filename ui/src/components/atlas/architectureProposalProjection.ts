import type {
  ArchitectureRole,
  FirmArchitectureConnection,
  FirmArchitectureDocument,
  FirmArchitectureElement,
  FirmArchitectureEvidenceAnnotation,
  FirmArchitectureGroup,
  FirmArchitectureProposal,
  FirmProposalAssemblyEvent,
} from "@/types";

const ARCHITECTURE_ROLES = new Set<ArchitectureRole>([
  "concept",
  "product-loop",
  "system",
  "motion",
  "campaign",
]);

export type ArchitectureProposalChange = "create" | "update" | "change-role" | "remove";

export type ArchitectureProposalGhostElement = {
  id: string;
  role: ArchitectureRole;
  name: string;
  change: ArchitectureProposalChange;
  element: FirmArchitectureElement;
};

export type ArchitectureProposalGhostConnection = {
  id: string;
  change: Exclude<ArchitectureProposalChange, "change-role">;
  connection: FirmArchitectureConnection;
};

export type ArchitectureProposalGhostGroup = {
  id: string;
  change: Exclude<ArchitectureProposalChange, "change-role">;
  group: FirmArchitectureGroup;
};

export type ArchitectureProposalGhostEvidence = {
  id: string;
  change: "create" | "remove";
  evidence: FirmArchitectureEvidenceAnnotation;
};

export type ArchitectureProposalReceiptCounts = {
  operations: number;
  createdElements?: number;
  createdRoles: Partial<Record<ArchitectureRole, number>>;
  createdConnections?: number;
  createdGroups?: number;
  appliedEvidence?: number;
  updatedObjects?: number;
  removedObjects?: number;
};

export type ArchitectureProposalGhostScene = {
  proposedIntent: FirmArchitectureDocument["intent"] | null;
  elements: ArchitectureProposalGhostElement[];
  connections: ArchitectureProposalGhostConnection[];
  groups: ArchitectureProposalGhostGroup[];
  evidence: ArchitectureProposalGhostEvidence[];
  receiptCounts: ArchitectureProposalReceiptCounts;
  gaps: string[];
};

export type ArchitectureProposalViewModel = {
  proposal: FirmArchitectureProposal;
  scene: ArchitectureProposalGhostScene;
  pending: boolean;
  stale: boolean;
  readOnly: boolean;
  canDecide: boolean;
  decisionBlock: "settled" | "stale" | "read-only" | null;
  assumptions: string[];
  evidenceRefs: string[];
  affectedExecutionContexts: string[];
  expectedExecutionEffect: string | null;
  assemblyEvents: FirmProposalAssemblyEvent[];
  requiresSystemAcceptance: boolean;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isArchitectureRole(value: unknown): value is ArchitectureRole {
  return typeof value === "string" && ARCHITECTURE_ROLES.has(value as ArchitectureRole);
}

function increment<K extends string>(counts: Partial<Record<K, number>>, key: K) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function addGap(gaps: string[], detail: string) {
  if (!gaps.includes(detail)) gaps.push(detail);
}

function unresolvedTargetGap(kind: string, id: string) {
  return `The proposal changes ${kind} “${id}”, but its base-revision value is unavailable for an honest ghost preview.`;
}

export function projectArchitectureProposalGhostScene(
  proposal: FirmArchitectureProposal,
  baseArchitecture: FirmArchitectureDocument | null = null,
): ArchitectureProposalGhostScene {
  const canResolveBase = baseArchitecture?.revision === proposal.baseRevision;
  const elements = new Map<string, FirmArchitectureElement>(
    canResolveBase ? baseArchitecture.elements.map((entry) => [entry.id, clone(entry)]) : [],
  );
  const connections = new Map<string, FirmArchitectureConnection>(
    canResolveBase ? baseArchitecture.connections.map((entry) => [entry.id, clone(entry)]) : [],
  );
  const groups = new Map<string, FirmArchitectureGroup>(
    canResolveBase ? baseArchitecture.groups.map((entry) => [entry.id, clone(entry)]) : [],
  );
  const evidence = new Map<string, FirmArchitectureEvidenceAnnotation>(
    canResolveBase ? baseArchitecture.evidenceAnnotations.map((entry) => [entry.id, clone(entry)]) : [],
  );
  const ghostElements = new Map<string, ArchitectureProposalGhostElement>();
  const ghostConnections = new Map<string, ArchitectureProposalGhostConnection>();
  const ghostGroups = new Map<string, ArchitectureProposalGhostGroup>();
  const ghostEvidence = new Map<string, ArchitectureProposalGhostEvidence>();
  const createdElementIds = new Set<string>();
  const createdConnectionIds = new Set<string>();
  const createdGroupIds = new Set<string>();
  const createdEvidenceIds = new Set<string>();
  const gaps: string[] = [];
  const createdRoles: Partial<Record<ArchitectureRole, number>> = {};
  let proposedIntent: FirmArchitectureDocument["intent"] | null = null;
  let updatedObjects = 0;
  let removedObjects = 0;

  for (const operation of proposal.operations) {
    if (operation.op === "update-intent") {
      proposedIntent = clone(operation.value);
      updatedObjects += 1;
      continue;
    }

    if (operation.op === "create-element") {
      const element = clone(operation.element) as FirmArchitectureElement;
      if (!isArchitectureRole(element.role)) {
        addGap(gaps, `Architecture role “${String(element.role)}” is not accepted and was omitted from the ghost preview.`);
        continue;
      }
      elements.set(element.id, element);
      createdElementIds.add(element.id);
      increment(createdRoles, element.role);
      ghostElements.set(element.id, { id: element.id, role: element.role, name: element.name, change: "create", element });
      continue;
    }

    if (operation.op === "update-element") {
      const current = elements.get(operation.elementId);
      if (!current || (!canResolveBase && !createdElementIds.has(operation.elementId))) {
        addGap(gaps, unresolvedTargetGap("architecture element", operation.elementId));
        continue;
      }
      const element = { ...current, ...clone(operation.value), id: current.id, role: current.role };
      elements.set(element.id, element);
      updatedObjects += 1;
      ghostElements.set(element.id, { id: element.id, role: element.role, name: element.name, change: "update", element });
      continue;
    }

    if (operation.op === "change-role") {
      const current = elements.get(operation.elementId);
      if (!current || (!canResolveBase && !createdElementIds.has(operation.elementId))) {
        addGap(gaps, unresolvedTargetGap("architecture element", operation.elementId));
        continue;
      }
      if (!isArchitectureRole(operation.role)) {
        addGap(gaps, `Architecture role “${String(operation.role)}” is not accepted and was omitted from the ghost preview.`);
        continue;
      }
      const element = {
        id: current.id,
        name: current.name,
        statement: current.statement,
        provenance: current.provenance,
        ...clone(operation.fields ?? {}),
        role: operation.role,
      } as FirmArchitectureElement;
      elements.set(element.id, element);
      updatedObjects += 1;
      ghostElements.set(element.id, { id: element.id, role: element.role, name: element.name, change: "change-role", element });
      continue;
    }

    if (operation.op === "remove-element") {
      const current = elements.get(operation.elementId);
      if (!current || (!canResolveBase && !createdElementIds.has(operation.elementId))) {
        addGap(gaps, unresolvedTargetGap("architecture element", operation.elementId));
        continue;
      }
      ghostElements.set(current.id, { id: current.id, role: current.role, name: current.name, change: "remove", element: current });
      elements.delete(current.id);
      removedObjects += 1;
      continue;
    }

    if (operation.op === "create-connection") {
      const connection = clone(operation.connection);
      connections.set(connection.id, connection);
      createdConnectionIds.add(connection.id);
      ghostConnections.set(connection.id, { id: connection.id, change: "create", connection });
      continue;
    }

    if (operation.op === "update-connection") {
      const current = connections.get(operation.connectionId);
      if (!current || (!canResolveBase && !createdConnectionIds.has(operation.connectionId))) {
        addGap(gaps, unresolvedTargetGap("connection", operation.connectionId));
        continue;
      }
      const connection = { ...current, ...clone(operation.value), id: current.id };
      connections.set(connection.id, connection);
      updatedObjects += 1;
      ghostConnections.set(connection.id, { id: connection.id, change: "update", connection });
      continue;
    }

    if (operation.op === "remove-connection") {
      const current = connections.get(operation.connectionId);
      if (!current || (!canResolveBase && !createdConnectionIds.has(operation.connectionId))) {
        addGap(gaps, unresolvedTargetGap("connection", operation.connectionId));
        continue;
      }
      ghostConnections.set(current.id, { id: current.id, change: "remove", connection: current });
      connections.delete(current.id);
      removedObjects += 1;
      continue;
    }

    if (operation.op === "create-group") {
      const group = clone(operation.group);
      groups.set(group.id, group);
      createdGroupIds.add(group.id);
      ghostGroups.set(group.id, { id: group.id, change: "create", group });
      continue;
    }

    if (operation.op === "update-group") {
      const current = groups.get(operation.groupId);
      if (!current || (!canResolveBase && !createdGroupIds.has(operation.groupId))) {
        addGap(gaps, unresolvedTargetGap("group", operation.groupId));
        continue;
      }
      const group = { ...current, ...clone(operation.value), id: current.id };
      groups.set(group.id, group);
      updatedObjects += 1;
      ghostGroups.set(group.id, { id: group.id, change: "update", group });
      continue;
    }

    if (operation.op === "remove-group") {
      const current = groups.get(operation.groupId);
      if (!current || (!canResolveBase && !createdGroupIds.has(operation.groupId))) {
        addGap(gaps, unresolvedTargetGap("group", operation.groupId));
        continue;
      }
      ghostGroups.set(current.id, { id: current.id, change: "remove", group: current });
      groups.delete(current.id);
      removedObjects += 1;
      continue;
    }

    if (operation.op === "apply-evidence") {
      const annotation = clone(operation.evidence);
      evidence.set(annotation.id, annotation);
      createdEvidenceIds.add(annotation.id);
      ghostEvidence.set(annotation.id, { id: annotation.id, change: "create", evidence: annotation });
      continue;
    }

    const current = evidence.get(operation.evidenceId);
    if (!current || (!canResolveBase && !createdEvidenceIds.has(operation.evidenceId))) {
      addGap(gaps, unresolvedTargetGap("evidence annotation", operation.evidenceId));
      continue;
    }
    ghostEvidence.set(current.id, { id: current.id, change: "remove", evidence: current });
    evidence.delete(current.id);
    removedObjects += 1;
  }

  if ([...ghostElements.values()].some((entry) => entry.role === "motion" || entry.role === "campaign")) {
    addGap(
      gaps,
      "Architecture proposal operations do not define a sequence of steps, approval counts, or teammate assignments.",
    );
  }

  return {
    proposedIntent,
    elements: [...ghostElements.values()],
    connections: [...ghostConnections.values()],
    groups: [...ghostGroups.values()],
    evidence: [...ghostEvidence.values()],
    receiptCounts: {
      operations: proposal.operations.length,
      ...(createdElementIds.size ? { createdElements: createdElementIds.size } : {}),
      createdRoles,
      ...(createdConnectionIds.size ? { createdConnections: createdConnectionIds.size } : {}),
      ...(createdGroupIds.size ? { createdGroups: createdGroupIds.size } : {}),
      ...(createdEvidenceIds.size ? { appliedEvidence: createdEvidenceIds.size } : {}),
      ...(updatedObjects ? { updatedObjects } : {}),
      ...(removedObjects ? { removedObjects } : {}),
    },
    gaps,
  };
}

export function projectArchitectureProposal(
  proposal: FirmArchitectureProposal,
  currentRevision: number,
  options: { readOnly?: boolean; baseArchitecture?: FirmArchitectureDocument | null } = {},
): ArchitectureProposalViewModel {
  const pending = proposal.status === "pending";
  const stale = pending && proposal.baseRevision !== currentRevision;
  const readOnly = options.readOnly === true;
  const decisionBlock = !pending ? "settled" : stale ? "stale" : readOnly ? "read-only" : null;
  const assemblyEvents = (proposal.assemblyEvents ?? []).filter((event) => (
    event.validated === true
    && Number.isInteger(event.operationIndex)
    && proposal.operations[event.operationIndex]?.op === event.op
  ));
  const requiresSystemAcceptance = proposal.operations.some((operation) => (
    operation.op === "create-element"
    && operation.element.role === "campaign"
    && "governingBetSeed" in operation.element
    && typeof operation.element.governingBetSeed === "string"
    && Boolean(operation.element.governingBetSeed.trim())
  ));
  return {
    proposal,
    scene: projectArchitectureProposalGhostScene(proposal, options.baseArchitecture ?? null),
    pending,
    stale,
    readOnly,
    canDecide: decisionBlock === null,
    decisionBlock,
    assumptions: [...proposal.unresolvedAssumptions],
    evidenceRefs: [...proposal.evidenceRefs],
    affectedExecutionContexts: [...proposal.affectedExecutionContexts],
    expectedExecutionEffect: proposal.expectedExecutionEffect,
    assemblyEvents,
    requiresSystemAcceptance,
  };
}
