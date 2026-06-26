import { ShieldCheck } from "lucide-react";
import "@/styles/canvas-gate.css";

// The signature moment: when a run pauses at the founder gate, this glass banner-card rises over
// the canvas. The product thesis ("vibe up to the gate, never past it") made visible. The
// integration dims the canvas graph plane (.cgate-canvas-dimmed) and blooms the gate node
// (.cgate-node-bloom) while this card is shown; this component owns only the card itself.
export function CanvasGate({
  gateNodeId,
  itemCount,
  onReview,
}: {
  gateNodeId: string;
  itemCount: number;
  onReview: (nodeId: string) => void;
}) {
  if (itemCount <= 0) return null;

  return (
    <div className="cgate-card" role="status" aria-live="polite">
      <span className="cgate-glyph" aria-hidden="true">
        <ShieldCheck size={16} />
      </span>
      <div className="cgate-copy">
        <span className="cgate-title">At the gate</span>
        <span className="cgate-sub">
          {itemCount} draft{itemCount === 1 ? "" : "s"} waiting for your review
        </span>
      </div>
      <button className="cgate-review" type="button" onClick={() => onReview(gateNodeId)}>
        Review
      </button>
    </div>
  );
}
