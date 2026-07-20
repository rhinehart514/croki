import { Plus, Search, Settings } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { FirmVenture, WorkIndex, WorkIndexItem } from "@/api";
import { FirmSettings } from "@/components/firm/FirmSettings";
import { VentureCreateDialog } from "@/components/firm/VentureCreateDialog";
import { ThreadList } from "@/components/thread/ThreadList";
import type { WorkspaceMode } from "@/lib/venture-session";
import { WorkspaceModeNav } from "./WorkspaceModeNav";

export function WorkspaceRail({ venture, ventures, mode, width, search, selectedThread, workIndex, readOnly, readOnlyReason, onMode, onSearch, onSelectThread, onNew, onSwitchVenture, onResize, onChanged }: {
  venture: FirmVenture; ventures: FirmVenture[]; mode: WorkspaceMode; width: number; search: string; selectedThread: string | null;
  workIndex: WorkIndex | null; readOnly: boolean; readOnlyReason: string;
  onMode: (mode: WorkspaceMode, opener?: HTMLElement) => void; onSearch: (value: string) => void; onSelectThread: (item: WorkIndexItem) => void;
  onNew: () => void; onSwitchVenture: (venture: FirmVenture) => void; onResize: (width: number) => void; onChanged: () => void;
}) {
  const [settings, setSettings] = useState(false); const [create, setCreate] = useState(false); const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); searchRef.current?.focus(); } }; window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut); }, []);
  const resize = (event: PointerEvent<HTMLDivElement>) => { const origin = event.clientX; const start = width; const move = (next: globalThis.PointerEvent) => onResize(Math.min(320, Math.max(208, start + next.clientX - origin))); const done = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", done); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", done); };
  return <aside className="thread-rail workspace-rail" aria-label={`${venture.name} workspace rail`}>
    <details className="thread-venture-switcher"><summary><span>{venture.name.charAt(0)}</span><strong>{venture.name}</strong></summary><div>{ventures.map((candidate) => <button type="button" key={candidate.id} onClick={() => onSwitchVenture(candidate)}>{candidate.name}</button>)}<button type="button" onClick={() => setCreate(true)}><Plus aria-hidden="true" />Start another venture</button></div></details>
    <WorkspaceModeNav mode={mode} onMode={onMode} />
    <button type="button" className="thread-new" onClick={onNew}><Plus aria-hidden="true" />New thread</button>
    <label className="thread-search"><Search aria-hidden="true" /><span className="sr-only">Search threads</span><input ref={searchRef} type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search threads" /><kbd>⌘K</kbd></label>
    <ThreadList workIndex={workIndex} search={search} selected={selectedThread} onSelect={onSelectThread} />
    <button type="button" className="thread-settings" onClick={() => setSettings(true)}><Settings aria-hidden="true" />Settings</button>
    <div className="thread-rail-resizer" role="separator" aria-label="Resize workspace rail" aria-orientation="vertical" aria-valuemin={208} aria-valuemax={320} aria-valuenow={width} tabIndex={0} onPointerDown={resize} onKeyDown={(event) => { if (event.key === "ArrowLeft") onResize(Math.max(208, width - 8)); if (event.key === "ArrowRight") onResize(Math.min(320, width + 8)); }} />
    {settings ? <FirmSettings venture={venture} readOnly={readOnly} readOnlyReason={readOnlyReason} onCapabilitiesChanged={onChanged} onClose={() => setSettings(false)} /> : null}
    {create ? <VentureCreateDialog ventures={ventures} onClose={() => setCreate(false)} onCreated={(created) => { setCreate(false); onSwitchVenture(created); }} /> : null}
  </aside>;
}
