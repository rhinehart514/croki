import { useState } from "react";
import type { ReleaseDetail, ReleaseIndex, ReleaseMutation, SystemIndexObject, WorkIndexItem } from "@/api";
import { ReleaseActivity } from "./ReleaseActivity";
import { ReleaseBuild } from "./ReleaseBuild";
import { ReleasePath } from "./ReleasePath";
import type { ReleasePathKey } from "./releaseRecords";
import "./release-workspace.css";

/** @deprecated Removed by the shared-shell integration after it stops persisting release subviews. */
export type ReleaseSubview = "overview" | "build" | "activity" | "settings";
export type ReleaseSeed = { kind: string; ref: string; label: string; suggestedRole: string } | null;

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
  onSelectRelease?: (releaseId: string) => void;
  onStartRelease?: () => void;
  /** @deprecated Ignored while the integration shell removes the old contract. */
  subview?: ReleaseSubview;
  /** @deprecated Ignored while the integration shell removes the old contract. */
  onSubview?: (view: ReleaseSubview) => void;
  /** @deprecated Conversation is mounted permanently by the integration shell. */
  onOpenChat?: (source: HTMLElement) => void;
};

function ReleaseSelector({ index, release, onSelect, onStart }: {
  index: ReleaseIndex | null;
  release: ReleaseDetail | null;
  onSelect?: (releaseId: string) => void;
  onStart?: () => void;
}) {
  return <div className="release-selector">
    <label><span>Release</span><select aria-label="Release" value={release?.id ?? ""} disabled={!index?.releases.length || !onSelect} onChange={(event) => onSelect?.(event.target.value)}>
      {!release ? <option value="">{index?.releases.length ? "Choose a release" : "No releases yet"}</option> : null}
      {index?.releases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <button type="button" disabled={!onStart} onClick={onStart}>New release</button>
  </div>;
}

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
  const [name, setName] = useState("");
  const [statement, setStatement] = useState("");
  const [linkLabel, setLinkLabel] = useState(draftContext?.suggestedRole ?? "Moves to market");
  return <section className="release-draft">
    <span>Unsaved draft</span>
    <h2>Name the movement, then connect it</h2>
    <p>This becomes canonical only when you save it. Nothing crosses into the world.</p>
    <label>Release name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="What is moving to market?" /></label>
    <label>Intent<textarea value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="What changes for the customer or market?" /></label>
    {draftContext ? <div className="release-draft-context"><span>Starts from</span><strong>{draftContext.label}</strong>{draftContext.kind === "object" ? <label>Relationship<input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} /><small>Confirm or rewrite the inferred relationship before saving.</small></label> : null}</div> : null}
    {readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}
    <button type="button" disabled={!name.trim() || Boolean(readOnlyReason)} onClick={() => void onCreate({ name, statement, ...(draftContext?.kind === "object" ? { linkLabel } : {}) })}>Save release</button>
  </section>;
}

export function ReleaseWorkspace(props: ReleaseWorkspaceProps) {
  const { index, release, draftContext, objects, threads, readOnlyReason, onCreate, onMutate, onChanged, onSelectRelease, onStartRelease } = props;
  const [configure, setConfigure] = useState<{ releaseId: string; step: Exclude<ReleasePathKey, "evidence"> } | null>(null);
  const lifecycle = release?.lifecycle === "in-market" ? "In market" : release?.lifecycle === "ended" ? "Ended" : "Draft";

  return <main className="mode-workspace release-workspace">
    <header className="mode-workspace-header release-workspace-header">
      <div><span>{release ? lifecycle : "Releases"}</span><h1>{release?.name ?? (draftContext ? "New release from this" : "Market movement")}</h1><p>{release?.statement || "Join the product change, its path outward, the exact action, and what reality sends back."}</p></div>
      <div className="release-header-actions"><ReleaseSelector index={index} release={release} onSelect={onSelectRelease} onStart={onStartRelease} />{release ? <ReleaseDetails key={release.id} release={release} readOnlyReason={readOnlyReason} onMutate={onMutate} /> : null}</div>
    </header>
    {!release ? <><ReleaseDraft draftContext={draftContext} readOnlyReason={readOnlyReason} onCreate={onCreate} />{index?.unassignedActions.length ? <aside className="release-unassigned"><strong>Unassigned release actions</strong><p>{index.unassignedActions.length} exact founder-held {index.unassignedActions.length === 1 ? "action is" : "actions are"} not joined to a release. Nothing was assigned by inference.</p></aside> : null}</> : <div className="release-workspace-body">
      {release.attention.length ? <p className="release-attention" role="status"><strong>Needs you</strong> · {release.attention.map((item) => item.replace("-", " ")).join(" · ")}</p> : null}
      <ReleasePath release={release} objects={objects} threads={threads} readOnlyReason={readOnlyReason} onConfigure={(step) => { if (step !== "evidence") setConfigure({ releaseId: release.id, step }); }} onMutate={onMutate} onChanged={onChanged} />
      {configure?.releaseId === release.id ? <ReleaseBuild key={`${release.id}:${configure.step}`} release={release} step={configure.step} objects={objects} threads={threads} readOnlyReason={readOnlyReason} onMutate={onMutate} onClose={() => setConfigure(null)} /> : null}
      <ReleaseActivity release={release} />
      {index?.unassignedActions.length ? <aside className="release-unassigned release-unassigned-inline"><strong>Outside this release</strong><p>{index.unassignedActions.length} exact founder-held {index.unassignedActions.length === 1 ? "action remains" : "actions remain"} unassigned.</p></aside> : null}
    </div>}
  </main>;
}
