import React from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Users } from "lucide-react";
import { CrewFace } from "@/components/crew/CrewFace";
import { humanizeRef } from "@/lib/agentPersona";
import type { OpGoalData, OpWorkData, OpGateData, OpOutcomeData } from "@/lib/operationLanes";
import "@/styles/operation-lanes.css";

// The four compact nodes of one OPERATOR lane (docs/production-direction/16): goal · work summary · gate ·
// outcome. Bounded and readable at 1440 — the operation altitude, never the full Engineer step graph. All
// opaque zinc, monochrome, one accent (amber) reserved for the founder gate. Faces mean authorship. A
// click on any of them routes into Engineer for the full graph + GateReview (the one action path); the
// integrator wires that on onNodeClick, so these stay pure presentation.

function OpGoalComponent({ data }: NodeProps<Node<OpGoalData>>) {
  return (
    <div className={`op-goal tone-${data.tone}`} title={`${data.name} — open the full pipeline`}>
      <Handle type="target" position={Position.Left} id="in" />
      <span className="op-goal-eyebrow">Pipeline</span>
      <span className="op-goal-name">{data.name}</span>
      {data.goal ? <span className="op-goal-desc">{data.goal}</span> : null}
      <span className={`op-goal-status tone-${data.tone}`}><span className="op-dot" aria-hidden="true" />{data.statusLabel}</span>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

function OpWorkComponent({ data }: NodeProps<Node<OpWorkData>>) {
  return (
    <div className="op-work" title={data.lead ? `Doing: ${data.lead}` : "The crew on this pipeline"}>
      <Handle type="target" position={Position.Left} id="in" />
      <span className="op-work-eyebrow"><Users size={11} aria-hidden="true" /> The crew</span>
      {data.crewRefs.length ? (
        <span className="op-work-faces">
          {data.crewRefs.map((r) => (
            <span key={r} className="op-work-face" title={humanizeRef(r)}><CrewFace agentRef={r} size={24} /></span>
          ))}
        </span>
      ) : <span className="op-work-none">Composed as it builds</span>}
      <span className="op-work-sub">{data.stepCount} step{data.stepCount === 1 ? "" : "s"}{data.lead ? ` · ${data.lead}` : ""}</span>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

function OpGateComponent({ data }: NodeProps<Node<OpGateData>>) {
  const waiting = data.pending > 0;
  return (
    <div className={`op-gate ${waiting ? "is-waiting" : ""}`} title="Your founder gate — open it to review and approve">
      <Handle type="target" position={Position.Left} id="in" />
      <span className="op-gate-lock" aria-hidden="true">⛉</span>
      <span className="op-gate-label">Your gate</span>
      <span className="op-gate-sub">{waiting ? `${data.pending} need you` : "clear"}</span>
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

// A humanized label for the newest joined outcome — its own recorded label, else its kind in plain words.
function outcomeLine(data: OpOutcomeData): string {
  const base = (data.label && data.label.trim())
    || (data.kind ? data.kind.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Outcome");
  return data.value != null && data.value !== 0 ? `${base} · ${data.value}` : base;
}
function OpOutcomeComponent({ data }: NodeProps<Node<OpOutcomeData>>) {
  // A REAL joined market return, or an honest empty state — never internal produced/throughput counts.
  return (
    <div className="op-outcome" title="What came back — a real joined market result">
      <Handle type="target" position={Position.Left} id="in" />
      <span className="op-outcome-eyebrow">Outcome</span>
      {data.hasOutcome
        ? <span className="op-outcome-val">{outcomeLine(data)}</span>
        : data.ran
          ? <span className="op-outcome-none">No outcome yet</span>
          : <span className="op-outcome-none">Not measured yet</span>}
      <Handle type="source" position={Position.Right} id="out" />
    </div>
  );
}

export const OpGoal = React.memo(OpGoalComponent);
export const OpWork = React.memo(OpWorkComponent);
export const OpGate = React.memo(OpGateComponent);
export const OpOutcome = React.memo(OpOutcomeComponent);
