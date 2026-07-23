import { Plus, Search, Settings } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { FirmVenture, SystemIndex, SystemIndexObject, WorkIndex, WorkIndexItem } from "@/api";
import { VentureSwitcher } from "@/components/firm/VentureSwitcher";
import { VentureCreateDialog } from "@/components/firm/VentureCreateDialog";
import type { WorkspaceMode } from "@/lib/venture-session";
import type { FirmConfiguration, FirmCrewMember } from "@/types";
import { WorkspaceModeNav, type ModeAttention } from "./WorkspaceModeNav";
import { WorkspaceRailBody } from "./WorkspaceRailBody";
import type { WorkflowCapability } from "./workflowCapabilities";

export function WorkspaceRail({ venture, ventures, mode, modeMotion, width, search, selectedThread, crew, configuration, capabilities, workIndex, systemIndex, selectedObjectRef, readOnlyReason, onMode, onSearch, onUseAgent, onSelectThread, onSelectObject, onNew, onSwitchVenture, onResize, onSettings, onConfigurationChanged }: {
  venture: FirmVenture; ventures: FirmVenture[]; mode: WorkspaceMode; width: number; search: string; selectedThread: string | null;
  modeMotion: { animate: boolean; direction: number };
  crew: FirmCrewMember[]; configuration: FirmConfiguration; capabilities: WorkflowCapability[];
  workIndex: WorkIndex | null; systemIndex: SystemIndex | null; selectedObjectRef: string | null;
  readOnlyReason: string | null;
  onMode: (mode: WorkspaceMode, opener?: HTMLElement, animate?: boolean) => void; onSearch: (value: string) => void; onSelectThread: (item: WorkIndexItem) => void;
  onUseAgent: (ref: string) => void;
  onSelectObject: (object: SystemIndexObject) => void;
  onNew: () => void; onSwitchVenture: (venture: FirmVenture) => void; onResize: (width: number) => void; onSettings: () => void;
  onConfigurationChanged: () => void;
}) {
  const [create, setCreate] = useState(false); const searchRef = useRef<HTMLInputElement | null>(null);
  const attention = useMemo<Record<WorkspaceMode, ModeAttention>>(() => ({
    work: { needsYou: workIndex?.counts.attention ?? 0, active: workIndex?.counts.active ?? 0 },
    "product-gtm": { needsYou: systemIndex?.counts.attention ?? 0, active: 0 },
  }), [workIndex?.counts.attention, workIndex?.counts.active, systemIndex?.counts.attention]);
  const reducedMotion = useReducedMotion();
  const move = reducedMotion || !modeMotion.animate ? 0 : modeMotion.direction * 7;
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); searchRef.current?.focus(); } }; window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut); }, []);
  const resize = (event: PointerEvent<HTMLButtonElement>) => { const origin = event.clientX; const start = width; const move = (next: globalThis.PointerEvent) => onResize(Math.min(360, Math.max(272, start + next.clientX - origin))); const done = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", done); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", done); };
  return <aside className="thread-rail workspace-rail" aria-label={`${venture.name} workspace rail`}>
    <VentureSwitcher venture={venture} ventures={ventures} onSwitch={onSwitchVenture} onCreate={() => setCreate(true)} />
    <WorkspaceModeNav mode={mode} animate={modeMotion.animate} attention={attention} onMode={onMode} />
    <div className="workspace-rail-tools" data-new-thread={mode === "work" ? "true" : undefined}>
      <label className="thread-search"><Search aria-hidden="true" /><span className="sr-only">Search {mode === "work" ? "threads" : "Product and go-to-market"}</span><input ref={searchRef} type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder={mode === "work" ? "Search threads" : "Search Product / GTM"} /><kbd>⌘K</kbd></label>
      {mode === "work" ? <button type="button" className="workspace-new-thread" aria-label="New thread" title="New thread" onClick={onNew}><Plus aria-hidden="true" /><span className="sr-only">New thread</span></button> : null}
    </div>
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div key={mode} className="workspace-rail-mode" initial={move ? { opacity: 0, y: move } : false} animate={{ opacity: 1, y: 0 }} exit={move ? { opacity: 0, y: move * -0.45 } : { opacity: 0 }} transition={{ duration: move ? 0.18 : 0, ease: [0.22, 1, 0.36, 1] }}>
        <WorkspaceRailBody ventureId={venture.id} mode={mode} workIndex={workIndex} crew={crew} configuration={configuration} capabilities={capabilities} selectedThread={selectedThread} systemIndex={systemIndex} selectedObjectRef={selectedObjectRef} readOnlyReason={readOnlyReason} search={search} onUseAgent={onUseAgent} onSelectThread={onSelectThread} onSelectObject={onSelectObject} onConfigurationChanged={onConfigurationChanged} />
      </motion.div>
    </AnimatePresence>
    <button type="button" className="thread-settings" onClick={onSettings}><Settings aria-hidden="true" />Settings</button>
    <button type="button" className="thread-rail-resizer" role="separator" aria-label="Resize workspace rail" aria-orientation="vertical" aria-valuemin={272} aria-valuemax={360} aria-valuenow={width} onPointerDown={resize} onKeyDown={(event) => { if (event.key === "ArrowLeft") onResize(Math.max(272, width - 8)); if (event.key === "ArrowRight") onResize(Math.min(360, width + 8)); }} />
    {create ? <VentureCreateDialog ventures={ventures} onClose={() => setCreate(false)} onCreated={(created) => { setCreate(false); onSwitchVenture(created); }} /> : null}
  </aside>;
}
