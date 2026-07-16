import { ArrowDownRight, FoldHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AtlasNode } from "./atlasTypes";

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  return `${(durationMs / 60_000).toFixed(1)} min`;
}

function stageReceipt(stage: NonNullable<AtlasNode["data"]["workflow"]>[number]) {
  const receipts = [
    ...(stage.durationMs == null ? [] : [formatDuration(stage.durationMs)]),
    ...(stage.costUsd == null ? [] : [`$${stage.costUsd.toFixed(2)}`]),
  ];
  if (stage.state === "running" && stage.runningTeammateRef) {
    const since = stage.since ? new Date(stage.since) : null;
    const presence = `${stage.runningTeammateRef.replaceAll("-", " ")} here now${since && !Number.isNaN(since.valueOf()) ? ` · since ${since.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`;
    return [presence, ...receipts].join(" · ");
  }
  if (stage.state === "gate") return ["Needs your hand", ...receipts].join(" · ");
  return receipts.length ? receipts.join(" · ") : stage.state;
}

export function AtlasBetWorkflow({ id, data }: { id: string; data: AtlasNode["data"] }) {
  const workflow = data.workflow ?? [];
  const pinned = workflow.length > 5 ? (() => {
    const running = workflow.findLast((stage) => stage.state === "running");
    const gatedWork = workflow.findLast((stage) => stage.kind === "staged" && stage.state === "gate");
    const gate = workflow.findLast((stage) => stage.state === "gate");
    const ids = new Set<string>([workflow[0]!.id, workflow.at(-1)!.id]);
    for (const stage of [running, gatedWork, gate]) {
      if (stage && ids.size < 4) ids.add(stage.id);
    }
    for (let index = workflow.length - 1; ids.size < 4 && index >= 0; index -= 1) ids.add(workflow[index]!.id);
    return workflow.filter((stage) => ids.has(stage.id));
  })() : workflow;
  const visibleStages = workflow.length > 5
    ? [...pinned.slice(0, -1), null, pinned.at(-1)!]
    : pinned;
  const hiddenCount = workflow.length - pinned.length;
  return (
    <div className="atlas-bet-workflow nodrag" onClick={(event) => event.stopPropagation()}>
      <div className="atlas-workflow-actions">
        <Button type="button" variant="ghost" size="xs" onClick={data.onFold}><FoldHorizontal aria-hidden="true" /> Fold</Button>
        {data.bet?.workflowMeasurementWindow ? <small>Observation window · {data.bet.workflowMeasurementWindow}</small> : null}
        <Button type="button" variant="ghost" size="xs" onClick={() => data.onDive?.(id)}><ArrowDownRight aria-hidden="true" /> Inspect this work</Button>
      </div>
      <ol aria-label="Recorded work and evidence">
        {visibleStages.map((stage) => stage
          ? <li key={stage.id} data-state={stage.state}><i aria-hidden="true" /><span><b title={stage.label}>{stage.label}</b><small>{stageReceipt(stage)}</small></span></li>
          : <li key="workflow-overflow" data-state="summary"><i aria-hidden="true" /><span><b title={`${hiddenCount} additional real records`}>{hiddenCount} more records</b><small>Inspect the full history</small></span></li>)}
      </ol>
    </div>
  );
}
