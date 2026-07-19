import { Plus, Search, Settings } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { FirmVenture, WorkIndex, WorkIndexItem } from "@/api";
import { FirmSettings } from "@/components/firm/FirmSettings";
import { VentureCreateDialog } from "@/components/firm/VentureCreateDialog";
import { ThreadList } from "./ThreadList";

export function ThreadRail({ venture, ventures, workIndex, search, width, selected, readOnly, readOnlyReason, onSearch, onSelect, onNew, onSwitchVenture, onResize, onConfigurationChanged }: {
  venture: FirmVenture;
  ventures: FirmVenture[];
  workIndex: WorkIndex | null;
  search: string;
  width: number;
  selected: string | null;
  readOnly: boolean;
  readOnlyReason: string;
  onSearch: (value: string) => void;
  onSelect: (item: WorkIndexItem) => void;
  onNew: () => void;
  onSwitchVenture: (venture: FirmVenture) => void;
  onResize: (width: number) => void;
  onConfigurationChanged: () => void;
}) {
  const [settings, setSettings] = useState(false);
  const [create, setCreate] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const beginResize = (event: PointerEvent<HTMLDivElement>) => {
    const origin = event.clientX;
    const start = width;
    const move = (next: globalThis.PointerEvent) => onResize(Math.min(320, Math.max(208, start + next.clientX - origin)));
    const done = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", done); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", done);
  };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key.toLocaleLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault(); searchRef.current?.focus();
    };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, []);
  return (
    <aside className="thread-rail" style={{ "--thread-rail-width": `${width}px` } as CSSProperties} aria-label={`${venture.name} threads`}>
      <details className="thread-venture-switcher"><summary><span>{venture.name.charAt(0)}</span><strong>{venture.name}</strong></summary><div>{ventures.map((candidate) => <button type="button" key={candidate.id} onClick={() => onSwitchVenture(candidate)}>{candidate.name}</button>)}<button type="button" onClick={() => setCreate(true)}><Plus aria-hidden="true" />Start another venture</button></div></details>
      <button type="button" className="thread-new" onClick={onNew}><Plus aria-hidden="true" />New thread</button>
      <label className="thread-search"><Search aria-hidden="true" /><span className="sr-only">Search threads and their material</span><input ref={searchRef} type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search" /><kbd>⌘K</kbd></label>
      <ThreadList workIndex={workIndex} search={search} selected={selected} onSelect={onSelect} />
      <button type="button" className="thread-settings" onClick={() => setSettings(true)}><Settings aria-hidden="true" />Settings</button>
      <div className="thread-rail-resizer" role="separator" aria-label="Resize thread rail" aria-orientation="vertical" aria-valuemin={208} aria-valuemax={320} aria-valuenow={width} tabIndex={0} onPointerDown={beginResize} onKeyDown={(event) => { if (event.key === "ArrowLeft") onResize(Math.max(208, width - 8)); if (event.key === "ArrowRight") onResize(Math.min(320, width + 8)); }} />
      {settings ? <FirmSettings venture={venture} readOnly={readOnly} readOnlyReason={readOnlyReason} onCapabilitiesChanged={onConfigurationChanged} onClose={() => setSettings(false)} /> : null}
      {create ? <VentureCreateDialog ventures={ventures} onClose={() => setCreate(false)} onCreated={(created) => { setCreate(false); onSwitchVenture(created); }} /> : null}
    </aside>
  );
}
