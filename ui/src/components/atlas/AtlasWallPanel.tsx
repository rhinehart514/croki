import { AlertTriangle, ChevronUp, ShieldCheck } from "lucide-react";
import type { ProductChangeReadiness, WallDecision, WallQueueItemView } from "@/api";
import { FirmWallReview } from "@/components/lens/FirmWallReview";

export function AtlasWallPanel({
  queue,
  wallCount,
  liveBetCount,
  open,
  onOpenChange,
  onDecide,
  onInspectProductChange,
  onApproveProductChange,
  readOnly = false,
  unavailableReason = null,
}: {
  queue: WallQueueItemView[];
  wallCount: number;
  liveBetCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecide: (item: WallQueueItemView, decision: WallDecision, note?: string) => Promise<void>;
  onInspectProductChange?: (ventureId: string, workspaceId: string, revisionId: string) => Promise<ProductChangeReadiness>;
  onApproveProductChange?: (item: WallQueueItemView, note?: string) => Promise<ProductChangeReadiness>;
  readOnly?: boolean;
  unavailableReason?: string | null;
}) {
  const unavailable = Boolean(unavailableReason);
  const pending = wallCount > 0;
  const expanded = !unavailable && open;

  return (
    <>
      <button
        type="button"
        className={`firm-lens-wall-band ${pending || unavailable ? "firm-lens-wall-band-active" : ""}`}
        onClick={() => { if (!unavailable) onOpenChange(!expanded); }}
        aria-expanded={expanded}
        aria-disabled={unavailable}
        aria-controls={expanded ? "atlas-wall-panel" : undefined}
        aria-describedby={unavailable ? "atlas-wall-unavailable" : !pending ? "atlas-wall-clear" : undefined}
      >
        {pending || unavailable ? <AlertTriangle size={14} aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}
        <span>{unavailable ? "Pending decisions are unavailable" : pending ? `${wallCount} ${wallCount === 1 ? "decision needs" : "decisions need"} you` : "Nothing needs you yet"}</span>
        {unavailable ? <small id="atlas-wall-unavailable">Pending outward work could not be verified</small> : (
          <ChevronUp size={14} aria-hidden="true" className={`firm-lens-wall-chevron${expanded ? " firm-lens-wall-chevron-open" : ""}`} />
        )}
        {!pending && !unavailable ? <small id="atlas-wall-clear">Outward work still stops here</small> : null}
      </button>

      {expanded ? (
        <div className="firm-lens-wall-panel atlas-wall-panel" id="atlas-wall-panel" data-state="open">
          {pending ? (
            <FirmWallReview
              items={queue}
              onDecide={onDecide}
              onInspectProductChange={onInspectProductChange}
              onApproveProductChange={onApproveProductChange}
              readOnly={readOnly}
            />
          ) : (
            <section className="atlas-wall-clear-state" aria-labelledby="atlas-wall-clear-title">
              <ShieldCheck aria-hidden="true" />
              <span>
                <small>Founder decisions</small>
                <h2 id="atlas-wall-clear-title">The firm is still here.</h2>
                <p>Nothing is waiting for your hand. {liveBetCount ? `${liveBetCount} ${liveBetCount === 1 ? "line is" : "lines are"} still moving inward.` : "Give the venture a direction to begin."}</p>
              </span>
            </section>
          )}
        </div>
      ) : null}
    </>
  );
}
