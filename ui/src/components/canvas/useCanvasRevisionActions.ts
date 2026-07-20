import { useCallback } from "react";
import type { FirmLens } from "@/types";
import { putPlacement } from "@/api";
import { useArchitectureMutation } from "@/components/atlas/useArchitectureMutation";
import { applyPlacement, type PlacementPositions } from "./placementInverse";
import { useCanvasRevisionStack, type CanvasRevisionEntry } from "./useCanvasRevisionStack";

export function useCanvasRevisionActions({
  ventureId,
  lens,
  architectureRevision,
  refresh,
}: {
  ventureId: string;
  lens: FirmLens | null;
  architectureRevision: number;
  refresh: () => void;
}) {
  const mutation = useArchitectureMutation({ ventureId, revision: architectureRevision });
  const revisions = useCanvasRevisionStack(ventureId);

  const applyPlacementSide = useCallback(async (positions: PlacementPositions) => {
    if (!lens) return;
    const next = applyPlacement(lens.placement.positions as PlacementPositions, positions);
    try {
      await putPlacement(ventureId, { positions: next, expectedRevision: lens.placement.revision });
      refresh();
    } catch {
      refresh();
    }
  }, [lens, ventureId, refresh]);

  const applyArchitectureSide = useCallback(async (ops: unknown, reason: string) => {
    try {
      await mutation.apply(ops as Parameters<typeof mutation.apply>[0], reason);
      refresh();
    } catch {
      // The mutation client owns the visible conflict; never force a stale revision.
    }
  }, [mutation, refresh]);

  const applyEntry = useCallback((entry: CanvasRevisionEntry, side: "inverse" | "forward") => {
    const payload = side === "inverse" ? entry.inverse : entry.forward;
    if (payload === null) return;
    if (entry.kind === "placement") void applyPlacementSide(payload as PlacementPositions);
    else void applyArchitectureSide(payload, side === "inverse" ? `Undid: ${entry.reason}` : entry.reason);
  }, [applyPlacementSide, applyArchitectureSide]);

  const onUndo = useCallback(() => {
    const entry = revisions.popUndo();
    if (entry) applyEntry(entry, "inverse");
  }, [revisions, applyEntry]);

  const onRedo = useCallback(() => {
    const entry = revisions.popRedo();
    if (entry) applyEntry(entry, "forward");
  }, [revisions, applyEntry]);

  return { mutation, revisions, onUndo, onRedo };
}
