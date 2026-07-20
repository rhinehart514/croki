import { useState } from "react";
import type { ReleaseDetail, ReleaseIndex, ReleaseMutation, SystemIndexObject, WorkIndexItem } from "@/api";
import { ReleaseActivity } from "./ReleaseActivity";
import { ReleaseBuild } from "./ReleaseBuild";
import { ReleasePath } from "./ReleasePath";
import type { ReleasePathKey } from "./releaseRecords";
import "./release-workspace.css";

export type ReleaseSeed = {
  kind: string;
  ref: string;
  label: string;
  suggestedRole: string;
  name: string;
  statement: string;
  objectRef?: string;
  threadRef?: string;
  workLabel?: string;
} | null;

export type ReleaseWorkspaceProps = {
  index: ReleaseIndex | null;
  release: ReleaseDetail | null;
  draftContext: ReleaseSeed;
  objects: SystemIndexObject[];
  threads: WorkIndexItem[];
  readOnlyReason: string | null;
  onCreate: (value: { name: string; statement: string; linkLabel?: string }) => Promise<void>;
  onMutate: (mutations: ReleaseMutation[]) => Promise<void>;
  onChanged: () => void;
};

function ReleaseDetails({ release, readOnlyReason, onMutate }: {
  release: ReleaseDetail;
  readOnlyReason: string | null;
  onMutate: (mutations: ReleaseMutation[]) => Promise<void>;
}) {
  const [name, setName] = useState(release.name);
  const [statement, setStatement] = useState(release.statement);
  return <details className="release-details">
    <summary>Details</summary>
    <form onSubmit={(event) => { event.preventDefault(); void onMutate([{ op: "update", name, statement }]); }}>
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Intent<textarea value={statement} onChange={(event) => setStatement(event.target.value)} /></label>
      {readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}
      <div><button type="submit" disabled={Boolean(readOnlyReason) || !name.trim()}>Save details</button>{release.lifecycle === "ended"
        ? <button type="button" disabled={Boolean(readOnlyReason)} onClick={() => void onMutate([{ op: "reopen" }])}>Reopen</button>
        : <button type="button" disabled={Boolean(readOnlyReason)} onClick={() => void onMutate([{ op: "end" }])}>End release</button>}</div>
      <small>Ending is explicit and reversible. Releases are never deleted here.</small>
    </form>
  </details>;
}

function ReleaseDraft({ draftContext, readOnlyReason, onCreate }: Pick<ReleaseWorkspaceProps, "draftContext" | "readOnlyReason" | "onCreate">) {
  const [name, setName] = useState(draftContext?.name ?? "");
  const [statement, setStatement] = useState(draftContext?.statement ?? "");
  const [linkLabel, setLinkLabel] = useState(draftContext?.suggestedRole ?? "Moves to market");
  return <section className="release-draft">
    <span>Unsaved draft</span>
    <h2>Review the release seeded from exact venture truth</h2>
    <p>Known Product and Work references are already joined. Missing customer, distribution, action, and evidence links will stay visible. Nothing crosses into the world.</p>
    <label>Release name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="What is moving to market?" /></label>
    <label>Intent<textarea value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="What changes for the customer or market?" /></label>
    {draftContext ? <div className="release-draft-context"><span>Starts from</span><strong>{draftContext.label}</strong>{draftContext.workLabel ? <><span>Exact work</span><strong>{draftContext.workLabel}</strong></> : null}{draftContext.kind === "object" ? <label>Relationship<input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} /><small>Confirm or rewrite the inferred relationship before saving.</small></label> : null}</div> : null}
    {readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}
    <button type="button" disabled={!name.trim() || Boolean(readOnlyReason)} onClick={() => void onCreate({ name, statement, ...(draftContext?.objectRef ? { linkLabel } : {}) })}>Prepare release</button>
  </section>;
}

export function ReleaseWorkspace(props: ReleaseWorkspaceProps) {
  const { index, release, draftContext, objects, threads, readOnlyReason, onCreate, onMutate, onChanged } = props;
  const [configure, setConfigure] = useState<{ releaseId: string; step: Exclude<ReleasePathKey, "evidence"> } | null>(null);
  const lifecycle = release?.lifecycle === "in-market" ? "In market" : release?.lifecycle === "ended" ? "Ended" : "Draft";

  return <main className="mode-workspace release-workspace">
    <header className="mode-workspace-header release-workspace-header">
      <div><span>{release ? lifecycle : "Releases"}</span><h1>{release?.name ?? (draftContext ? "Release from selected truth" : "Market movement")}</h1><p>{release?.statement || "Join the product change, its path outward, the exact action, and what reality sends back."}</p></div>
      <div className="release-header-actions">{release ? <ReleaseDetails key={release.id} release={release} readOnlyReason={readOnlyReason} onMutate={onMutate} /> : null}</div>
    </header>
    {readOnlyReason ? <p className="mode-connection-state" role="status">{readOnlyReason}</p> : null}
    {!release ? <>{draftContext ? <ReleaseDraft key={draftContext.ref} draftContext={draftContext} readOnlyReason={readOnlyReason} onCreate={onCreate} /> : <section className="release-draft release-missing-link"><span>Missing link</span><h2>Start from exact venture context</h2><p>Select verified Work or a Product / GTM capability, audience, offer, or gap first. Drover will carry that truth into the release instead of asking for a blank record.</p></section>}{index?.unassignedActions.length ? <aside className="release-unassigned"><strong>Unassigned release actions</strong><p>{index.unassignedActions.length} exact founder-held {index.unassignedActions.length === 1 ? "action is" : "actions are"} not joined to a release. Nothing was assigned by inference.</p></aside> : null}</> : <div className="release-workspace-body">
      {release.attention.length ? <p className="release-attention" role="status"><strong>Needs you</strong> · {release.attention.map((item) => item.replace("-", " ")).join(" · ")}</p> : null}
      <ReleasePath release={release} objects={objects} threads={threads} readOnlyReason={readOnlyReason} onConfigure={(step) => { if (step !== "evidence") setConfigure({ releaseId: release.id, step }); }} onMutate={onMutate} onChanged={onChanged} />
      {configure?.releaseId === release.id ? <ReleaseBuild key={`${release.id}:${configure.step}`} release={release} step={configure.step} objects={objects} threads={threads} readOnlyReason={readOnlyReason} onMutate={onMutate} onClose={() => setConfigure(null)} /> : null}
      <ReleaseActivity release={release} />
      {index?.unassignedActions.length ? <aside className="release-unassigned release-unassigned-inline"><strong>Outside this release</strong><p>{index.unassignedActions.length} exact founder-held {index.unassignedActions.length === 1 ? "action remains" : "actions remain"} unassigned.</p></aside> : null}
    </div>}
  </main>;
}
