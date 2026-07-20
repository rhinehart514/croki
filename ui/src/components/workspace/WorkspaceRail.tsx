import { Plus, Search, Settings } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { FirmVenture, ReleaseIndex, SystemIndex, WorkIndex, WorkIndexItem } from "@/api";
import { FirmSettings } from "@/components/firm/FirmSettings";
import { VentureCreateDialog } from "@/components/firm/VentureCreateDialog";
import { ThreadList } from "@/components/thread/ThreadList";
import type { WorkspaceMode } from "@/lib/venture-session";
import { WorkspaceModeNav } from "./WorkspaceModeNav";

export function WorkspaceRail({ venture, ventures, mode, width, search, selectedThread, selectedRelease, workIndex, systemIndex, releaseIndex, readOnly, readOnlyReason, onMode, onSearch, onSelectThread, onSelectSystem, onSelectRelease, onNew, onSwitchVenture, onResize, onChanged }: {
  venture: FirmVenture; ventures: FirmVenture[]; mode: WorkspaceMode; width: number; search: string; selectedThread: string | null; selectedRelease: string | null;
  workIndex: WorkIndex | null; systemIndex: SystemIndex | null; releaseIndex: ReleaseIndex | null; readOnly: boolean; readOnlyReason: string;
  onMode: (mode: WorkspaceMode, opener?: HTMLElement) => void; onSearch: (value: string) => void; onSelectThread: (item: WorkIndexItem) => void; onSelectSystem: (scope: "system" | "product" | "gtm" | "attention") => void;
  onSelectRelease: (releaseId: string | null) => void; onNew: () => void; onSwitchVenture: (venture: FirmVenture) => void; onResize: (width: number) => void; onChanged: () => void;
}) {
  const [settings, setSettings] = useState(false); const [create, setCreate] = useState(false); const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); searchRef.current?.focus(); } }; window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut); }, []);
  const resize = (event: PointerEvent<HTMLDivElement>) => { const origin = event.clientX; const start = width; const move = (next: globalThis.PointerEvent) => onResize(Math.min(320, Math.max(208, start + next.clientX - origin))); const done = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", done); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", done); };
  return <aside className="thread-rail workspace-rail" aria-label={`${venture.name} workspace rail`}>
    <details className="thread-venture-switcher"><summary><span>{venture.name.charAt(0)}</span><strong>{venture.name}</strong></summary><div>{ventures.map((candidate) => <button type="button" key={candidate.id} onClick={() => onSwitchVenture(candidate)}>{candidate.name}</button>)}<button type="button" onClick={() => setCreate(true)}><Plus aria-hidden="true" />Start another venture</button></div></details>
    <WorkspaceModeNav mode={mode} onMode={onMode} />
    {mode === "work" ? <button type="button" className="thread-new" onClick={onNew}><Plus aria-hidden="true" />New thread</button> : mode === "releases" ? <button type="button" className="thread-new" onClick={onNew}><Plus aria-hidden="true" />New release</button> : null}
    <label className="thread-search"><Search aria-hidden="true" /><span className="sr-only">Search this workspace</span><input ref={searchRef} type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={mode === "work" ? "Search threads" : mode === "system" ? "Search system" : "Search releases"} /><kbd>⌘K</kbd></label>
    {mode === "work" ? <ThreadList workIndex={workIndex} search={search} selected={selectedThread} onSelect={onSelectThread} /> : null}
    {mode === "system" ? <nav className="mode-rail-list">{(["system", "product", "gtm", "attention"] as const).map((scope) => <button type="button" key={scope} aria-current={systemIndex?.scope === scope ? "page" : undefined} onClick={() => onSelectSystem(scope)}><span>{scope === "system" ? "Whole system" : scope === "gtm" ? "GTM" : scope === "attention" ? "Needs attention" : "Product"}</span>{scope === "attention" && systemIndex?.counts.attention ? <small>{systemIndex.counts.attention}</small> : null}</button>)}</nav> : null}
    {mode === "releases" ? <ReleaseRail index={releaseIndex} selected={selectedRelease} onSelect={onSelectRelease} /> : null}
    <button type="button" className="thread-settings" onClick={() => setSettings(true)}><Settings aria-hidden="true" />Settings</button>
    <div className="thread-rail-resizer" role="separator" aria-label="Resize workspace rail" aria-orientation="vertical" aria-valuemin={208} aria-valuemax={320} aria-valuenow={width} tabIndex={0} onPointerDown={resize} onKeyDown={(event) => { if (event.key === "ArrowLeft") onResize(Math.max(208, width - 8)); if (event.key === "ArrowRight") onResize(Math.min(320, width + 8)); }} />
    {settings ? <FirmSettings venture={venture} readOnly={readOnly} readOnlyReason={readOnlyReason} onCapabilitiesChanged={onChanged} onClose={() => setSettings(false)} /> : null}
    {create ? <VentureCreateDialog ventures={ventures} onClose={() => setCreate(false)} onCreated={(created) => { setCreate(false); onSwitchVenture(created); }} /> : null}
  </aside>;
}

function ReleaseRail({ index, selected, onSelect }: { index: ReleaseIndex | null; selected: string | null; onSelect: (id: string) => void }) {
  const groups = [
    ["Needs you", index?.releases.filter((entry) => entry.attention.length) ?? []], ["Drafts", index?.releases.filter((entry) => entry.lifecycle === "draft") ?? []],
    ["In market", index?.releases.filter((entry) => entry.lifecycle === "in-market") ?? []], ["Recent", index?.releases.filter((entry) => entry.lifecycle === "ended") ?? []],
  ] as const;
  return <nav className="mode-rail-list release-rail-list">{groups.map(([label, entries]) => entries.length ? <section key={label}><h2>{label}</h2>{entries.map((release) => <button key={release.id} type="button" aria-current={selected === release.id ? "page" : undefined} onClick={() => onSelect(release.id)}><span>{release.name}</span><small>{release.lifecycle === "in-market" ? "Live" : release.lifecycle}</small></button>)}</section> : null)}{index?.unassignedActions.length ? <section><h2>Unassigned release actions</h2><p>{index.unassignedActions.length} waiting</p></section> : null}</nav>;
}
