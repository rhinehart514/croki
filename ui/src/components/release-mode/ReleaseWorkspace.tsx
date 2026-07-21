import { useState } from "react";
import type { ReleaseDetail, ReleaseIndex, ReleaseMutation, SystemIndexObject, WorkIndexItem } from "@/api";
import { ReleaseActivity } from "./ReleaseActivity";
import { ReleasePath } from "./ReleasePath";
import { ReleaseObservation } from "./ReleaseObservation";
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
  onCreate: (value: { name: string; statement: string; linkLabel?: string }) => Promise<string | void>;
  onRunAgent: (subjectRefs: string[], instruction: string) => void;
  onOpenProductGtm: (objectRef?: string) => void;
  onMutate: (mutations: ReleaseMutation[]) => Promise<void>;
  onChanged: () => void;
  onReconnect: () => void;
  onGrantObservation: (value: { source: "gmail"; purpose: string; startsAt: string; endsAt: string; returnConditions: string[] }) => Promise<void>;
  onCheckObservation: (contractId: string) => Promise<void>;
  onRevokeObservation: (contractId: string) => Promise<void>;
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

const DRAFT_STEPS = [
  ["Product delta", "The exact Product change moving outward."],
  ["Customer consequence", "What becomes different for a specific customer."],
  ["Distribution", "The pipeline or route that reaches them."],
  ["Outward action", "The exact founder-approved action to take."],
  ["Evidence", "The response, result, or silence that returns."],
] as const;

function ReleaseDraftPath({ draftContext, readOnlyReason, onCreate, onRunAgent, onOpenProductGtm }: Pick<ReleaseWorkspaceProps, "draftContext" | "readOnlyReason" | "onCreate" | "onRunAgent" | "onOpenProductGtm">) {
  const sourceStep = draftContext?.suggestedRole === "Distribution" ? 2 : 0;
  return <div className="release-draft-canvas-wrap">
    <section className="release-draft-canvas" aria-labelledby="release-draft-title">
      <header><span>Unsaved release</span><h2 id="release-draft-title">{draftContext ? draftContext.name : "Start from something real"}</h2><p>{draftContext ? draftContext.statement : "Choose the Product change or customer path you want to move into the world."}</p>{!draftContext ? <button type="button" onClick={() => onOpenProductGtm()}>Open Agent workflows</button> : null}</header>
      <ol>{DRAFT_STEPS.map(([title, prompt], index) => {
        const populated = Boolean(draftContext) && sourceStep === index;
        return <li data-empty={!populated} key={title}>
          <span>{title}</span><strong>{populated ? draftContext?.label : prompt}</strong><small>{populated ? ["Known source", draftContext?.workLabel].filter(Boolean).join(" · ") : "Open connection"}</small>{index < DRAFT_STEPS.length - 1 ? <i aria-hidden="true">→</i> : null}
        </li>;
      })}</ol>
    </section>
    {draftContext ? <div className="release-draft-action"><div><strong>Turn this truth into market movement</strong><p>The agent will connect what it can support, prepare the outward action, and stop at your authority.</p></div><button type="button" disabled={Boolean(readOnlyReason)} onClick={() => void onCreate({ name: draftContext.name, statement: draftContext.statement, ...(draftContext.objectRef ? { linkLabel: draftContext.suggestedRole } : {}) }).then((releaseRef) => onRunAgent([typeof releaseRef === "string" ? releaseRef : draftContext.ref, draftContext.ref], "Build and operate this release end to end from the exact joined venture truth. Resolve every missing Product, customer, distribution, action, and evidence link you can support. Prepare concrete outward actions, but stop at founder authority. Establish bounded evidence return and report unsupported assumptions instead of inventing them."))}>Build release with agent</button></div> : null}
  </div>;
}

export function ReleaseWorkspace(props: ReleaseWorkspaceProps) {
  const { index, release, draftContext, objects, threads, readOnlyReason, onCreate, onRunAgent, onOpenProductGtm, onMutate, onChanged, onReconnect, onGrantObservation, onCheckObservation, onRevokeObservation } = props;
  const lifecycle = release?.lifecycle === "in-market" ? "In market" : release?.lifecycle === "ended" ? "Ended" : "Draft";
  const situation = !release ? null : release.attention.length
    ? `Needs you · ${release.attention.map((item) => item.replace("-", " ")).join(" · ")}`
    : release.outcomes.length
      ? `${release.outcomes.length} market ${release.outcomes.length === 1 ? "return" : "returns"} · decide what changes next`
      : release.lifecycle === "in-market"
        ? "In market · waiting for attributable evidence"
        : "Preparing · connect the open path and release one exact action";

  return <main className="mode-workspace release-workspace">
    <header className="mode-workspace-header release-workspace-header">
      <div><span>{release ? lifecycle : "Releases"}</span><h1>{release?.name ?? (draftContext ? "Release from selected truth" : "Market movement")}</h1><p>{situation ?? "Move a real Product change through the market and bring attributable reality back."}</p></div>
      <div className="release-header-actions">{release ? <><button type="button" onClick={() => onOpenProductGtm(release.relatedObjectRefs[0])}>Open source</button><button className="release-operator-button" type="button" onClick={() => onRunAgent([release.releaseRef], "Operate this release toward market movement and returned evidence. Inspect the full release path, repair supported gaps, prepare the next exact actions, and prepare consequential outward work for founder approval. Continue autonomously through reversible work and stop only at a founder gate or a genuinely unsupported decision.")}>{release.attention.length ? "Prepare my decision" : release.lifecycle === "in-market" ? "Check market return" : "Advance with agent"}</button><ReleaseDetails key={release.id} release={release} readOnlyReason={readOnlyReason} onMutate={onMutate} /></> : null}</div>
    </header>
    {readOnlyReason ? <p className="mode-connection-state" role="status">{readOnlyReason}</p> : null}
    {!release ? <><ReleaseDraftPath key={draftContext?.ref ?? "empty"} draftContext={draftContext} readOnlyReason={readOnlyReason} onCreate={onCreate} onRunAgent={onRunAgent} onOpenProductGtm={onOpenProductGtm} />{index?.unassignedActions.length ? <aside className="release-unassigned"><strong>Unassigned release actions</strong><p>{index.unassignedActions.length} exact founder-held {index.unassignedActions.length === 1 ? "action is" : "actions are"} not joined to a release. Nothing was assigned by inference.</p></aside> : null}</> : <div className="release-workspace-body is-canvas">
      <ReleasePath key={release.id} release={release} objects={objects} threads={threads} readOnlyReason={readOnlyReason} onResolve={(step) => onRunAgent([release.releaseRef, `release-step:${step}`], `Resolve the ${step} gap for this release using exact venture truth. Make reversible progress autonomously, update supported release context, and prepare any consequential outward action for founder approval. Do not fabricate a missing relationship or market fact.`)} onMutate={onMutate} onChanged={onChanged} onReconnect={onReconnect} onOpenProductGtm={onOpenProductGtm} evidencePanel={<ReleaseObservation release={release} readOnlyReason={readOnlyReason} onGrant={onGrantObservation} onCheck={onCheckObservation} onRevoke={onRevokeObservation} onReconnect={onReconnect} />} tracePanel={<ReleaseActivity release={release} />} />
      {index?.unassignedActions.length ? <aside className="release-unassigned release-unassigned-inline"><strong>Outside this release</strong><p>{index.unassignedActions.length} exact founder-held {index.unassignedActions.length === 1 ? "action remains" : "actions remain"} unassigned.</p></aside> : null}
    </div>}
  </main>;
}
