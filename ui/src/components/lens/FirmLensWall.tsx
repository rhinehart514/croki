import { AlertTriangle, ChevronUp, ShieldCheck } from "lucide-react";
import type { ProductChangeReadiness, WallDecision, WallQueueItemView } from "@/api";
import { FirmWallReview } from "./FirmWallReview";

export function FirmLensWall({
  queue,
  wallCount,
  open,
  preferredItemId,
  onOpenChange,
  onDecide,
  onInspectProductChange,
  onApproveProductChange,
  readOnly = false,
  unavailableReason = null,
}: {
  queue: WallQueueItemView[];
  wallCount: number;
  open: boolean;
  preferredItemId?: string | null;
  onOpenChange: (open: boolean) => void;
  onDecide: (item: WallQueueItemView, decision: WallDecision, note?: string) => Promise<void>;
  onInspectProductChange?: (ventureId: string, workspaceId: string, revisionId: string) => Promise<ProductChangeReadiness>;
  onApproveProductChange?: (item: WallQueueItemView, note?: string) => Promise<ProductChangeReadiness>;
  readOnly?: boolean;
  unavailableReason?: string | null;
}) {
  const unavailable = Boolean(unavailableReason);
  const pending = wallCount > 0;
  const expanded = !unavailable && pending && open;
  return (
    <>
      <button
        type="button"
        className={`firm-lens-wall-band ${pending || unavailable ? "firm-lens-wall-band-active" : ""}`}
        onClick={() => { if (!unavailable && pending) onOpenChange(!expanded); }}
        aria-expanded={expanded}
        aria-disabled={unavailable || !pending}
        aria-controls={expanded ? "firm-lens-wall-panel" : undefined}
        aria-describedby={unavailable ? "firm-lens-wall-unavailable-description" : !pending ? "firm-lens-wall-clear-description" : undefined}
      >
        {pending || unavailable ? <AlertTriangle size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
        <span>{unavailable ? "Founder review is unavailable" : pending ? `${wallCount} waiting for you` : "Nothing needs you"}</span>
        {unavailable ? <small id="firm-lens-wall-unavailable-description">Pending outward work could not be verified</small> : pending ? (
          <ChevronUp
            size={14}
            aria-hidden="true"
            className={`firm-lens-wall-chevron${expanded ? " firm-lens-wall-chevron-open" : ""}`}
          />
        ) : <small id="firm-lens-wall-clear-description">Outward work still stops here</small>}
      </button>

      {expanded ? (
        <div className="firm-lens-wall-panel" id="firm-lens-wall-panel" data-state="open">
          <FirmWallReview
            key={preferredItemId ?? "wall-review"}
            items={queue}
            preferredItemId={preferredItemId}
            onDecide={onDecide}
            onInspectProductChange={onInspectProductChange}
            onApproveProductChange={onApproveProductChange}
            readOnly={readOnly}
          />
        </div>
      ) : null}
    </>
  );
}
