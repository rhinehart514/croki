import { Braces, ChevronRight, GitCompareArrows, Network, ShieldCheck } from "lucide-react";
import type { ThreadTimelineItem, VisualReference } from "@/api";
import { ArtifactPreview, DiffView, FilesChanged } from "@/components/review";
import { resolveStagedArtifact } from "@/components/now/reviewArtifact";

type OpenVisual = (visual: VisualReference, origin: HTMLElement) => void;

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const records = (value: unknown) => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];

function VisualButton({ item, onOpenVisual, label = "Open visual" }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual; label?: string }) {
  if (!item.visual) return null;
  return <button type="button" className="thread-inline-action" onClick={(event) => onOpenVisual(item.visual!, event.currentTarget)}>{label}<ChevronRight aria-hidden="true" /></button>;
}

export function ArtifactMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const artifact = item.artifact as Record<string, unknown> | undefined;
  const resolved = resolveStagedArtifact(artifact?.content);
  const structured = artifact?.content as Record<string, unknown> | undefined;
  const flow = structured?.kind === "flow" ? records(structured.steps) : [];
  const owners = Array.isArray(item.ownerLabels) ? item.ownerLabels.filter((value): value is string => typeof value === "string") : [];
  const contributors = Array.isArray(item.contributorLabels) ? item.contributorLabels.filter((value): value is string => typeof value === "string") : [];
  return (
    <article className="thread-rich-card" data-kind={flow.length ? "flow" : "artifact"}>
      <header><span>{flow.length ? <Network aria-hidden="true" /> : <Braces aria-hidden="true" />}{flow.length ? "Flow" : "Live artifact"}</span><strong>{text(item.title, "Visual work")}</strong></header>
      {flow.length ? (
        <ol className="thread-flow-preview">{flow.slice(0, 5).map((step) => <li key={text(step.id, text(step.label))}><span>{text(step.label, "Step")}</span>{text(step.detail) ? <small>{text(step.detail)}</small> : null}</li>)}</ol>
      ) : resolved?.kind === "diff" ? (
        <div className="thread-artifact-preview"><FilesChanged diff={resolved.diff} /></div>
      ) : resolved?.kind === "preview" ? (
        <div className="thread-artifact-preview"><ArtifactPreview artifact={resolved.artifact} /></div>
      ) : <p className="thread-muted">This visual is ready for inspection.</p>}
      <footer><span className="thread-provenance">{owners.length ? `Owned by ${owners.join(", ")}` : "Owner not recorded"}{contributors.length ? ` · ${contributors.join(", ")} contributing` : ""} · {artifact?.verifiedAt ? "Verified" : "Verification not recorded"}</span><VisualButton item={item} onOpenVisual={onOpenVisual} label={flow.length ? "Open flow" : resolved?.kind === "diff" ? "View code" : "Open"} /></footer>
    </article>
  );
}

export function ComparisonMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const alternatives = records(item.alternatives);
  const artifact = item.artifact as Record<string, unknown> | undefined;
  const content = artifact?.content as Record<string, unknown> | undefined;
  const columns = alternatives.length ? alternatives : records(content?.columns);
  return (
    <article className="thread-rich-card" data-kind="comparison">
      <header><span><GitCompareArrows aria-hidden="true" />Comparison</span><strong>{text(item.title, "Approaches")}</strong></header>
      <div className="thread-comparison-grid">{columns.slice(0, 3).map((column, index) => (
        <section key={text(column.id, String(index))}><small>{String.fromCharCode(65 + index)}</small><h4>{text(column.title, `Approach ${index + 1}`)}</h4>{records(column.items).slice(0, 3).map((entry) => <p key={text(entry.label)}>{text(entry.label)}</p>)}</section>
      ))}</div>
      <footer><VisualButton item={item} onOpenVisual={onOpenVisual} label="Compare" /></footer>
    </article>
  );
}

export function EvidenceMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const evidence = records(item.evidence);
  return (
    <article className="thread-rich-card" data-kind="evidence">
      <header><span>Evidence</span><strong>{text(item.title, "Evidence returned")}</strong></header>
      <ul className="thread-evidence-list">{evidence.slice(0, 4).map((entry, index) => <li key={text(entry.id, String(index))}>{text(entry.summary, text(entry.body, text(entry.content, "Evidence record returned")))}</li>)}</ul>
      <footer><span className="thread-provenance">{evidence.length} cited {evidence.length === 1 ? "record" : "records"}</span><VisualButton item={item} onOpenVisual={onOpenVisual} /></footer>
    </article>
  );
}

export function ConsequenceMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const decision = item.decision as Record<string, unknown> | undefined;
  const effect = decision?.effect as Record<string, unknown> | undefined;
  return (
    <article className="thread-rich-card" data-kind="consequence">
      <header><span><ShieldCheck aria-hidden="true" />Founder boundary</span><strong>{text(item.title, "Ready for approval")}</strong></header>
      <dl className="thread-consequence-grid"><div><dt>External effect</dt><dd>{effect ? text(effect.kind, "Waiting for exact review") : "None until a founder action"}</dd></div><div><dt>Status</dt><dd>{decision?.decision == null ? "Waiting on you" : text(decision.decision, "Decided")}</dd></div></dl>
      <footer><VisualButton item={item} onOpenVisual={onOpenVisual} label="Review everything" /></footer>
    </article>
  );
}

export function ActivityDisclosure({ item }: { item: ThreadTimelineItem }) {
  return <details className="thread-activity"><summary>{text(item.summary, "Run activity available")}</summary><p>Full receipts remain available for verification and are not mixed into the conversation.</p></details>;
}

export function ExactArtifact({ item }: { item: ThreadTimelineItem }) {
  const artifact = item.artifact as Record<string, unknown> | undefined;
  const resolved = resolveStagedArtifact(artifact?.content);
  if (resolved?.kind === "diff") return <div className="visual-stage-artifact"><FilesChanged diff={resolved.diff} /><DiffView diff={resolved.diff} /></div>;
  if (resolved?.kind === "preview") return <div className="visual-stage-artifact"><ArtifactPreview artifact={resolved.artifact} /></div>;
  return <pre className="visual-stage-json">{JSON.stringify(artifact?.content ?? item, null, 2)}</pre>;
}
