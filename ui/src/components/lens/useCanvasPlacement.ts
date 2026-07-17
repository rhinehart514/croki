import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, NodeChange, ReactFlowInstance } from "@xyflow/react";
import { ApiError, getLens, putPlacement } from "@/api";
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
  // The exact set of node ids the founder has actually moved — dragged, explicitly placed, or removed.
  // Founder placement and generated seed placement are DIFFERENT epistemic states (Law 6): a node the
  // founder never touched must NEVER be persisted as founder placement just because a sibling was moved.
  // We persist only these ids, folded over the stored authoritative map, so an untouched seed is never
  // frozen into placement by an unrelated drop.
  const founderMovedRef = useRef<Set<string>>(new Set());
  // The last founder-committed positions, keyed by id — the source of truth the poll snap-back guard
  // re-applies. A poll GET that races a drop can return a lens whose placement has not yet absorbed the
  // drop; re-applying these over the reset keeps a just-dropped card from jumping back within ~1.2s.
  const founderPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  // Monotonic local counter bumped on every founder commit. The Shell ignores a poll-driven reset whose
  // placement revision is older than the drop it would undo (revision-guarded snap-back).
  const committedDropRef = useRef(0);
  const [committedDrop, setCommittedDrop] = useState(0);

  const authoritativeRevision = lens?.placement.revision;
  useEffect(() => {
    if (authoritativeRevision != null) placementRevisionRef.current = authoritativeRevision;
  }, [authoritativeRevision]);

  // Build the commit payload: the stored authoritative positions with ONLY the founder-moved ids
  // overlaid from the live node array. Never the full positionsFor(nodes) snapshot.
  const founderPayload = useCallback(
    (
      base: Record<string, { x: number; y: number }>,
      moved: Record<string, { x: number; y: number }>,
    ) => {
      const payload = { ...base };
      for (const id of founderMovedRef.current) {
        if (moved[id]) payload[id] = moved[id];
        else delete payload[id]; // an explicit remove drops the id from persisted placement
      }
      return payload;
    },
    [],
  );

  const positionsFor = useCallback((settledNodes: Node[]) => Object.fromEntries(
    settledNodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }]),
  ), []);

  const commit = useCallback(async (movedPositions: Record<string, { x: number; y: number }>) => {
    if (actionsDisabled || !lens) return;
    const positions = founderPayload(lens.placement.positions, movedPositions);
    // Record the founder's intent locally so a racing poll reset can re-apply it. Mirror the payload:
    // keep the moved-and-present ids, forget the removed ones.
    for (const id of founderMovedRef.current) {
      if (movedPositions[id]) founderPositionsRef.current[id] = movedPositions[id];
      else delete founderPositionsRef.current[id];
    }
    committedDropRef.current += 1;
    setCommittedDrop(committedDropRef.current);
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
    } catch (cause) {
      // The founder's hand is final: a drop must never be eaten by a stale window losing a 409 race
      // (feel non-negotiable). On a revision conflict the authoritative revision has moved on, so we
      // reload it, then MERGE this window's founder-moved positions over the fresh authoritative map and
      // retry once — never re-PUT this window's stale full field, so a second window's genuine drop of a
      // different node survives. Any other failure (including the pre-network stale-connection throw,
      // which carries no HTTP status) genuinely cannot be sent, so it falls back to a plain reload.
      const conflict = cause instanceof ApiError && cause.status === 409;
      if (conflict) {
        try {
          // Re-read the authoritative revision directly (not through the effect-driven ref, which may
          // not have flushed yet), then re-issue the founder-moved positions folded over the FRESH
          // authoritative map so the reloaded window adopts the founder's latest placement instead of
          // clobbering another window's concurrent, independent drop.
          const authoritative = await getLens(ventureId);
          const merged = founderPayload(authoritative.lens.placement.positions, movedPositions);
          const { placement } = await putPlacement(ventureId, {
            positions: merged,
            expectedRevision: authoritative.lens.placement.revision,
          });
          placementRevisionRef.current = placement.revision;
          if (onLensChange) onLensChange({ ...optimisticLens, placement: { ...placement } });
          await reload();
          return;
        } catch {
          // The retry also failed — fall through to a plain reload of authoritative state.
        }
      }
      void reload();
    }
  }, [actionsDisabled, founderPayload, lens, onLensChange, reload, ventureId]);

  const placeCanvasItem = useCallback((key: CanvasAnchorKey, screenPoint?: { x: number; y: number }) => {
    if (actionsDisabled) return;
    const instance = canvasInstanceRef.current;
    const bounds = lensElementRef.current?.getBoundingClientRect();
    if (!instance || (!screenPoint && !bounds)) return;
    const point = screenPoint ?? { x: bounds!.left + bounds!.width / 2, y: bounds!.top + bounds!.height / 2 };
    const projected = instance.screenToFlowPosition(point);
    const position = { x: projected.x - 96, y: projected.y - 36 };
    onNodesChange([{ id: key, type: "position", position, dragging: false }]);
    // An explicit place is a founder move.
    founderMovedRef.current.add(key);
    void commit({ ...positionsFor(nodes), [key]: position });
  }, [actionsDisabled, commit, nodes, onNodesChange, positionsFor]);

  const removeCanvasItem = useCallback((key: string) => {
    if (!key.startsWith("capability:")) return;
    // A remove is a founder move too — recording the id makes founderPayload drop it from placement.
    founderMovedRef.current.add(key);
    void commit(positionsFor(nodes));
  }, [commit, nodes, positionsFor]);

  const onNodeDragStop = useCallback((_event: unknown, node?: Node) => {
    // React Flow passes (event, node) to onNodeDragStop. Record ONLY the dragged node as founder-moved;
    // a sibling that merely sat still is never promoted to founder placement.
    if (node?.id) founderMovedRef.current.add(node.id);
    void commit(positionsFor(nodes));
  }, [commit, nodes, positionsFor]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    canvasInstanceRef.current = instance;
    onCanvasInit(instance);
  }, [onCanvasInit]);

  // The poll snap-back guard reads these. `founderPositions` returns the founder-committed positions to
  // re-apply after a lens-driven node reset; `committedDrop` changes on every commit so the consumer's
  // reset effect can re-run its overlay. Both are inert on surfaces that do not persist (the lens canvas
  // ignores them — it has its own camera-driven reconcile).
  const founderPositions = useCallback(() => founderPositionsRef.current, []);

  return {
    lensElementRef,
    placeCanvasItem,
    removeCanvasItem,
    onNodeDragStop,
    onInit,
    founderPositions,
    committedDrop,
  };
}
