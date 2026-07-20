import { Plus, Search, Settings } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { FirmVenture, ReleaseIndex, SavedView, SystemIndex, SystemIndexObject, WorkIndex, WorkIndexItem } from "@/api";
import { VentureCreateDialog } from "@/components/firm/VentureCreateDialog";
import type { SystemScope } from "@/components/system-mode/SystemWorkspace";
import type { WorkspaceMode } from "@/lib/venture-session";
import { WorkspaceModeNav } from "./WorkspaceModeNav";
import { WorkspaceRailBody } from "./WorkspaceRailBody";

export function WorkspaceRail({ venture, ventures, mode, width, search, selectedThread, workIndex, systemIndex, scope, selectedObjectRef, savedViews, savedViewsError, readOnlyReason, releaseIndex, selectedReleaseId, canStartRelease, onMode, onSearch, onSelectThread, onSelectObject, onScope, onSelectRelease, onNew, onStartRelease, onSaveView, onReopenView, onDeleteView, onSwitchVenture, onResize, onSettings }: {
  venture: FirmVenture; ventures: FirmVenture[]; mode: WorkspaceMode; width: number; search: string; selectedThread: string | null;
  workIndex: WorkIndex | null; systemIndex: SystemIndex | null; scope: SystemScope; selectedObjectRef: string | null;
  savedViews: SavedView[]; savedViewsError: string | null; readOnlyReason: string | null;
  releaseIndex: ReleaseIndex | null; selectedReleaseId: string | null; canStartRelease: boolean;
  onMode: (mode: WorkspaceMode, opener?: HTMLElement) => void; onSearch: (value: string) => void; onSelectThread: (item: WorkIndexItem) => void;
  onSelectObject: (object: SystemIndexObject) => void; onScope: (scope: SystemScope) => void; onSelectRelease: (id: string) => void;
  onNew: () => void; onStartRelease: () => void; onSwitchVenture: (venture: FirmVenture) => void; onResize: (width: number) => void; onSettings: () => void;
  onSaveView: () => Promise<void>; onReopenView: (view: SavedView) => Promise<string>; onDeleteView: (view: SavedView) => Promise<void>;
}) {
  const [create, setCreate] = useState(false); const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); searchRef.current?.focus(); } }; window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut); }, []);
  const resize = (event: PointerEvent<HTMLDivElement>) => { const origin = event.clientX; const start = width; const move = (next: globalThis.PointerEvent) => onResize(Math.min(320, Math.max(208, start + next.clientX - origin))); const done = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", done); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", done); };
  return <aside className="thread-rail workspace-rail" aria-label={`${venture.name} workspace rail`}>
    <details className="thread-venture-switcher"><summary><span>{venture.name.charAt(0)}</span><strong>{venture.name}</strong></summary><div>{ventures.map((candidate) => <button type="button" key={candidate.id} onClick={() => onSwitchVenture(candidate)}>{candidate.name}</button>)}<button type="button" onClick={() => setCreate(true)}><Plus aria-hidden="true" />Start another venture</button></div></details>
    <WorkspaceModeNav mode={mode} onMode={onMode} />
    <label className="thread-search"><Search aria-hidden="true" /><span className="sr-only">Search {mode === "work" ? "threads" : mode === "system" ? "Product and go-to-market" : "releases"}</span><input ref={searchRef} type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={mode === "work" ? "Search threads" : mode === "system" ? "Search Product / GTM" : "Search releases"} /><kbd>⌘K</kbd></label>
    <WorkspaceRailBody mode={mode} workIndex={workIndex} selectedThread={selectedThread} systemIndex={systemIndex} scope={scope} selectedObjectRef={selectedObjectRef} savedViews={savedViews} savedViewsError={savedViewsError} readOnlyReason={readOnlyReason} releaseIndex={releaseIndex} selectedReleaseId={selectedReleaseId} search={search} canStartRelease={canStartRelease} onSelectThread={onSelectThread} onScope={onScope} onSelectObject={onSelectObject} onSelectRelease={onSelectRelease} onNewThread={onNew} onStartRelease={onStartRelease} onSaveView={onSaveView} onReopenView={onReopenView} onDeleteView={onDeleteView} />
    <button type="button" className="thread-settings" onClick={onSettings}><Settings aria-hidden="true" />Settings</button>
    <div className="thread-rail-resizer" role="separator" aria-label="Resize workspace rail" aria-orientation="vertical" aria-valuemin={208} aria-valuemax={320} aria-valuenow={width} tabIndex={0} onPointerDown={resize} onKeyDown={(event) => { if (event.key === "ArrowLeft") onResize(Math.max(208, width - 8)); if (event.key === "ArrowRight") onResize(Math.min(320, width + 8)); }} />
    {create ? <VentureCreateDialog ventures={ventures} onClose={() => setCreate(false)} onCreated={(created) => { setCreate(false); onSwitchVenture(created); }} /> : null}
  </aside>;
}
