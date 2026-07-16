import { useCallback, useEffect, useMemo, useState } from "react";
import { applyNodeChanges, type Node, type NodeChange } from "@xyflow/react";
import { getLens, getWallQueue, type WallQueueItemView } from "@/api";
import { fallbackPositions } from "@/lib/lensLayout";
import type { FirmLens } from "@/types";
import { buildFirmLensNodes } from "./firmLensGraph";
import type { CanvasCapability } from "./canvasCapabilities";

export function useFirmLensProjection({
  ventureId,
  controlledLens,
  controlledWallQueue,
  onLensChange,
  onProposeCapability,
  capabilities,
}: {
  ventureId: string;
  controlledLens?: FirmLens | null;
  controlledWallQueue?: WallQueueItemView[] | null;
  onLensChange?: (lens: FirmLens) => void;
  onProposeCapability: (agentRef: string, capability: string) => Promise<void>;
  capabilities?: CanvasCapability[];
}) {
  const [localLens, setLocalLens] = useState<FirmLens | null>(null);
  const [localWallQueue, setLocalWallQueue] = useState<WallQueueItemView[]>([]);
  const [localNodes, setLocalNodes] = useState<Node[]>([]);
  const [controlledNodeState, setControlledNodeState] = useState<{
    ventureId: string;
    placementRevision: number;
    nodes: Node[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallError, setWallError] = useState<string | null>(null);
  const lensControlled = controlledLens !== undefined;
  const wallQueueControlled = controlledWallQueue !== undefined;

  const project = useCallback((payload: FirmLens) => {
    const fallback = fallbackPositions(payload.crew, payload.bets);
    const positions = Object.keys(payload.placement.positions).length
      ? { ...fallback, ...payload.placement.positions }
      : fallback;
    return buildFirmLensNodes(payload, positions, onProposeCapability, capabilities);
  }, [capabilities, onProposeCapability]);

  // The shell refreshes a controlled lens frequently. Derive its current durable content while
  // retaining XYFlow's same-revision measurement/drag state. A placement revision or venture change
  // invalidates those local mechanics without an effect-driven mirror render.
  const controlledNodes = useMemo(() => {
    if (!controlledLens) return [];
    const projected = project(controlledLens);
    if (
      controlledNodeState?.ventureId !== ventureId
      || controlledNodeState.placementRevision !== controlledLens.placement.revision
    ) return projected;
    const previousById = new Map(controlledNodeState.nodes.map((node) => [node.id, node]));
    return projected.map((node) => {
      const previous = previousById.get(node.id);
      if (!previous) return node;
      return {
        ...previous,
        ...node,
        position: previous.position,
        measured: previous.measured,
        width: previous.width,
        height: previous.height,
        initialWidth: previous.initialWidth,
        initialHeight: previous.initialHeight,
      };
    });
  }, [controlledLens, controlledNodeState, project, ventureId]);

  const nodes = lensControlled ? controlledNodes : localNodes;

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    if (!lensControlled) {
      setLocalNodes((current) => applyNodeChanges(changes, current));
      return;
    }
    if (!controlledLens) return;
    setControlledNodeState({
      ventureId,
      placementRevision: controlledLens.placement.revision,
      nodes: applyNodeChanges(changes, nodes),
    });
  }, [controlledLens, lensControlled, nodes, ventureId]);

  const load = useCallback(async () => {
    const [lensResult, queueResult] = await Promise.allSettled([
      lensControlled ? Promise.resolve(null) : getLens(ventureId),
      wallQueueControlled ? Promise.resolve(null) : getWallQueue(ventureId),
    ]);
    if (lensResult.status === "fulfilled") {
      if (lensResult.value) {
        setLocalLens(lensResult.value.lens);
        setLocalNodes(project(lensResult.value.lens));
        onLensChange?.(lensResult.value.lens);
      }
      setError(null);
    } else {
      setError(lensResult.reason instanceof Error ? lensResult.reason.message : String(lensResult.reason));
    }
    if (queueResult.status === "fulfilled") {
      if (queueResult.value) setLocalWallQueue(queueResult.value.queue);
      setWallError(null);
    } else {
      setWallError(queueResult.reason instanceof Error ? queueResult.reason.message : String(queueResult.reason));
    }
  }, [lensControlled, onLensChange, project, ventureId, wallQueueControlled]);

  useEffect(() => {
    if (lensControlled && wallQueueControlled) return;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try { await load(); } finally { inFlight = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 900);
    return () => window.clearInterval(timer);
  }, [lensControlled, load, wallQueueControlled]);

  return {
    lens: lensControlled ? (controlledLens ?? null) : localLens,
    wallQueue: wallQueueControlled ? (controlledWallQueue ?? []) : localWallQueue,
    nodes,
    onNodesChange,
    error,
    wallError,
    reload: load,
  };
}
