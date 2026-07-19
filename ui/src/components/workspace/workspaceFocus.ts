import type { CanvasSelection } from "@/components/firm/directionTarget";
import type { Direction } from "@/components/now/directionModel";

export type WorkspaceFocus = {
  directionId: string | null;
  target: CanvasSelection;
};

export const ventureFocus = (): WorkspaceFocus => ({ directionId: null, target: null });

export function directionFocus(direction: Direction): WorkspaceFocus {
  const onlyBetId = direction.betIds.length === 1 ? direction.betIds[0] : null;
  return {
    directionId: direction.id,
    target: onlyBetId
      ? { betId: onlyBetId, workRef: null, teammateRefs: [] }
      : null,
  };
}

export function targetFocus(target: CanvasSelection, directions: Direction[]): WorkspaceFocus {
  const direction = target?.betId
    ? directions.find((candidate) => candidate.betIds.includes(target.betId!))
    : null;
  return { directionId: direction?.id ?? null, target };
}
