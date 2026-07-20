import { useState } from "react";
import type { ReleaseDetail, ReleaseIndex, ReleaseMutation, SystemIndexObject, WorkIndexItem } from "@/api";
import { ReleaseActivity } from "./ReleaseActivity";
import { ReleaseBuild } from "./ReleaseBuild";

export type ReleaseSubview = "overview" | "build" | "activity" | "settings";
export type ReleaseSeed = { kind: string; ref: string; label: string; suggestedRole: string } | null;

export function ReleaseWorkspace({ index, release, subview, draftContext, objects, threads, readOnlyReason, onSubview, onOpenChat, onCreate, onMutate, onChanged }: {
  index: ReleaseIndex | null; release: ReleaseDetail | null; subview: ReleaseSubview; draftContext: ReleaseSeed;
  objects: SystemIndexObject[]; threads: WorkIndexItem[]; readOnlyReason: string | null;
  onSubview: (view: ReleaseSubview) => void; onOpenChat: (source: HTMLElement) => void;
  onCreate: (value: { name: string; statement: string; linkLabel?: string }) => Promise<void>;
  onMutate: (mutations: ReleaseMutation[]) => Promise<void>; onChanged: () => void;
}) {
  const [name, setName] = useState(""); const [statement, setStatement] = useState("");
  const [linkLabel, setLinkLabel] = useState(draftContext?.suggestedRole ?? "Moves to market");
  if (!release) return <main className="mode-workspace release-workspace">
    <header className="mode-workspace-header"><div><span>Releases</span><h1>{draftContext ? "New release from this" : "Market movement"}</h1><p>Assemble exact outward actions, authorize them at the existing gate, and keep returned evidence joined to what caused it.</p></div><button type="button" onClick={(event) => onOpenChat(event.currentTarget)}>Open chat</button></header>
    <section className="release-draft"><span>Unsaved draft</span><label>Release name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="What is moving to market?" /></label><label>Intent<textarea value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="What changes for the customer or market?" /></label>{draftContext ? <><p>Starts from <strong>{draftContext.label}</strong>.</p>{draftContext.kind === "object" ? <label>Relationship<input value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} /><small>Suggested from the selected object. Confirm or rewrite it before saving.</small></label> : null}</> : null}{readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}<button type="button" disabled={!name.trim() || Boolean(readOnlyReason)} onClick={() => void onCreate({ name, statement, ...(draftContext?.kind === "object" ? { linkLabel } : {}) })}>Save release</button></section>
    {index?.unassignedActions.length ? <section className="release-unassigned"><h2>Unassigned release actions</h2><p>{index.unassignedActions.length} exact founder-held {index.unassignedActions.length === 1 ? "action has" : "actions have"} no release join. Nothing was fabricated.</p></section> : null}
  </main>;
  const missing = [!release.relatedObjectRefs.length && "Product delta or market mechanism", !release.decisions.length && "Exact outward action", !release.outcomes.length && "Returned evidence"].filter(Boolean) as string[];
  return <main className="mode-workspace release-workspace">
    <header className="mode-workspace-header"><div><span>{release.lifecycle.replace("-", " ")}</span><h1>{release.name}</h1><p>{release.statement || "No release intent has been written yet."}</p></div><button type="button" onClick={(event) => onOpenChat(event.currentTarget)}>Open chat</button></header>
    <nav className="release-subnav" aria-label="Release views">{(["overview", "build", "activity", "settings"] as const).map((view) => <button key={view} type="button" aria-current={subview === view ? "page" : undefined} onClick={() => onSubview(view)}>{view}</button>)}</nav>
    {subview === "overview" ? <section className="release-grid"><article><span>Lifecycle</span><h2>{release.lifecycle === "in-market" ? "In market" : release.lifecycle === "ended" ? "Ended" : "Draft"}</h2><p>{release.attention.length ? `Needs you: ${release.attention.join(", ")}` : "No founder-held blocker."}</p></article><article><span>Exact next action</span><h2>{release.decisions.length ? "Review the joined action at the gate" : "Join the outward action"}</h2><p>Opening or editing this release never performs an outward act.</p></article><article><span>Open loops</span>{missing.length ? <ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul> : <p>The release has concrete links across movement and return.</p>}</article></section> : null}
    {subview === "build" ? <ReleaseBuild release={release} objects={objects} threads={threads} readOnlyReason={readOnlyReason} onMutate={onMutate} /> : null}
    {subview === "activity" ? <ReleaseActivity release={release} readOnlyReason={readOnlyReason} onChanged={onChanged} /> : null}
    {subview === "settings" ? <ReleaseSettings release={release} readOnlyReason={readOnlyReason} onMutate={onMutate} /> : null}
  </main>;
}

function ReleaseSettings({ release, readOnlyReason, onMutate }: { release: ReleaseDetail; readOnlyReason: string | null; onMutate: (mutations: ReleaseMutation[]) => Promise<void> }) {
  const [name, setName] = useState(release.name); const [statement, setStatement] = useState(release.statement);
  return <section className="release-settings"><h2>Release settings</h2><label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Intent<textarea value={statement} onChange={(event) => setStatement(event.target.value)} /></label>{readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}<div><button type="button" disabled={Boolean(readOnlyReason) || !name.trim()} onClick={() => void onMutate([{ op: "update", name, statement }])}>Save details</button>{release.lifecycle === "ended" ? <button type="button" disabled={Boolean(readOnlyReason)} onClick={() => void onMutate([{ op: "reopen" }])}>Reopen</button> : <button type="button" disabled={Boolean(readOnlyReason)} onClick={() => void onMutate([{ op: "end" }])}>End release</button>}</div><p>Deletion is intentionally unavailable. Ending is explicit and reversible.</p></section>;
}
