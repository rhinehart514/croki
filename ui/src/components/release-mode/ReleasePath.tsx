import { useMemo, useState, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowUpRight, Check, RotateCcw, X } from "lucide-react";
import type { ReleaseDetail, ReleaseMutation, SystemIndexObject, WorkIndexItem } from "@/api";
import { DecisionGate } from "@/components/now/DecisionGate";
import { deriveReleasePath, pendingGate, recordTime, type ReleasePathEntry, type ReleasePathKey, type ReleasePathStep } from "./releaseRecords";

type ReleaseNodeData = Record<string, unknown> & {
  step: ReleasePathStep;
  selected: boolean;
  needsFounder: boolean;
  onSelect: (key: ReleasePathKey) => void;
};
type ReleaseFlowNode = Node<ReleaseNodeData, "releaseStep">;

function ReleaseStepNode({ data }: NodeProps<ReleaseFlowNode>) {
  const { step, selected, needsFounder, onSelect } = data;
  return <div className="release-canvas-node" data-empty={!step.entries.length} data-selected={selected || undefined} data-attention={needsFounder || undefined}>
    <Handle type="target" position={Position.Left} />
    <button type="button" onClick={() => onSelect(step.key)}>
      <span>{step.title}</span>
      <strong>{step.entries.length ? step.entries[0]?.label : step.prompt}</strong>
      <small>{needsFounder ? "Needs your decision" : step.entries.length ? `${step.entries.length} exact ${step.entries.length === 1 ? "join" : "joins"}` : "Open connection"}</small>
      {step.entries.length > 1 ? <i>+{step.entries.length - 1}</i> : null}
    </button>
    <Handle type="source" position={Position.Right} />
  </div>;
}

const NODE_TYPES: NodeTypes = { releaseStep: ReleaseStepNode };
const POSITIONS: Record<ReleasePathKey, { x: number; y: number }> = {
  product: { x: 0, y: 80 },
  customer: { x: 292, y: 80 },
  distribution: { x: 584, y: 80 },
  action: { x: 876, y: 80 },
  evidence: { x: 1168, y: 80 },
};

function ActionEntry({ entry, readOnlyReason, onChanged, onReconnect }: {
  entry: ReleasePathEntry;
  readOnlyReason: string | null;
  onChanged: () => void;
  onReconnect: () => void;
}) {
  const gate = entry.raw ? pendingGate(entry.raw) : null;
  if (gate) return <DecisionGate ventureId={gate.ventureId} item={gate} onDecided={onChanged} onReconnect={onReconnect} readOnlyReason={readOnlyReason} />;
  const failed = Boolean(entry.raw?.lastExecutionError);
  const released = Boolean(entry.raw?.releasedAt);
  return <div className="release-inspector-entry-body"><strong>{entry.label}</strong><small>{failed ? "Action failed" : released ? "Released" : "Recorded founder decision"}{entry.detail ? ` · ${entry.detail}` : ""}</small></div>;
}

function StepInspector({ step, release, readOnlyReason, onResolve, onMutate, onChanged, onReconnect, onOpenProductGtm, onClose, evidencePanel }: {
  step: ReleasePathStep;
  release: ReleaseDetail;
  readOnlyReason: string | null;
  onResolve: (key: ReleasePathKey) => void;
  onMutate: (mutations: ReleaseMutation[]) => Promise<void>;
  onChanged: () => void;
  onReconnect: () => void;
  onOpenProductGtm?: (objectRef?: string) => void;
  onClose: () => void;
  evidencePanel?: ReactNode;
}) {
  return <aside className="release-canvas-inspector" aria-label={`${step.title} release step`}>
    <header><div><span>Release step</span><h2>{step.title}</h2><p>{step.prompt}</p></div><button type="button" aria-label="Close release step" onClick={onClose}><X aria-hidden="true" /></button></header>
    <div className="release-inspector-state" data-empty={!step.entries.length}>{step.entries.length ? <><Check aria-hidden="true" /><span><strong>{step.entries.length} exact {step.entries.length === 1 ? "connection" : "connections"}</strong><small>Joined to {release.name}</small></span></> : <><span className="release-open-ring" aria-hidden="true" /><span><strong>Connection still open</strong><small>Nothing has been inferred.</small></span></>}</div>
    {step.entries.length ? <ul className="release-inspector-entries">{step.entries.map((entry) => <li key={entry.id}>
      {step.key === "action" ? <ActionEntry entry={entry} readOnlyReason={readOnlyReason} onChanged={onChanged} onReconnect={onReconnect} /> : <div className="release-inspector-entry-body">{entry.eyebrow ? <small>{entry.eyebrow}</small> : null}<strong>{entry.label}</strong>{step.key === "evidence" && entry.raw ? <small>{[entry.detail, recordTime(entry.raw)].filter(Boolean).join(" · ")}</small> : null}</div>}
      <div className="release-inspector-entry-actions">{entry.objectRef && onOpenProductGtm ? <button type="button" aria-label={`Open ${entry.label} in Product and GTM`} onClick={() => onOpenProductGtm(entry.objectRef)}><ArrowUpRight aria-hidden="true" /></button> : null}{entry.relationshipRef ? <button type="button" aria-label={`Remove ${entry.label}`} disabled={Boolean(readOnlyReason)} onClick={() => void onMutate([{ op: "unlink-object", relationshipRef: entry.relationshipRef! }])}>Remove</button> : null}</div>
    </li>)}</ul> : null}
    <button className="release-inspector-agent" type="button" disabled={Boolean(readOnlyReason)} onClick={() => onResolve(step.key)}>{step.entries.length ? "Improve this step with agent" : "Resolve this step with agent"}</button>
    {step.key === "evidence" ? evidencePanel : null}
  </aside>;
}

export function ReleasePath({ release, objects, threads, readOnlyReason, onResolve, onMutate, onChanged, onReconnect, onOpenProductGtm, evidencePanel, tracePanel }: {
  release: ReleaseDetail;
  objects: SystemIndexObject[];
  threads: WorkIndexItem[];
  readOnlyReason: string | null;
  onResolve: (key: ReleasePathKey) => void;
  onMutate: (mutations: ReleaseMutation[]) => Promise<void>;
  onChanged: () => void;
  onReconnect: () => void;
  onOpenProductGtm?: (objectRef?: string) => void;
  evidencePanel?: ReactNode;
  tracePanel?: ReactNode;
}) {
  const steps = useMemo(() => deriveReleasePath(release, objects, threads), [objects, release, threads]);
  const firstOpen = steps.find((step) => !step.entries.length)?.key ?? "evidence";
  const [selection, setSelection] = useState<ReleasePathKey | "trace" | null>(release.attention.length ? "action" : firstOpen);
  const selectedStep = steps.find((step) => step.key === selection) ?? null;
  const needsFounder = release.attention.length > 0;
  const nodes = useMemo<ReleaseFlowNode[]>(() => steps.map((step) => ({
    id: step.key,
    type: "releaseStep",
    position: POSITIONS[step.key],
    initialWidth: 244,
    initialHeight: 146,
    draggable: false,
    data: { step, selected: selection === step.key, needsFounder: step.key === "action" && needsFounder, onSelect: setSelection },
  })), [needsFounder, selection, steps]);
  const edges = useMemo<Edge[]>(() => [
    ...steps.slice(0, -1).map((step, index) => ({ id: `${step.key}-${steps[index + 1]!.key}`, source: step.key, target: steps[index + 1]!.key, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "var(--n-ink-4)" }, style: { stroke: "var(--n-line-2)", strokeWidth: 1.4 } })),
    { id: "evidence-return", source: "evidence", target: "product", type: "bezier", className: "release-return-edge", label: "reality returns", markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "var(--amber-ink)" }, style: { stroke: "var(--amber-ink)", strokeWidth: 1.5, strokeDasharray: release.outcomes.length ? undefined : "5 6", opacity: release.outcomes.length ? 0.8 : 0.35 }, labelStyle: { fill: "var(--amber-ink)", fontSize: 10, fontFamily: "var(--mono)" }, labelBgStyle: { fill: "var(--n-app)", fillOpacity: 0.94 } },
  ], [release.outcomes.length, steps]);

  return <section className="release-canvas" aria-label="Release path canvas">
    <div className="release-canvas-toolbar"><div><span>Release path</span><strong>Product change → market → evidence</strong></div><button type="button" aria-pressed={selection === "trace"} onClick={() => setSelection(selection === "trace" ? null : "trace")}><RotateCcw aria-hidden="true" />Trace <i>{(release.threads?.length ?? 0) + (release.runs?.length ?? 0) + release.decisions.length + release.outcomes.length}</i></button></div>
    <ReactFlow<ReleaseFlowNode> nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} fitView fitViewOptions={{ padding: selection ? 0.28 : 0.14, minZoom: 0.45, maxZoom: 0.9 }} minZoom={0.3} maxZoom={1.2} nodesDraggable={false} nodesConnectable={false} elementsSelectable panOnDrag onPaneClick={() => setSelection(null)} proOptions={{ hideAttribution: true }} aria-label="Product delta, customer consequence, distribution, outward action, and evidence connected as one release">
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--canvas-dot)" />
      <Controls position="bottom-left" showInteractive={false} />
    </ReactFlow>
    {selectedStep ? <StepInspector step={selectedStep} release={release} readOnlyReason={readOnlyReason} onResolve={onResolve} onMutate={onMutate} onChanged={onChanged} onReconnect={onReconnect} onOpenProductGtm={onOpenProductGtm} onClose={() => setSelection(null)} evidencePanel={evidencePanel} /> : null}
    {selection === "trace" ? <aside className="release-canvas-inspector is-trace" aria-label="Release trace"><button className="release-inspector-close" type="button" aria-label="Close release trace" onClick={() => setSelection(null)}><X aria-hidden="true" /></button>{tracePanel}</aside> : null}
  </section>;
}
