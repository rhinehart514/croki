import { useCallback, useEffect, useRef } from "react";
import type { Node, NodeChange, ReactFlowInstance } from "@xyflow/react";
import { putPlacement } from "@/api";
import type { FirmLens } from "@/types";
import type { CanvasAnchorKey } from "@/lib/lensLayout";

export function useCanvasPlacement({
  ventureId,
  lens,
  nodes,
  actionsDisabled,
  onNodesChange,
  onLensChange,
  onCanvasInit,
  reload,
}: {
  ventureId: string;
  lens: FirmLens | null;
  nodes: Node[];
  actionsDisabled: boolean;
  onNodesChange: (changes: NodeChange[]) => void;
  onLensChange?: (lens: FirmLens) => void;
  onCanvasInit: (instance: ReactFlowInstance) => void;
  reload: () => Promise<void>;
}) {
  const placementRevisionRef = useRef(0);
  const canvasInstanceRef = useRef<ReactFlowInstance | null>(null);
  const lensElementRef = useRef<HTMLDivElement>(null);

  const authoritativeRevision = lens?.placement.revision;
  useEffect(() => {
    if (authoritativeRevision != null) placementRevisionRef.current = authoritativeRevision;
  }, [authoritativeRevision]);

  const commit = useCallback(async (positions: Record<string, { x: number; y: number }>) => {
    if (actionsDisabled || !lens) return;
    const optimisticLens = {
      ...lens,
      placement: { positions, revision: placementRevisionRef.current },
    };
    onLensChange?.(optimisticLens);
    try {
      const { placement } = await putPlacement(ventureId, {
        positions,
        expectedRevision: placementRevisionRef.current,
      });
      placementRevisionRef.current = placement.revision;
      if (onLensChange) onLensChange({ ...optimisticLens, placement });
      else await reload();
    } catch {
      void reload();
    }
  }, [actionsDisabled, lens, onLensChange, reload, ventureId]);

  const positionsFor = useCallback((settledNodes: Node[]) => Object.fromEntries(
    settledNodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
  ), []);

  const placeCanvasItem = useCallback((key: CanvasAnchorKey, screenPoint?: { x: number; y: number }) => {
    if (actionsDisabled) return;
    const instance = canvasInstanceRef.current;
    const bounds = lensElementRef.current?.getBoundingClientRect();
    if (!instance || (!screenPoint && !bounds)) return;
    const point = screenPoint ?? { x: bounds!.left + bounds!.width / 2, y: bounds!.top + bounds!.height / 2 };
    const projected = instance.screenToFlowPosition(point);
    const position = { x: projected.x - 96, y: projected.y - 36 };
    onNodesChange([{ id: key, type: "position", position, dragging: false }]);
    void commit({ ...positionsFor(nodes), [key]: position });
  }, [actionsDisabled, commit, nodes, onNodesChange, positionsFor]);

  const removeCanvasItem = useCallback((key: string) => {
    if (!key.startsWith("capability:")) return;
    const positions = positionsFor(nodes);
    delete positions[key];
    void commit(positions);
  }, [commit, nodes, positionsFor]);

  const onNodeDragStop = useCallback(() => {
    void commit(positionsFor(nodes));
  }, [commit, nodes, positionsFor]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    canvasInstanceRef.current = instance;
    onCanvasInit(instance);
  }, [onCanvasInit]);

  return {
    lensElementRef,
    placeCanvasItem,
    removeCanvasItem,
    onNodeDragStop,
    onInit,
  };
}
