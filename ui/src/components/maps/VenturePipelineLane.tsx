import { memo, type ReactNode } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import type { SystemWorkState } from "@/components/system-mode/systemWorkState";

export type VenturePipelineLaneData = Record<string, unknown> & {
  index: number;
  name: string;
  audience: string;
  trigger: string;
  value: string;
  repeatability: string;
  signalCount: number;
  campaignCount: number;
  releaseCount: number;
  outcomeCount: number;
  workState: SystemWorkState | null;
  active: boolean;
  quiet: boolean;
};

export type VenturePipelineLaneNode = Node<VenturePipelineLaneData>;

function VenturePipelineLaneView({ data }: NodeProps<VenturePipelineLaneNode>) {
  return (
    <section
      className="venture-pipeline-lane"
      data-active={data.active ? "true" : "false"}
      data-quiet={data.quiet ? "true" : "false"}
      aria-hidden="true"
    >
      <PathStage label="Signal" gap={!data.trigger && data.signalCount === 0}>
        <strong>{data.trigger || "No trigger connected"}</strong>
        <span>{data.signalCount ? `${data.signalCount} current ${data.signalCount === 1 ? "signal" : "signals"}` : "The pipeline describes the change to detect"}</span>
      </PathStage>
      <PathStage label={`Pipeline ${String(data.index + 1).padStart(2, "0")}`} gap={!data.value}>
        <strong>{data.name}</strong>
        <span>{data.value || "Intended outcome unresolved"}</span>
        <i data-work-state={data.workState ?? "ready"}>{workLabel(data.workState)}</i>
      </PathStage>
      <PathStage label="Campaign" gap={data.campaignCount === 0}>
        <strong>{data.campaignCount ? `${data.campaignCount} ${data.campaignCount === 1 ? "campaign" : "campaigns"}` : "No active campaign"}</strong>
        <span>{data.releaseCount ? `${data.releaseCount} Product ${data.releaseCount === 1 ? "release" : "releases"} attached` : "Audience, offer, period, and bounds live here"}</span>
      </PathStage>
      <PathStage label="Outcome" gap={data.outcomeCount === 0}>
        <strong>{data.outcomeCount ? `${data.outcomeCount} returned ${data.outcomeCount === 1 ? "outcome" : "outcomes"}` : "Nothing returned yet"}</strong>
        <span>{data.outcomeCount ? "Reality can change the next pipeline or Product decision" : "Evidence to return remains open"}</span>
      </PathStage>
    </section>
  );
}

export const VenturePipelineLane = memo(VenturePipelineLaneView);

function PathStage({ label, gap = false, children }: { label: string; gap?: boolean; children: ReactNode }) {
  return <div className="venture-pipeline-stage" data-gap={gap ? "true" : "false"}>
    <small>{label}</small>
    <div>{children}</div>
  </div>;
}

function workLabel(state: SystemWorkState | null) {
  if (state === "working") return "Agent working";
  if (state === "needs-review") return "Agent work needs review";
  if (state === "failed") return "Agent work failed";
  if (state === "completed") return "Agent contribution ready";
  return "Select to direct an agent";
}
