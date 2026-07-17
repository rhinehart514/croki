// The consequence workspace body: the exact outward effect and the in-context founder gate, IN the
// descended stage — never a detached inbox. Reuses DecisionGate verbatim (the same two-act authorize→send
// invariant, the same reviewContent exact-effect rows), so the gate the founder acts on here is the same
// authority boundary the wall enforces. showArtifact stays true: at the consequence altitude the founder
// sees the produced thing (diff/preview) right beside the decision.
import type { WallQueueItemView } from "@/api";
import { DecisionGate } from "@/components/now/DecisionGate";
import type { StageContext } from "./projectStageContext";

export function ConsequenceBody({
  ctx,
  ventureId,
  onChanged,
}: {
  ctx: StageContext;
  ventureId: string;
  onChanged: () => void;
}) {
  if (!ctx.waiting.length) return null;
  return (
    <div className="now-detail-block">
      <span className="now-detail-block-label">
        {ctx.waiting.length === 1 ? "Your decision" : "Your decisions"}
      </span>
      {ctx.waiting.map((item: WallQueueItemView) => (
        <DecisionGate key={item.id} ventureId={ventureId} item={item} onDecided={onChanged} showArtifact />
      ))}
    </div>
  );
}
