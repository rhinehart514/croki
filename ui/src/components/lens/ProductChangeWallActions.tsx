import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { ProductChangeReadiness, WallQueueItemView } from "@/api";
import { Button } from "@/components/ui/button";

export function ProductChangeWallActions({
  item,
  disabled,
  onInspect,
  onApprove,
  note,
  onApproved,
  onApply,
  onReject,
}: {
  item: WallQueueItemView;
  disabled: boolean;
  onInspect: (ventureId: string, workspaceId: string, revisionId: string) => Promise<ProductChangeReadiness>;
  onApprove: (item: WallQueueItemView, note?: string) => Promise<ProductChangeReadiness>;
  note?: string;
  onApproved: () => void;
  onApply: (item: WallQueueItemView) => Promise<void>;
  onReject: (item: WallQueueItemView) => Promise<void>;
}) {
  const [readiness, setReadiness] = useState<ProductChangeReadiness | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const workspaceId = typeof item.effect.workspaceId === "string" ? item.effect.workspaceId : "";
  const revisionId = typeof item.effect.revisionId === "string" ? item.effect.revisionId : "";

  useEffect(() => {
    let current = true;
    void onInspect(item.ventureId, workspaceId, revisionId).then(
      (next) => { if (current) setReadiness(next); },
      () => { if (current) setUnavailable(true); },
    );
    return () => { current = false; };
  }, [item.ventureId, onInspect, revisionId, workspaceId]);

  const approve = async () => {
    try {
      setUnavailable(false);
      setReviewing(true);
      setReadiness(await onApprove(item, note));
      onApproved();
    } catch {
      setUnavailable(true);
    } finally {
      setReviewing(false);
    }
  };

  const approved = readiness?.status === "approved";
  const rejected = readiness?.status === "rejected";

  return (
    <>
      {unavailable ? (
        <p className="firm-wall-review-status" role="alert">Drover could not verify this change. Applying stays unavailable.</p>
      ) : readiness === null ? (
        <p className="firm-wall-review-status">Checking the proposed change…</p>
      ) : approved && !readiness.ready ? (
        <p className="firm-wall-review-status">This approved patch can no longer be applied safely. The crew needs to prepare it again.</p>
      ) : rejected ? (
        <p className="firm-wall-review-status">This change was not approved.</p>
      ) : null}
      <div className="firm-wall-review-actions">
        {!approved && !rejected && !unavailable && readiness ? (
          <Button disabled={disabled || reviewing} onClick={() => void approve()}>
            <Check size={14} aria-hidden="true" /> Approve change
          </Button>
        ) : null}
        {approved ? (
          <Button disabled={disabled || reviewing || !readiness.ready} onClick={() => void onApply(item)}>
            <Check size={14} aria-hidden="true" /> Apply change
          </Button>
        ) : null}
        <Button variant="secondary" disabled={disabled || reviewing} onClick={() => void onReject(item)}>
          <X size={14} aria-hidden="true" /> Reject
        </Button>
      </div>
    </>
  );
}
