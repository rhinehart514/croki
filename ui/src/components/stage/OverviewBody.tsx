// The guaranteed-last workspace body: the ResultBody when a direction ctx exists, else a read-only
// structural summary for architecture/theory/capability selections that carry no direction. This is the
// sane default the open-registry contract promises — an unknown selection degrades to a legible summary,
// never a blank or broken pane.
import { ResultBody } from "@/components/now/WorkDetail";
import type { StageContext } from "./projectStageContext";

function selectionSummary(ctx: StageContext): string {
  const selection = ctx.selection;
  if (!selection) return "Select something on the canvas to open it here.";
  if (selection.theoryId) return selection.theoryLabel?.trim() || "Drover's current read of this venture.";
  if (selection.architectureId) return "A structural part of the venture architecture.";
  if (selection.teammateRefs.length) return "This part of the venture is scoped to your conversation.";
  return "This selection has no prepared result yet.";
}

export function OverviewBody({ ctx }: { ctx: StageContext }) {
  if (ctx.ctx) return <ResultBody ctx={ctx.ctx} />;
  return (
    <div className="now-detail-block">
      <span className="now-detail-block-label">Overview</span>
      <p className="now-detail-why">{selectionSummary(ctx)}</p>
    </div>
  );
}
