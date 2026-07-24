import { Menu } from "lucide-react";
import type { FirmVenture, WorkIndex, WorkIndexItem } from "@/api";
import type { ThreadSearchStatus } from "@/components/thread/ThreadList";
import { WorkspaceRail } from "./WorkspaceRail";

export function WorkspaceRailPanel({
  venture, ventures, railOpen, railWidth, search, selectedThread,
  workIndex, workLoading, searchStatus,
  onRailOpen, onSearch, onSelectThread, onNew, onOpenVenture, onResize, onSettings,
}: {
  venture: FirmVenture; ventures: FirmVenture[];
  railOpen: boolean; railWidth: number; search: string; selectedThread: string | null;
  workIndex: WorkIndex | null; workLoading: boolean; searchStatus: ThreadSearchStatus;
  onRailOpen: (open: boolean) => void;
  onSearch: (search: string) => void; onSelectThread: (item: WorkIndexItem) => void;
  onNew: () => void; onOpenVenture: (venture: FirmVenture) => void; onResize: (width: number) => void; onSettings: () => void;
}) {
  return <>
    <button type="button" className="thread-rail-launcher" aria-label="Open workspace rail" aria-expanded={railOpen} onClick={() => onRailOpen(!railOpen)}><Menu aria-hidden="true" /></button>
    <WorkspaceRail
      venture={venture} ventures={ventures} width={railWidth} search={search} selectedThread={selectedThread}
      workIndex={workIndex} workLoading={workLoading} searchStatus={searchStatus}
      onSearch={onSearch} onSelectThread={onSelectThread}
      onNew={onNew} onSwitchVenture={onOpenVenture} onResize={onResize} onSettings={onSettings}
    />
  </>;
}
