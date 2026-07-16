import { useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ProductChangeReadiness, WallDecision, WallQueueItemView } from "@/api";
import { WallQueueNav } from "./WallQueueNav";
import { WallReviewDetail } from "./WallReviewDetail";
import { readable } from "./wallReviewContent";

export function FirmWallReview({
  items,
  preferredItemId,
  onDecide,
  onInspectProductChange,
  onApproveProductChange,
  readOnly = false,
}: {
  items: WallQueueItemView[];
  preferredItemId?: string | null;
  onDecide: (item: WallQueueItemView, decision: WallDecision, note?: string) => Promise<void>;
  onInspectProductChange?: (ventureId: string, workspaceId: string, revisionId: string) => Promise<ProductChangeReadiness>;
  onApproveProductChange?: (item: WallQueueItemView, note?: string) => Promise<ProductChangeReadiness>;
  readOnly?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(
    items.some((item) => item.id === preferredItemId) ? preferredItemId! : (items[0]?.id ?? ""),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decisionInFlight = useRef(false);
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const decide = async (item: WallQueueItemView, decision: WallDecision) => {
    if (decisionInFlight.current) return;
    decisionInFlight.current = true;
    setBusyId(item.id);
    setError(null);
    try {
      await onDecide(item, decision, notes[item.id]?.trim() || undefined);
      setNotes((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (cause) {
      setError(readable(item.effect.kind) === "product-change"
        ? "That product change could not be updated. It may need to be restaged."
        : cause instanceof Error ? cause.message : "That decision could not be recorded.");
    } finally {
      decisionInFlight.current = false;
      setBusyId(null);
    }
  };

  if (!selected) return null;

  return (
    <section className="firm-wall-review" aria-label="Founder decisions">
      <header className="firm-wall-review-head">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>Needs your hand</strong>
          <span>One exact act at a time. Nothing here reaches the world without your decision.</span>
        </div>
      </header>
      <div className="firm-wall-review-workbench">
        <WallQueueNav items={items} selectedId={selected.id} onSelect={setSelectedId} />
        <WallReviewDetail
          key={selected.id}
          item={selected}
          note={notes[selected.id] ?? ""}
          busy={Boolean(busyId)}
          readOnly={readOnly}
          onNoteChange={(note) => setNotes((current) => ({ ...current, [selected.id]: note }))}
          onDecide={(decision) => decide(selected, decision)}
          onInspectProductChange={onInspectProductChange}
          onApproveProductChange={onApproveProductChange}
        />
      </div>
      {error ? <p className="firm-wall-review-error" role="alert">{error}</p> : null}
    </section>
  );
}
