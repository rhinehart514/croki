import { Braces, ChevronRight, FileCode2, GitCompareArrows, Network, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
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

function RichItemHeader({ eyebrow, title, action }: { eyebrow: ReactNode; title: string; action?: ReactNode }) {
  return (
    <header>
      <div className="thread-rich-heading"><span>{eyebrow}</span><strong>{title}</strong></div>
      {action}
    </header>
  );
}

export function ArtifactMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const artifact = item.artifact as Record<string, unknown> | undefined;
  const resolved = resolveStagedArtifact(artifact?.content);
  const inlinePreview = resolved?.kind === "preview" && resolved.artifact.content
    ? { ...resolved.artifact, content: resolved.artifact.content.replace(/^(?:#{1,3}\s*)?(?:preview|artifact)\s*\n+/i, "") }
    : resolved?.kind === "preview" ? resolved.artifact : null;
  const structured = artifact?.content as Record<string, unknown> | undefined;
  const flow = structured?.kind === "flow" ? records(structured.steps) : [];
  const owners = Array.isArray(item.ownerLabels) ? item.ownerLabels.filter((value): value is string => typeof value === "string") : [];
  const contributors = Array.isArray(item.contributorLabels) ? item.contributorLabels.filter((value): value is string => typeof value === "string") : [];
  const nativeCode = artifact?.kind === "native-code";
  const verification = records(artifact?.verification);
  const passedChecks = verification.filter((entry) => entry.status === "passed").length;
  const receipt = [
    owners.length ? owners.join(", ") : null,
    contributors.length ? `${contributors.join(", ")} contributing` : null,
    nativeCode ? text(artifact?.status, "unknown").replaceAll("-", " ") : artifact?.verifiedAt ? "Verified" : null,
    nativeCode && passedChecks ? `${passedChecks} ${passedChecks === 1 ? "check" : "checks"} passed` : null,
  ].filter(Boolean).join(" · ");
  const actionLabel = flow.length ? "Open flow" : resolved?.kind === "diff" ? "View code" : "Open";
  return (
    <article className="thread-rich-card" data-kind={nativeCode ? "native-code" : flow.length ? "flow" : "artifact"}>
      <RichItemHeader
        eyebrow={<>{nativeCode ? <FileCode2 aria-hidden="true" /> : flow.length ? <Network aria-hidden="true" /> : <Braces aria-hidden="true" />}{nativeCode ? "Coding attempt" : flow.length ? "Flow" : "Live artifact"}</>}
        title={text(item.title, "Visual work")}
        action={<VisualButton item={item} onOpenVisual={onOpenVisual} label={actionLabel} />}
      />
      {flow.length ? (
        <ol className="thread-flow-preview">{flow.slice(0, 5).map((step) => <li key={text(step.id, text(step.label))}><span>{text(step.label, "Step")}</span>{text(step.detail) ? <small>{text(step.detail)}</small> : null}</li>)}</ol>
      ) : resolved?.kind === "diff" ? (
        <div className="thread-artifact-preview"><FilesChanged diff={resolved.diff} /></div>
      ) : resolved?.kind === "preview" ? (
        <div className="thread-artifact-preview"><ArtifactPreview artifact={inlinePreview!} /></div>
      ) : <p className="thread-muted">This visual is ready for inspection.</p>}
      {receipt ? <footer><span className="thread-provenance">{receipt}</span></footer> : null}
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
      <RichItemHeader eyebrow={<><GitCompareArrows aria-hidden="true" />Comparison</>} title={text(item.title, "Approaches")} action={<VisualButton item={item} onOpenVisual={onOpenVisual} label="Compare" />} />
      <div className="thread-comparison-grid">{columns.slice(0, 3).map((column, index) => (
        <section key={text(column.id, String(index))}><small>{String.fromCharCode(65 + index)}</small><h4>{text(column.title, `Approach ${index + 1}`)}</h4>{records(column.items).slice(0, 3).map((entry) => <p key={text(entry.label)}>{text(entry.label)}</p>)}</section>
      ))}</div>
    </article>
  );
}

export function EvidenceMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const evidence = records(item.evidence).flatMap((entry, index) => {
    const summary = text(entry.summary, text(entry.body, text(entry.content)));
    return summary ? [{ entry, index, summary }] : [];
  });
  if (!evidence.length) return <div className="thread-rich-empty" data-kind="evidence"><span>Evidence</span><p>Source details unavailable</p></div>;
  return (
    <article className="thread-rich-card" data-kind="evidence">
      <RichItemHeader eyebrow="Evidence" title={text(item.title, "Evidence returned")} action={<VisualButton item={item} onOpenVisual={onOpenVisual} />} />
      <ul className="thread-evidence-list">{evidence.slice(0, 4).map(({ entry, index, summary }) => <li key={text(entry.id, String(index))}>{summary}</li>)}</ul>
      {evidence.length ? <footer><span className="thread-provenance">{evidence.length} cited {evidence.length === 1 ? "record" : "records"}</span></footer> : null}
    </article>
  );
}

export function ConsequenceMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const decision = item.decision as Record<string, unknown> | undefined;
  const effect = decision?.effect as Record<string, unknown> | undefined;
  return (
    <article className="thread-rich-card" data-kind="consequence">
      <RichItemHeader eyebrow={<><ShieldCheck aria-hidden="true" />Founder boundary</>} title={text(item.title, "Ready for approval")} action={<VisualButton item={item} onOpenVisual={onOpenVisual} label="Review everything" />} />
      <dl className="thread-consequence-grid"><div><dt>External effect</dt><dd>{effect ? text(effect.kind, "Waiting for exact review") : "None until a founder action"}</dd></div><div><dt>Status</dt><dd>{decision?.decision == null ? "Waiting on you" : text(decision.decision, "Decided")}</dd></div></dl>
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
