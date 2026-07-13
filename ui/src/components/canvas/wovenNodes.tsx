// wovenNodes — the two synthetic node components the intertwined canvas adds to GraphCanvas's nodeTypes
// (docs/INTERTWINED-CANVAS.md §3). Both are RENDER-TIME projections over getOperatingView's arrays — never
// persisted, re-derived every re-weave (the deriveFunnel discipline). They speak the shipped canvas's
// design language exactly: opaque zinc surfaces (never glass), monochrome ink, Geist, semantic color only
// (the parked pulse; the wall's amber is never borrowed here), no gradients, no water styling.
//
//   ObjectChip  — one shared object drawn ONCE. Its size and ink encode DEGREE (motionCount) so a moat
//                 object is visibly the largest/darkest at any altitude (the far-zoom weight rule, in the
//                 chip itself so N crossings add zero lines). Carries a target handle so every tie from a
//                 touching step lands on it, and focus/dim classes for focus-to-trace.
//   KindCluster — a labeled region chip for a group of same-kind objects (far-zoom blend) or a GTM-type
//                 cluster (the TYPE axis). Its label is an OPEN string; overlap reads as weight, not lines.
//
// The integrator registers these in NODE_TYPES ({ objectChip: memo(ObjectChip), kindCluster:
// memo(KindCluster) }) and hands each node `data` of the matching type below.

import React from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { degreeWeight, type ObjectChipData, type KindClusterData } from "@/lib/wovenLayout";
import type { CanvasAnchorData, CanvasRegionData } from "@/lib/wovenOverlay";
import type { JsonValue } from "@/openCanvasTypes";
import { getGoal, getWorkArtifact, reviseGoal, reviseWorkArtifact } from "@/api";
import { getIdentity } from "@/lib/identity";
import { ArtifactContentRenderer } from "@/components/ArtifactContentRenderer";
import { ArtifactStructuredEditor } from "@/components/ArtifactStructuredEditor";
import { supportsStructuredArtifactEditing } from "@/lib/artifactStructuredEditing";
import "@/styles/woven-canvas.css";

// The one-line provenance receipt shown on hover (the title attr) — plain words plus the ids so a founder
// can trace the bucket back to the run/outcome that produced it. Mirrors OperatorLens's provReceipt so the
// two never disagree; kept local so this component stays self-contained.
function chipReceipt(data: ObjectChipData): string {
  const p = data.provenance;
  const bits = [
    p.kind === "bet" ? "A bet — no touch recorded yet" : "Grounded",
    p.basis,
  ].filter(Boolean);
  if (p.runId) bits.push(`run ${p.runId}`);
  if (p.outcomeId) bits.push(`outcome ${p.outcomeId}`);
  return bits.join(" · ");
}

// The plain-word bucket label — the same words the retired shared-map band used, so the vocabulary carries
// over. Advisory (deriveFunnel), never a gate.
function bucketLabel(bucket: ObjectChipData["bucket"]): string {
  return bucket === "in_flight" ? "in flight"
    : bucket === "handled" ? "handled"
    : bucket === "suppressed" ? "set aside"
    : "seen";
}

function activateOnKeyboard(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.currentTarget.click();
  }
}

// ─── ObjectChip ─────────────────────────────────────────────────────────────────────────────────────
// A small opaque zinc card for one shared object: its label, open kind, degree, and "touched by N motions",
// with the provenance receipt on hover. Size + ink scale with degree (the far-zoom weight rule) so the eye
// finds the moat objects without hunting. The whole card is a real <button> (it selects the object → the
// integrator runs focus-to-trace); a target handle on the left receives every converging tie.
function ObjectChipComponent({ data }: NodeProps<Node<ObjectChipData>>) {
  const degree = data.degree ?? 0;
  // Degree is already the raw motionCount; normalize against a small ceiling so a 2-motion object still
  // reads distinctly larger than a 1-motion one without a canvas-wide pass here (the integrator can pass a
  // pre-normalized degree via v2's sizeByObject; when it doesn't, this local ramp is the honest fallback).
  const norm = data.normDegree ?? Math.min(1, Math.max(0, (degree - 1) / 4));
  const { size, inkStep } = degreeWeight(norm);
  const shared = (data.lanes?.length ?? 0) >= 2;
  const receipt = chipReceipt(data);

  return (
    <div
      className={cn(
        "woven-chip",
        `woven-chip-ink-${inkStep}`,
        shared && "is-shared",
        data.bucket === "in_flight" && "is-inflight",
        data.focus === "focus" && "is-focus",
        data.focus === "dim" && "is-dim",
      )}
      style={{ width: size }}
      // The receipt on hover — the part a screenshot can't clone: where this state came from.
      title={receipt}
      role="button"
      tabIndex={0}
      aria-label={`${data.kind}: ${data.label ?? data.objectKey}. ${bucketLabel(data.bucket)}.`}
      onKeyDown={activateOnKeyboard}
    >
      {/* Every tie lands here: one target handle on the left, one source handle on the right so a chip can
          also feed a downstream step if the integrator wires an outgoing tie. Kept invisible via CSS; the
          converging lines are the intertwining, drawn once. */}
      <Handle type="target" position={Position.Left} id="obj-in" />
      {/* The reuse badge — the moat, named: a shared object is drawn ONCE and every motion that reuses it
          converges here. On a 2+-touch chip it floats as the one teal accent the weave earns; it's the
          "in N motions" pill the reference hangs on the convergence point. */}
      {shared ? (
        <span className="woven-chip-reuse" aria-label={`reused in ${degree} motions`}>
          <span className="woven-chip-reuse-dot" aria-hidden />
          in <b>{degree}</b> motions
        </span>
      ) : null}
      <div className="woven-chip-head">
        <span className="woven-chip-kind">{data.kind}</span>
      </div>
      <span className="woven-chip-label" title={data.objectKey}>
        {data.label ?? data.objectKey}
      </span>
      <span className="woven-chip-foot">
        {shared
          ? <>{bucketLabel(data.bucket)}</>
          : <>touched once · {bucketLabel(data.bucket)}</>}
      </span>
      <Handle type="source" position={Position.Right} id="obj-out" />
    </div>
  );
}

// ─── KindCluster ────────────────────────────────────────────────────────────────────────────────────
// A labeled region chip standing in for a group of same-kind objects (far-zoom blend) or a GTM-type
// cluster on the TYPE axis. The label is an OPEN string (an object kind, or a deriveMotionName motion
// name). Overlap is carried as WEIGHT (its member count + total degree size it up), never as N new lines —
// approach 5's depth principle in flat zinc. Clicking it is the fan-in gesture (the integrator expands it).
function KindClusterComponent({ data }: NodeProps<Node<KindClusterData>>) {
  // A cluster's heft reads off how much it stands in for — more members / more crossings = heavier chip.
  // Normalized against a modest ceiling so a big cluster is clearly weightier without swallowing the canvas.
  const norm = Math.min(1, (data.totalDegree ?? data.count ?? 0) / 24);
  const { size, inkStep } = degreeWeight(norm);
  return (
    <div
      className={cn(
        "woven-cluster",
        `woven-chip-ink-${inkStep}`,
        data.focus === "focus" && "is-focus",
        data.focus === "dim" && "is-dim",
      )}
      style={{ minWidth: size }}
      title={`${data.count} ${data.label} object${data.count === 1 ? "" : "s"} — ${data.totalDegree} crossing${data.totalDegree === 1 ? "" : "s"}. Zoom in to fan into lanes and ties.`}
      role="button"
      tabIndex={0}
      aria-label={`${data.label}: ${data.count} object${data.count === 1 ? "" : "s"}, ${data.totalDegree} crossing${data.totalDegree === 1 ? "" : "s"}.`}
      onKeyDown={activateOnKeyboard}
    >
      <Handle type="target" position={Position.Left} id="cluster-in" />
      <div className="woven-cluster-head">
        <span className="woven-cluster-label">{data.label}</span>
        <span className="woven-cluster-count">{data.count}</span>
      </div>
      <span className="woven-cluster-foot">
        {data.count === 1 ? "1 object" : `${data.count} objects`}
        {data.totalDegree > 0 ? <> · <b>{data.totalDegree}</b> crossings</> : null}
      </span>
      <Handle type="source" position={Position.Right} id="cluster-out" />
    </div>
  );
}

// Memoized at export so a re-weave that leaves most chips unchanged doesn't re-render every one (React Flow
// passes stable data/selected props — the default shallow compare is correct), matching GraphCanvas's own
// NODE_TYPES discipline. The integrator spreads these into its nodeTypes map.
// Register these in GraphCanvas's NODE_TYPES under { objectChip: ObjectChip, kindCluster: KindCluster } —
// the integrator adds those two keys, matching the shipped memoized-node discipline. (No node-types map is
// exported here: a component file that also exports a plain object breaks Fast Refresh, so the map is the
// integrator's one line, not this file's.)
// ─── CanvasAnchor ───────────────────────────────────────────────────────────────────────────────────
// A stable canvas landmark from operatingView.woven.canvas (fix 3): product truth, a question, or an
// outcome. Rendered ADDITIVELY beside the object weaving — opaque zinc, monochrome, one semantic accent
// (--gap/amber) reserved for the outcome-return landmark, never decoration. Selecting it runs anchor
// focus-to-trace (the integrator wires the click → onWovenSelect({ kind:"anchor", anchorId })).
const ANCHOR_KIND_LABEL: Record<string, string> = {
  "product-truth": "Product truth",
  "product-model": "Product",
  "product-thing": "Product",
  "product-goal": "User goal",
  "product-state": "State",
  "product-workflow": "Workflow",
  "product-interaction": "Interaction",
  question: "Open question",
  goal: "Goal",
  "code-change": "Product change",
  outcome: "Outcome",
  "terrain-opening": "Inferred opening",
  "terrain-tension": "Inferred tension",
  "terrain-hypothesis": "Working hypothesis",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function editKey(prefix: string): string {
  return `canvas:${prefix}:${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`;
}

function InlineAnchorDetails({ data }: { data: CanvasAnchorData }) {
  const projectedBody = isRecord(data.body) ? data.body : null;
  const [loadedBody, setLoadedBody] = React.useState<Record<string, unknown> | null>(projectedBody);
  const body = loadedBody;
  const isGoal = data.ref.type === "goal" && body;
  const isWork = data.ref.type === "work-artifact" && body;
  const isProductChange = data.ref.type === "product-change" && body;
  const revision = Number(body?.revision ?? 0);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState(String(body?.title ?? data.label));
  const [statement, setStatement] = React.useState(String(body?.statement ?? data.label));
  const [desiredChange, setDesiredChange] = React.useState(String(body?.desiredChange ?? ""));
  const [content, setContent] = React.useState<JsonValue>((body?.content ?? "") as JsonValue);
  const [contentSource, setContentSource] = React.useState(typeof body?.content === "string" ? body.content : JSON.stringify(body?.content ?? "", null, 2));
  const contentType = String(body?.contentType ?? "text/plain");
  const summary = String(body?.summary ?? "");

  React.useEffect(() => {
    const projectId = String(projectedBody?.projectId ?? "");
    if (!projectId || (data.ref.type !== "goal" && data.ref.type !== "work-artifact")) return;
    let live = true;
    const read = data.ref.type === "goal"
      ? getGoal(projectId, data.ref.id, { includeRetired: true }).then((result) => result.goal)
      : getWorkArtifact(projectId, data.ref.id, { includeRetired: true }).then((result) => result.artifact);
    void read.then((record) => { if (live) setLoadedBody(record as unknown as Record<string, unknown>); }).catch(() => undefined);
    return () => { live = false; };
  }, [data.ref.id, data.ref.type, projectedBody?.projectId]);

  const save = async () => {
    if (!body) return;
    setSaving(true);
    setError(null);
    try {
      const projectId = String(body.projectId ?? "");
      if (isGoal) {
        await reviseGoal(projectId, data.ref.id, {
          expectedRevision: revision,
          statement: statement.trim(),
          desiredChange: desiredChange.trim(),
          revisionAuthor: getIdentity().userId,
          idempotencyKey: editKey("revise-goal"),
        });
      } else if (isWork) {
        let nextContent = content;
        if (!structured) {
          if (contentType.includes("json")) nextContent = JSON.parse(contentSource) as JsonValue;
          else nextContent = contentSource;
        }
        await reviseWorkArtifact(projectId, data.ref.id, {
          expectedArtifactRevision: revision,
          title: title.trim(),
          summary,
          kind: String(body.kind ?? data.kind),
          contentType,
          format: String(body.format ?? (contentType.includes("json") ? "json" : "text")),
          content: nextContent,
          createdBy: { type: "founder", id: getIdentity().userId, name: getIdentity().name },
          idempotencyKey: editKey("revise-work"),
        });
      }
      setEditing(false);
      await data.onAuthorityChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This canvas edit could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (!isGoal && !isWork && !isProductChange) return null;
  const structured = isWork && supportsStructuredArtifactEditing(content, contentType);
  return (
    <div className="woven-anchor-expanded nodrag nopan" onClick={(event) => event.stopPropagation()}>
      {editing ? (
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {isGoal ? <>
            <label>Goal<textarea value={statement} onChange={(event) => setStatement(event.target.value)} rows={3} /></label>
            <label>What changes<textarea value={desiredChange} onChange={(event) => setDesiredChange(event.target.value)} rows={2} /></label>
          </> : <>
            <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            {structured ? <ArtifactStructuredEditor content={content} contentType={contentType} onChange={setContent} />
              : <label>Content<textarea value={contentSource} onChange={(event) => setContentSource(event.target.value)} rows={7} /></label>}
          </>}
          <div className="woven-anchor-edit-actions"><button type="button" onClick={() => setEditing(false)}>Cancel</button><button type="submit" disabled={saving || (isGoal ? !statement.trim() : !title.trim())}>{saving ? "Saving…" : "Save revision"}</button></div>
        </form>
      ) : <>
        {isGoal && desiredChange ? <p>{desiredChange}</p> : null}
        {isWork ? <ArtifactContentRenderer content={content} contentType={contentType} /> : null}
        {isProductChange ? <>
          <p>{String(body.status ?? "Waiting for review")} · {String(body.provider ?? "runtime not recorded")} · {String(body.model ?? "model not recorded")}</p>
          <ArtifactContentRenderer content={String(body.diff ?? "No retained difference is available.")} contentType="text/x-diff" />
        </> : null}
        {!isProductChange ? <button type="button" className="woven-anchor-edit" onClick={() => setEditing(true)}>Edit here</button> : null}
      </>}
      {error ? <p className="woven-anchor-edit-error" role="alert">{error}</p> : null}
    </div>
  );
}

function CanvasAnchorComponent({ data, selected }: NodeProps<Node<CanvasAnchorData>>) {
  const isOutcome = data.kind === "outcome";
  const isQuestion = data.kind === "question";
  const isTerrain = data.kind.startsWith("terrain-");
  const isGoal = data.ref.type === "goal";
  const isWork = data.ref.type === "work-artifact" || data.ref.type === "product-change";
  const terrainTestId = data.kind === "product-truth"
    ? "terrain-product-landmark"
    : isTerrain ? "terrain-hypothesis" : undefined;
  const evidenceCount = isTerrain && isRecord(data.body) && Array.isArray(data.body.evidence)
    ? data.body.evidence.length
    : 0;
  // A summary chip stands in for either one product-detail kind or the remainder of a repeated inferred /
  // outcome run. Both remain keyboard-expandable, so density never trades away access to the real objects.
  if (data.group) {
    const overflow = data.groupType === "overflow";
    const summary = data.groupType === "summary";
    const count = data.count ?? 0;
    const summaryLabel = overflow
      ? `${count} more ${data.label.toLowerCase()}`
      : summary ? `${data.label} ${count}` : data.label;
    return (
      <div
        className={cn("woven-anchor is-group", data.focus === "focus" && "is-focus", data.focus === "dim" && "is-dim")}
        data-testid={isTerrain ? "terrain-hypothesis-group" : undefined}
        data-terrain-count={isTerrain ? count : undefined}
        title={overflow || summary
          ? `${summaryLabel}. Select to show every item.`
          : `${count} ${data.label.toLowerCase()} summarized to keep the map legible. Select to inspect.`}
        role="button"
        tabIndex={0}
        aria-label={overflow || summary
          ? `${summaryLabel}. Show all.`
          : `${data.label}: ${count} product details. Expand group.`}
        onKeyDown={activateOnKeyboard}
      >
        <Handle type="target" position={Position.Left} id="anchor-in" />
        <span className="woven-anchor-eyebrow">{summary ? "Model read" : overflow ? "More on canvas" : "Product detail"}</span>
        <span className="woven-anchor-label">{overflow || summary ? summaryLabel : <>{data.label} <b className="woven-anchor-count">{count}</b></>}</span>
        <span className="woven-anchor-more">{overflow || summary ? "Show all" : "Inspect details"}</span>
        <Handle type="source" position={Position.Right} id="anchor-out" />
      </div>
    );
  }
  const eyebrow = ANCHOR_KIND_LABEL[data.kind]
    ?? data.kind.replace(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
  const connectHint = data.connection?.source
    ? "C cancel"
    : data.connection?.active ? "C connect here" : "C connect";
  return (
    <div
      className={cn(
        "woven-anchor",
        isOutcome && "is-outcome",
        isQuestion && "is-question",
        isTerrain && "is-terrain",
        isGoal && "is-goal",
        isWork && "is-work",
        data.conflict && "has-goal-conflict",
        data.onKeyboardConnect && "is-connectable",
        selected && "is-expanded",
        data.focus === "focus" && "is-focus",
        data.focus === "dim" && "is-dim",
      )}
      title={data.conflict ? `${eyebrow}: ${data.label}. ${data.conflict.detail}` : `${eyebrow}: ${data.label}`}
      data-testid={terrainTestId}
      data-ref={`${data.ref.type ?? "ref"}:${data.ref.id}`}
      role={selected ? "group" : "button"}
      tabIndex={selected ? -1 : 0}
      aria-label={`${data.conflict ? `${eyebrow}: ${data.label}. ${data.conflict.label}. Advisory; work is not blocked.` : `${eyebrow}: ${data.label}`}${data.onKeyboardConnect ? " Press C to connect." : ""}`}
      onKeyDown={selected ? undefined : (event) => {
        if (data.onKeyboardConnect && event.key.toLowerCase() === "c") {
          event.preventDefault();
          event.stopPropagation();
          data.onKeyboardConnect();
          return;
        }
        activateOnKeyboard(event);
      }}
    >
      <Handle type="target" position={Position.Left} id="anchor-in" />
      <span className="woven-anchor-eyebrow">{eyebrow}</span>
      <span className="woven-anchor-label">{data.label}</span>
      {evidenceCount > 0 ? <span className="woven-anchor-proof">{evidenceCount} code {evidenceCount === 1 ? "receipt" : "receipts"}</span> : null}
      {data.conflict ? (
        <span className="woven-anchor-conflict" aria-hidden>
          {data.conflict.count > 1
            ? `${data.conflict.count} shared-work conflicts`
            : `Shared by ${data.conflict.goalCount} active goals`}
        </span>
      ) : null}
      {data.onKeyboardConnect ? <span className="canvas-anchor-connect-hint" aria-hidden>{connectHint}</span> : null}
      {selected ? <InlineAnchorDetails
        key={`${data.ref.type}:${data.ref.id}:${isRecord(data.body) ? String(data.body.revision ?? data.body.updatedAt ?? "") : ""}`}
        data={data}
      /> : null}
      <Handle type="source" position={Position.Right} id="anchor-out" />
    </div>
  );
}

// A region is whitespace with a name: a restrained boundary behind its members, with manipulation kept
// on its header and selected outline. It never owns or deletes the objects inside it.
function CanvasRegionComponent({ data, selected }: NodeProps<Node<CanvasRegionData>>) {
  return (
    <section
      className={cn(
        "canvas-work-region",
        data.collapsed && "is-collapsed",
        selected && "is-selected",
        data.focus === "focus" && "is-focus",
        data.focus === "dim" && "is-dim",
      )}
      aria-label={`Work region: ${data.title}`}
      data-ref={`work-region:${data.regionId}`}
    >
      <NodeResizer
        minWidth={160}
        minHeight={120}
        isVisible={Boolean(selected && !data.collapsed)}
        lineClassName="canvas-region-resize-line"
        handleClassName="canvas-region-resize-handle"
        onResizeEnd={(_event: unknown, params: { width: number; height: number }) => data.onResizeEnd?.({ width: params.width, height: params.height })}
      />
      <header className="canvas-region-drag-handle">
        <button
          type="button"
          className="canvas-region-collapse nodrag nopan"
          aria-label={`${data.collapsed ? "Expand" : "Collapse"} ${data.title}`}
          aria-expanded={!data.collapsed}
          onClick={(event) => { event.stopPropagation(); data.onToggleCollapsed?.(); }}
        >
          {data.collapsed ? "+" : "−"}
        </button>
        <span className="canvas-region-title">{data.title}</span>
        <span className="canvas-region-count">{data.memberCount} {data.memberCount === 1 ? "item" : "items"}</span>
        <button
          type="button"
          className="canvas-region-archive nodrag nopan"
          onClick={(event) => { event.stopPropagation(); data.onArchive?.(); }}
        >
          Archive
        </button>
      </header>
      {!data.collapsed && data.purpose ? <p>{data.purpose}</p> : null}
    </section>
  );
}

// ─── FounderWall ────────────────────────────────────────────────────────────────────────────────────
// The founder wall is a persistent, non-interactive trust boundary. Real gate cards remain the action;
// the conceptual variant simply tells an empty product where outward consequence begins.
function FounderWallComponent({ data }: NodeProps<Node<{ height: number; conceptual?: boolean }>>) {
  return (
    <div className={`woven-wall${data.conceptual ? " is-conceptual" : ""}`} style={{ height: data.height }} aria-hidden="true">
      <span className="woven-wall-label">Your wall · nothing leaves without your review</span>
    </div>
  );
}

export const ObjectChip = React.memo(ObjectChipComponent);
export const KindCluster = React.memo(KindClusterComponent);
export const CanvasAnchor = React.memo(CanvasAnchorComponent);
export const CanvasRegion = React.memo(CanvasRegionComponent);
export const FounderWall = React.memo(FounderWallComponent);
