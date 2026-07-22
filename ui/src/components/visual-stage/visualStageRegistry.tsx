/* eslint-disable react-refresh/only-export-components -- the registry returns domain renderers by visual kind. */
import type { CodingWorkspace, ThreadTimeline, ThreadTimelineItem, VisualReference, WorkIndex } from "@/api";
import type { Direction } from "@/components/now/directionModel";
import { ExactArtifact } from "@/components/thread/RichThreadItems";
import { DecisionGate } from "@/components/now/DecisionGate";
import type { FirmLens } from "@/types";
import { Background, Controls, MarkerType, Position, ReactFlow } from "@xyflow/react";
import { CodeWorkspaceStage } from "./CodeWorkspaceStage";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";
import { ProductGtmViewGraph } from "@/components/work-mode/WorkProductGtmView";
import { productGtmViewFromItem } from "@/components/work-mode/productGtmView";

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const records = (value: unknown) => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
const dateLabel = (value: unknown) => {
  const parsed = Date.parse(text(value));
  return Number.isNaN(parsed) ? "" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parsed);
};

function FlowStage({ item }: { item: ThreadTimelineItem }) {
  const artifact = item.artifact as Record<string, unknown> | undefined;
  const content = artifact?.content as Record<string, unknown> | undefined;
  const steps = records(content?.steps);
  const nodes = steps.map((step, index) => ({
    id: text(step.id, `step-${index}`),
    position: { x: 0, y: index * 132 },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: { label: <div><strong>{text(step.label, "Step")}</strong>{text(step.detail) ? <small>{text(step.detail)}</small> : null}</div> },
  }));
  const edges = records(content?.edges).map((edge, index) => ({
    id: `flow-edge-${index}-${text(edge.from)}-${text(edge.to)}`,
    source: text(edge.from), target: text(edge.to), label: text(edge.label), markerEnd: { type: MarkerType.ArrowClosed },
  }));
  return <div className="visual-flow" aria-label={`${text(item.title, "Flow")} interactive flow`}><ReactFlow nodes={nodes} edges={edges} nodesDraggable={false} fitView minZoom={0.25} maxZoom={1.5}><Background /><Controls showInteractive={false} /></ReactFlow></div>;
}

function ComparisonStage({ item }: { item: ThreadTimelineItem }) {
  const artifact = item.artifact as Record<string, unknown> | undefined;
  const content = artifact?.content as Record<string, unknown> | undefined;
  const columns = records(item.alternatives).length ? records(item.alternatives) : records(content?.columns);
  if (!columns.length) return <div className="visual-stage-empty"><strong>No approaches were returned.</strong><p>The conversation remains the governing record until an exact comparison is prepared.</p></div>;
  return <section className="visual-comparison" aria-label="Approach comparison">{columns.map((column, index) => <article key={text(column.id, String(index))}><header><span>{String.fromCharCode(65 + index)}</span><h3>{text(column.title, `Option ${index + 1}`)}</h3></header><div className="visual-comparison-body">{records(column.items).map((entry) => <section key={text(entry.label)}><strong>{text(entry.label)}</strong>{text(entry.detail) ? <p>{text(entry.detail)}</p> : null}</section>)}</div></article>)}</section>;
}

function EvidenceStage({ item }: { item: ThreadTimelineItem }) {
  const evidence = records(item.evidence);
  if (!evidence.length) return <div className="visual-stage-empty"><strong>No source records are attached.</strong><p>This work has not returned inspectable evidence yet.</p></div>;
  return <section className="visual-evidence" aria-label="Returned evidence">{evidence.map((entry, index) => <figure key={text(entry.id, String(index))}><blockquote>{text(entry.body, text(entry.content, text(entry.summary, "Evidence record")))}</blockquote><figcaption><span>{text(entry.source, text(entry.channel, "Venture evidence"))}</span>{dateLabel(entry.at ?? entry.createdAt) ? <small>{dateLabel(entry.at ?? entry.createdAt)}</small> : null}</figcaption></figure>)}</section>;
}

export function renderVisualStage({ visual, timeline, lens, readOnlyReason, artifactFocus, onArtifactFocus, onChanged }: {
  visual: VisualReference;
  timeline: ThreadTimeline | null;
  workIndex: WorkIndex | null;
  directions: Direction[];
  lens: FirmLens | null;
  readOnlyReason: string | null;
  artifactFocus?: ArtifactSectionFocus | null;
  onArtifactFocus?: (focus: ArtifactSectionFocus) => void;
  onOpenThread: (threadRef: string) => void;
  onChanged: () => void;
}) {
  if (visual.kind === "map") return <div className="visual-stage-empty"><strong>The living venture moved to Product / GTM.</strong><p>Use Product / GTM to review current truth, provisional alternatives, outward actions, and returned evidence in one causal surface.</p></div>;
  const item = timeline?.items.find((candidate) => candidate.ref === visual.ref || candidate.visual?.ref === visual.ref) ?? null;
  if (!item) return <div className="visual-stage-empty"><strong>This material is no longer in the current view.</strong><p>The conversation remains intact. Close this view and reopen the latest visual from chat.</p></div>;
  if (visual.kind === "model-view") {
    const view = productGtmViewFromItem(item);
    return view ? <ProductGtmViewGraph view={view} full /> : <div className="visual-stage-empty"><strong>This provisional view is incomplete.</strong><p>The conversation remains intact. Continue in the Thread to revise it in place.</p></div>;
  }
  if (visual.kind === "flow") return <FlowStage item={item} />;
  if (visual.kind === "comparison") return <ComparisonStage item={item} />;
  if (visual.kind === "preview" || visual.kind === "diff") {
    const artifact = item.artifact as Record<string, unknown> | undefined;
    if (artifact?.kind === "native-code") return <CodeWorkspaceStage ventureId={timeline!.ventureId} workspace={artifact as unknown as CodingWorkspace} readOnlyReason={readOnlyReason} onChanged={onChanged} />;
    return <ExactArtifact item={item} artifactRef={visual.ref} artifactFocus={artifactFocus} onArtifactFocus={onArtifactFocus} />;
  }
  if (visual.kind === "evidence") return <EvidenceStage item={item} />;
  if (visual.kind === "consequence") {
    const decision = item.decision as Record<string, unknown> | undefined;
    const wallItem = lens?.wallItems?.find((candidate) => candidate.id === decision?.id) ?? null;
    return <div className="visual-consequence">{wallItem ? <DecisionGate ventureId={timeline!.ventureId} item={wallItem} onDecided={onChanged} readOnlyReason={readOnlyReason} /> : <><h3>{text(item.title, "Consequence")}</h3><pre>{JSON.stringify(item.decision, null, 2)}</pre><p>No external effect occurs from opening this review. Release, apply, deploy, spend, and destructive actions still require their exact host control.</p></>}</div>;
  }
  return <pre className="visual-stage-json">{JSON.stringify(item, null, 2)}</pre>;
}
