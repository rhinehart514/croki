import { Plus, Search, Settings } from "lucide-react";
import { useState, type PointerEvent } from "react";
import type { FirmVenture, WorkIndex, WorkIndexItem } from "@/api";
import { CrokiMark } from "@/components/brand/CrokiMark";
import { VentureSwitcher } from "@/components/firm/VentureSwitcher";
import { VentureCreateDialog } from "@/components/firm/VentureCreateDialog";
import type { ThreadSearchStatus } from "@/components/thread/ThreadList";
import { WorkspaceRailBody } from "./WorkspaceRailBody";

export function WorkspaceRail({ venture, ventures, width, search, selectedThread, workIndex, workLoading, searchStatus, onSearch, onSelectThread, onNew, onSwitchVenture, onResize, onSettings }: {
  venture: FirmVenture; ventures: FirmVenture[]; width: number; search: string; selectedThread: string | null;
  workIndex: WorkIndex | null; workLoading: boolean; searchStatus: ThreadSearchStatus;
  onSearch: (value: string) => void; onSelectThread: (item: WorkIndexItem) => void;
  onNew: () => void; onSwitchVenture: (venture: FirmVenture) => void; onResize: (width: number) => void; onSettings: () => void;
}) {
  const [create, setCreate] = useState(false);
  const resize = (event: PointerEvent<HTMLButtonElement>) => { const origin = event.clientX; const start = width; const move = (next: globalThis.PointerEvent) => onResize(Math.min(360, Math.max(272, start + next.clientX - origin))); const done = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", done); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", done); };
  return <aside className="thread-rail workspace-rail" aria-label={`${venture.name} workspace rail`}>
    <div className="workspace-brand" aria-label="Croki"><CrokiMark active={Boolean(workIndex?.counts.active)} decorative /><span>Croki</span></div>
    <VentureSwitcher venture={venture} ventures={ventures} onSwitch={onSwitchVenture} onCreate={() => setCreate(true)} />
    <div className="workspace-rail-tools" data-new-thread="true">
      <label className="thread-search"><Search aria-hidden="true" /><span className="sr-only">Search threads</span><input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search threads" /></label>
      <button type="button" className="workspace-new-thread" aria-label="New thread" title="New thread" onClick={onNew}><Plus aria-hidden="true" /><span className="sr-only">New thread</span></button>
    </div>
    <div className="workspace-rail-mode">
      <WorkspaceRailBody workIndex={workIndex} selectedThread={selectedThread} search={search} workLoading={workLoading} searchStatus={searchStatus} onSelectThread={onSelectThread} />
    </div>
    <button type="button" className="thread-settings" onClick={onSettings}><Settings aria-hidden="true" />Settings</button>
    <button type="button" className="thread-rail-resizer" role="separator" aria-label="Resize workspace rail" aria-orientation="vertical" aria-valuemin={272} aria-valuemax={360} aria-valuenow={width} onPointerDown={resize} onKeyDown={(event) => { if (event.key === "ArrowLeft") onResize(Math.max(272, width - 8)); if (event.key === "ArrowRight") onResize(Math.min(360, width + 8)); }} />
    {create ? <VentureCreateDialog ventures={ventures} onClose={() => setCreate(false)} onCreated={(created) => { setCreate(false); onSwitchVenture(created); }} /> : null}
  </aside>;
}
