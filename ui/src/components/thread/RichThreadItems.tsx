import { ChevronRight } from "lucide-react";
import type { ThreadTimelineItem, VisualReference } from "@/api";
import { ArtifactPreview, DiffView, FilesChanged } from "@/components/review";
import { resolveStagedArtifact } from "@/components/now/reviewArtifact";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";

type OpenVisual = (visual: VisualReference, origin: HTMLElement) => void;

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const records = (value: unknown) => Array.isArray(value) ? value as Array<Record<string, unknown>> : [];

function MaterialReference({ item, onOpenVisual, kind, materialKind, title, detail, action = "Open", attention = false }: {
  item: ThreadTimelineItem;
  onOpenVisual: OpenVisual;
  kind: string;
  materialKind: "artifact" | "native-code" | "flow" | "model-view" | "comparison" | "evidence" | "consequence";
  title: string;
  detail?: string | null;
  action?: string;
  attention?: boolean;
}) {
  const content = (
    <>
      <span className="thread-material-kind" data-attention={attention ? "true" : undefined}>{kind}</span>
      <span className="thread-material-copy">
        <strong title={title}>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {item.visual ? <span className="thread-material-action">{action}<ChevronRight aria-hidden="true" /></span> : null}
    </>
  );
  return (
    <div className="thread-material" data-kind={materialKind} data-attention={attention ? "true" : undefined}>
      {item.visual ? <button type="button" onClick={(event) => onOpenVisual(item.visual!, event.currentTarget)} aria-label={`${action}: ${title}`}>{content}</button> : <div>{content}</div>}
    </div>
  );
}

// The transcript stays a compact reference: the card names the changed files and the exact ±count,
// while the diff itself opens beside the conversation. Beyond this many rows the count carries the rest.
const MAX_CARD_FILES = 8;

function cardChangedFiles(value: unknown): Array<{ status: string; path: string }> {
  return records(value).flatMap((entry) => (
    typeof entry.path === "string" && entry.path ? [{ status: text(entry.status, "M").charAt(0), path: entry.path }] : []
  ));
}

// diffStat is raw `git diff --stat` output; only its closing counts belong in the transcript.
function diffStatCounts(value: unknown): { added: number | null; removed: number | null } {
  const stat = text(value);
  const added = /(\d+) insertion/.exec(stat);
  const removed = /(\d+) deletion/.exec(stat);
  return { added: added ? Number(added[1]) : null, removed: removed ? Number(removed[1]) : null };
}

function NativeCodeChanges({ item, onOpenVisual, receipt, files }: {
  item: ThreadTimelineItem;
  onOpenVisual: OpenVisual;
  receipt: string;
  files: Array<{ status: string; path: string }>;
}) {
  const title = text(item.title, "Code changes");
  const { added, removed } = diffStatCounts((item.artifact as Record<string, unknown> | undefined)?.diffStat);
  const shown = files.slice(0, MAX_CARD_FILES);
  const hidden = files.length - shown.length;
  const header = (
    <>
      <span className="thread-material-kind">Code</span>
      <span className="thread-material-copy">
        <strong title={title}>{`${files.length} changed ${files.length === 1 ? "file" : "files"}`}</strong>
        {receipt ? <small>{receipt}</small> : null}
      </span>
      <span className="thread-material-action">
        {added != null || removed != null ? <span className="thread-code-stat"><span data-tone="added">+{added ?? 0}</span><span data-tone="removed">−{removed ?? 0}</span></span> : null}
        <span>View diff</span><ChevronRight aria-hidden="true" />
      </span>
    </>
  );
  return (
    <div className="thread-material thread-code-changes" data-kind="native-code">
      {item.visual
        ? <button type="button" onClick={(event) => onOpenVisual(item.visual!, event.currentTarget)} aria-label={`Show changes: ${title}`}>{header}</button>
        : <div>{header}</div>}
      <ul className="thread-code-files">
        {shown.map((file) => <li key={`${file.status}:${file.path}`} data-status={file.status}><span aria-hidden="true">{file.status}</span><code>{file.path}</code></li>)}
        {hidden > 0 ? <li data-more="true">{`+${hidden} more ${hidden === 1 ? "file" : "files"}`}</li> : null}
      </ul>
    </div>
  );
}

export function ArtifactMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const artifact = item.artifact as Record<string, unknown> | undefined;
  const structured = artifact?.content as Record<string, unknown> | undefined;
  const modelView = structured?.kind === "model-view" ? records(structured.nodes) : [];
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
  const codeFiles = nativeCode ? cardChangedFiles(artifact?.changedFiles) : [];
  if (nativeCode && codeFiles.length) return <NativeCodeChanges item={item} onOpenVisual={onOpenVisual} receipt={receipt} files={codeFiles} />;
  const action = nativeCode ? "Show changes" : modelView.length ? "Open view" : flow.length ? "Open flow" : "Open";
  return <MaterialReference item={item} onOpenVisual={onOpenVisual} kind={nativeCode ? "Code" : modelView.length ? "Product / GTM" : flow.length ? "Flow" : "Artifact"} materialKind={nativeCode ? "native-code" : modelView.length ? "model-view" : flow.length ? "flow" : "artifact"} title={text(item.title, "Visual work")} detail={receipt || (modelView.length ? `${modelView.length} connected ${modelView.length === 1 ? "item" : "items"}` : flow.length ? `${flow.length} ${flow.length === 1 ? "step" : "steps"}` : null)} action={action} />;
}

export function ComparisonMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const alternatives = records(item.alternatives);
  const artifact = item.artifact as Record<string, unknown> | undefined;
  const content = artifact?.content as Record<string, unknown> | undefined;
  const columns = alternatives.length ? alternatives : records(content?.columns);
  const detail = columns.length ? `${columns.length} ${columns.length === 1 ? "approach" : "approaches"}` : "No alternatives recorded";
  return <MaterialReference item={item} onOpenVisual={onOpenVisual} kind="Compare" materialKind="comparison" title={text(item.title, "Approaches")} detail={detail} action="Compare" />;
}

export function EvidenceMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const evidence = records(item.evidence).flatMap((entry, index) => {
    const summary = text(entry.summary, text(entry.body, text(entry.content)));
    return summary ? [{ entry, index, summary }] : [];
  });
  const detail = evidence.length ? `${evidence.length} cited ${evidence.length === 1 ? "record" : "records"}` : "Source details unavailable";
  return <MaterialReference item={item} onOpenVisual={onOpenVisual} kind="Evidence" materialKind="evidence" title={text(item.title, "Evidence returned")} detail={detail} />;
}

export function ConsequenceMessage({ item, onOpenVisual }: { item: ThreadTimelineItem; onOpenVisual: OpenVisual }) {
  const decision = item.decision as Record<string, unknown> | undefined;
  const effect = decision?.effect as Record<string, unknown> | undefined;
  const waiting = decision?.decision == null;
  const effectLabel = effect ? text(effect.kind, "Exact action waiting") : "No external action until you decide";
  const detail = waiting ? effectLabel : text(decision?.decision, "Decision recorded").replaceAll("-", " ");
  return <MaterialReference item={item} onOpenVisual={onOpenVisual} kind={waiting ? "Needs review" : "Reviewed"} materialKind="consequence" title={text(item.title, "Ready for approval")} detail={detail} action="Review" attention={waiting} />;
}

export function ExactArtifact({ item, artifactRef, artifactFocus, onArtifactFocus }: {
  item: ThreadTimelineItem;
  artifactRef?: string;
  artifactFocus?: ArtifactSectionFocus | null;
  onArtifactFocus?: (focus: ArtifactSectionFocus) => void;
}) {
  const artifact = item.artifact as Record<string, unknown> | undefined;
  const resolved = resolveStagedArtifact(artifact?.content);
  if (resolved?.kind === "diff") return <div className="visual-stage-artifact"><FilesChanged diff={resolved.diff} /><DiffView diff={resolved.diff} /></div>;
  if (resolved?.kind === "preview") {
    // A caption becomes the memo's hero headline, and the stage header directly above already renders
    // this material's title — injecting it put the same words on screen twice inside one panel. For an
    // image or an embedded page the caption is the alt and figure text, so there it still earns its place.
    const captioned = resolved.artifact.kind === "image" || resolved.artifact.kind === "html";
    return <div className="visual-stage-artifact"><ArtifactPreview
      artifact={captioned ? { ...resolved.artifact, caption: resolved.artifact.caption ?? text(item.title) } : resolved.artifact}
      artifactRef={artifactRef}
      artifactAt={item.at ?? null}
      focusedSectionId={artifactFocus && artifactFocus.artifactRef === artifactRef ? artifactFocus.sectionId : null}
      onFocusSection={onArtifactFocus}
    /></div>;
  }
  // Reached only when the item carries no artifact content at all. The founder opened this expecting
  // exact material; the honest answer is that there is none, not the timeline record as JSON.
  return <div className="visual-stage-empty"><strong>No material was attached to this item.</strong><p>The conversation remains the governing record of what this work produced.</p></div>;
}
