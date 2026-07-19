// Pure adapter: a CanvasSelection (what the founder selected on the canvas) → the truth the reused Now
// bodies already know how to render. It resolves the selection into an owning Direction and its
// DirectionRenderContext (via the same projectDirection the Now route uses), so descent never introduces a
// second source of truth — the stage renders the SAME projection the rail workbench renders. When the
// selection targets a specific staged artifact (workRef), that artifact is resolved to a diff-or-preview and
// hoisted so the product-artifact body can lead with exactly the thing the founder descended into. Waiting
// wall items scoped to the selection are carried through so the consequence body can show the in-context gate.
//
// Presentation-free (no JSX). Everything here is a fold over durable data the frame already holds.
import type { FirmActiveDrive, WallQueueItemView, WorkIndexOutlineObject } from "@/api";
import type { FirmArchitectureProjection, FirmConversationMessage, FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { buildDirections, type Direction } from "@/components/now/directionModel";
import { projectDirection, type DirectionRenderContext, type ExactChange } from "@/components/now/projectDirection";
import { resolveStagedArtifact, type ResolvedArtifact } from "@/components/now/reviewArtifact";

// The single value object every stage workspace renders over. The DirectionRenderContext is the shared
// per-direction truth; the extra fields narrow it to WHAT the founder actually descended into.
export type StageContext = {
  selection: CanvasSelection;
  direction: Direction | null;
  ctx: DirectionRenderContext | null;
  // The specific staged artifact the workRef selection resolves to (diff or preview), if any.
  focusedArtifact: ResolvedArtifact;
  focusedExactChange: ExactChange | null;
  // Waiting wall items scoped to the selection — the in-context founder gate lives on these.
  waiting: WallQueueItemView[];
  // A short human label for the breadcrumb tail (the artifact/segment the founder descended into).
  focusLabel: string | null;
  object: WorkIndexOutlineObject | null;
};

const EMPTY: StageContext = {
  selection: null, direction: null, ctx: null, focusedArtifact: null,
  focusedExactChange: null, waiting: [], focusLabel: null, object: null,
};

// Resolve the direction that owns the selected bet. buildDirections is the same fold the rail computes; a
// betId matches a direction by membership (direction.betIds includes the bet).
function directionForSelection(
  selection: CanvasSelection,
  lens: FirmLens,
  messages: FirmConversationMessage[],
  activeDrives: FirmActiveDrive[],
  cursor: string | null,
): Direction | null {
  if (!selection?.betId) return null;
  const directions = buildDirections({ lens, messages, activeDrives }, cursor);
  return directions.find((direction) => direction.betIds.includes(selection.betId!)) ?? null;
}

export function projectStageContext(
  ventureId: string,
  selection: CanvasSelection,
  lens: FirmLens | null,
  messages: FirmConversationMessage[],
  activeDrives: FirmActiveDrive[],
  projection: FirmArchitectureProjection | null,
  cursor: string | null,
  directionOverride: Direction | null = null,
  object: WorkIndexOutlineObject | null = null,
): StageContext {
  if (!lens || (!selection && !directionOverride)) return { ...EMPTY, selection, object };

  const direction = directionOverride ?? directionForSelection(selection, lens, messages, activeDrives, cursor);
  const wallItems = lens.wallItems ?? [];
  const ctx = direction
    ? projectDirection(ventureId, direction, lens, wallItems as WallQueueItemView[], activeDrives, projection)
    : null;

  // If the selection targets a specific staged artifact, resolve it so the product body leads with it.
  let focusedArtifact: ResolvedArtifact = null;
  let focusedExactChange: ExactChange | null = null;
  let focusLabel: string | null = object?.name ?? null;
  if (selection?.workRef && selection.betId) {
    const bet = lens.bets.find((candidate) => candidate.id === selection.betId);
    const staged = bet?.staged?.find((entry) => entry.id === selection.workRef);
    if (staged) {
      focusedArtifact = resolveStagedArtifact(staged.content);
      focusLabel = staged.title?.trim() || null;
      if (focusedArtifact?.kind === "diff" && ctx) {
        focusedExactChange = ctx.exactChanges.find((change) => change.diff === (focusedArtifact as { diff: string }).diff)
          ?? { key: focusedArtifact.diff.slice(0, 40), title: focusLabel, diff: focusedArtifact.diff, stat: focusedArtifact.stat, tests: null, preview: null, repository: null };
      }
    }
  }

  // Waiting wall items scoped to the selection: the exact bet's undecided outward acts.
  const waiting = selection
    ? (wallItems as WallQueueItemView[]).filter((item) =>
      item.decision === null
      && item.betId === selection.betId
      && (!selection.workRef || item.workRef === selection.workRef),
    )
    : direction
      ? (wallItems as WallQueueItemView[]).filter((item) => (
        item.decision === null && direction.waitingWallItemIds.includes(item.id)
      ))
      : [];

  return { selection, direction, ctx, focusedArtifact, focusedExactChange, waiting, focusLabel, object };
}
