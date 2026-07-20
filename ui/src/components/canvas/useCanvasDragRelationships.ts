import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Node } from "@xyflow/react";
import type { FirmArchitectureConnection, FirmArchitectureProjection } from "@/types";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import type { useArchitectureMutation } from "@/components/atlas/useArchitectureMutation";
import { interpretRelationship, type RelationshipProposal } from "./interpretRelationship";
import { placementDelta } from "./placementInverse";
import { useDropTarget } from "./useDropTarget";
import type { useCanvasRevisionStack } from "./useCanvasRevisionStack";

type Mutation = ReturnType<typeof useArchitectureMutation>;
type RevisionStack = ReturnType<typeof useCanvasRevisionStack>;

export function useCanvasDragRelationships({
  readOnly,
  overlayActive,
  lensActiveRef,
  answerOpenRef,
  onNodeDragStop,
  nodes,
  projection,
  mutation,
  pushRevision,
  refresh,
}: {
  readOnly: boolean;
  overlayActive: boolean;
  lensActiveRef: RefObject<unknown>;
  answerOpenRef: RefObject<boolean>;
  onNodeDragStop: (event: unknown, node?: Node) => void;
  nodes: AtlasNode[];
  projection: FirmArchitectureProjection | null;
  mutation: Mutation;
  pushRevision: RevisionStack["push"];
  refresh: () => void;
}) {
  const liveDrop = useDropTarget({ disabled: readOnly || overlayActive });
  const connectable = useCallback((target: { sourceId: string; targetId: string } | null) => (
    target !== null && /^(architecture|bet|outcome|work|wall-item):/.test(target.sourceId)
      && /^(architecture|bet|outcome|work|wall-item):/.test(target.targetId)
  ), []);
  const [latched, setLatched] = useState<typeof liveDrop>(null);
  const lastArmedRef = useRef<typeof liveDrop>(null);
  const liveArmed = liveDrop && connectable(liveDrop) ? liveDrop : null;
  useEffect(() => { if (liveArmed) lastArmedRef.current = liveArmed; }, [liveArmed]);
  const dropTarget = overlayActive ? null : (liveArmed ?? latched);

  const dragOriginRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null);
  const onNodeDragStart = useCallback((_event: unknown, node?: Node) => {
    if (lensActiveRef.current || answerOpenRef.current || !node?.id) {
      dragOriginRef.current = null;
      return;
    }
    dragOriginRef.current = { id: node.id, position: { x: node.position.x, y: node.position.y } };
  }, [lensActiveRef, answerOpenRef]);

  const guardedNodeDragStop = useCallback((event: unknown, node?: Node) => {
    if (lensActiveRef.current || answerOpenRef.current) {
      dragOriginRef.current = null;
      lastArmedRef.current = null;
      return;
    }
    onNodeDragStop(event, node);
    const origin = dragOriginRef.current;
    const armed = lastArmedRef.current;
    dragOriginRef.current = null;
    lastArmedRef.current = null;
    if (armed && node?.id && armed.sourceId === node.id && connectable(armed)) setLatched(armed);
    if (!node?.id || !origin || origin.id !== node.id) return;
    const delta = placementDelta(
      { [node.id]: origin.position },
      { [node.id]: { x: node.position.x, y: node.position.y } },
    );
    if (!delta.movedIds.length) return;
    pushRevision({
      forward: delta.forward, inverse: delta.inverse, reason: "Moved a direction",
      revision: null, kind: "placement", worldBoundary: false,
    });
  }, [lensActiveRef, answerOpenRef, onNodeDragStop, connectable, pushRevision]);

  const interpretation = useMemo(() => {
    if (!dropTarget) return null;
    const source = nodes.find((node) => node.id === dropTarget.sourceId);
    const target = nodes.find((node) => node.id === dropTarget.targetId);
    return interpretRelationship(
      projection,
      { ref: dropTarget.sourceId, kind: typeof source?.data.kind === "string" ? source.data.kind : null, territory: (source?.data.territory ?? null) as "product" | "gtm" | null },
      { ref: dropTarget.targetId, kind: typeof target?.data.kind === "string" ? target.data.kind : null, territory: (target?.data.territory ?? null) as "product" | "gtm" | null },
    );
  }, [dropTarget, nodes, projection]);

  const closeChip = useCallback(() => setLatched(null), []);
  const applyInterpretation = useCallback(async (proposal: RelationshipProposal) => {
    if (!dropTarget) return;
    const connectionId = `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const connection: FirmArchitectureConnection = {
      id: connectionId, fromRef: dropTarget.sourceId, toRef: dropTarget.targetId,
      label: proposal.kind, assertion: "founder-asserted",
    };
    closeChip();
    try {
      const result = await mutation.apply([{ op: "create-connection", connection }], `Connected two directions: ${proposal.kind}`);
      pushRevision({
        forward: [{ op: "create-connection", connection }], inverse: [{ op: "remove-connection", connectionId }],
        reason: `Connected two directions: ${proposal.kind}`, revision: result.revision, kind: "connect", worldBoundary: false,
      });
      refresh();
    } catch {
      // The visual placement remains; the mutation client owns the visible relationship error.
    }
  }, [dropTarget, mutation, pushRevision, refresh, closeChip]);

  return {
    dropTarget,
    interpretation,
    chipOpen: dropTarget !== null && interpretation !== null,
    onNodeDragStart,
    guardedNodeDragStop,
    applyInterpretation,
    keepVisualOnly: closeChip,
  };
}
