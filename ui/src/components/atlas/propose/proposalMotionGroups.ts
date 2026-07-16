import type { FirmArchitectureOperation } from "@/types";
import type { ArchitectureProposalViewModel } from "../architectureProposalProjection";

export type ProposalMotionAdjustment = {
  proposalId: string;
  motionId: string;
  motionName: string;
  operationIndexes: number[];
  operations: FirmArchitectureOperation[];
  sharedOperationIndexes: number[];
};

function architectureId(ref: string) {
  return ref.startsWith("architecture:") ? ref.slice("architecture:".length) : null;
}

function operationObjectId(operation: FirmArchitectureOperation) {
  if (operation.op === "create-element") return operation.element.id;
  if (operation.op === "update-element" || operation.op === "change-role" || operation.op === "remove-element") {
    return operation.elementId;
  }
  return null;
}

function operationConnectionId(operation: FirmArchitectureOperation) {
  if (operation.op === "create-connection") return operation.connection.id;
  if (operation.op === "update-connection" || operation.op === "remove-connection") return operation.connectionId;
  return null;
}

function operationGroupId(operation: FirmArchitectureOperation) {
  if (operation.op === "create-group") return operation.group.id;
  if (operation.op === "update-group" || operation.op === "remove-group") return operation.groupId;
  return null;
}

function operationEvidenceId(operation: FirmArchitectureOperation) {
  if (operation.op === "apply-evidence") return operation.evidence.id;
  if (operation.op === "remove-evidence") return operation.evidenceId;
  return null;
}

export function groupProposalOperationsByMotion(
  view: ArchitectureProposalViewModel,
): ProposalMotionAdjustment[] {
  const motions = view.scene.elements.filter((entry) => entry.role === "motion");
  if (!motions.length) return [];

  const campaignsByMotion = new Map<string, Set<string>>();
  for (const motion of motions) campaignsByMotion.set(motion.id, new Set());
  for (const entry of view.scene.elements) {
    if (entry.role !== "campaign") continue;
    const primaryMotionId = entry.element.primaryMotionId;
    if (primaryMotionId && campaignsByMotion.has(primaryMotionId)) {
      campaignsByMotion.get(primaryMotionId)?.add(entry.id);
    }
  }

  const assignments = new Map<number, Set<string>>();
  const assign = (index: number, motionId: string) => {
    const assigned = assignments.get(index) ?? new Set<string>();
    assigned.add(motionId);
    assignments.set(index, assigned);
  };

  view.proposal.operations.forEach((operation, index) => {
    const objectId = operationObjectId(operation);
    const connectionId = operationConnectionId(operation);
    const connection = connectionId
      ? view.scene.connections.find((entry) => entry.id === connectionId)?.connection
      : null;
    const connectionIds = connection
      ? [architectureId(connection.fromRef), architectureId(connection.toRef)].filter((id): id is string => Boolean(id))
      : [];
    const groupId = operationGroupId(operation);
    const memberIds = groupId
      ? (view.scene.groups.find((entry) => entry.id === groupId)?.group.memberRefs ?? [])
          .map(architectureId)
          .filter((id): id is string => Boolean(id))
      : [];
    const evidenceId = operationEvidenceId(operation);
    const evidenceSubjectId = evidenceId
      ? architectureId(view.scene.evidence.find((entry) => entry.id === evidenceId)?.evidence.subjectRef ?? "")
      : null;

    for (const motion of motions) {
      const relatedIds = new Set([motion.id, ...(campaignsByMotion.get(motion.id) ?? [])]);
      const directObject = objectId !== null && relatedIds.has(objectId);
      const directConnection = connectionIds.some((id) => relatedIds.has(id));
      const directGroup = memberIds.some((id) => relatedIds.has(id));
      const directEvidence = evidenceSubjectId !== null && relatedIds.has(evidenceSubjectId);
      if (directObject || directConnection || directGroup || directEvidence) assign(index, motion.id);
    }
  });

  return motions.flatMap((motion) => {
    const operationIndexes: number[] = [];
    const sharedOperationIndexes: number[] = [];
    for (const [index, motionIds] of assignments) {
      if (!motionIds.has(motion.id)) continue;
      if (motionIds.size === 1) operationIndexes.push(index);
      else sharedOperationIndexes.push(index);
    }
    if (!operationIndexes.length) return [];
    operationIndexes.sort((left, right) => left - right);
    sharedOperationIndexes.sort((left, right) => left - right);
    return [{
      proposalId: view.proposal.id,
      motionId: motion.id,
      motionName: motion.name,
      operationIndexes,
      operations: operationIndexes.map((index) => view.proposal.operations[index]),
      sharedOperationIndexes,
    }];
  });
}
