import { Menu } from "lucide-react";
import { useMemo } from "react";
import type { FirmVenture, FounderCredential, SystemIndex, SystemIndexObject, WorkIndex, WorkIndexItem } from "@/api";
import type { WorkspaceMode } from "@/lib/venture-session";
import type { FirmLens } from "@/types";
import { WorkspaceRail } from "./WorkspaceRail";
import { workflowCapabilities } from "./workflowCapabilities";
import type { RuntimeCapabilityInventoryItem } from "./workflowCapabilities";

export function WorkspaceRailPanel({
  venture, ventures, mode, modeMotion, railOpen, railWidth, search, selectedThread,
  lens, credentials, capabilityInventory, workIndex, systemIndex, systemSelection, readOnlyReason,
  onRailOpen, onMode, onSearch, onUseAgent, onSelectThread, onSelectObject, onNew, onOpenVenture,
  onResize, onSettings, onConfigurationChanged,
}: {
  venture: FirmVenture; ventures: FirmVenture[]; mode: WorkspaceMode; modeMotion: { animate: boolean; direction: number };
  railOpen: boolean; railWidth: number; search: string; selectedThread: string | null; lens: FirmLens | null;
  credentials: FounderCredential[]; capabilityInventory: RuntimeCapabilityInventoryItem[]; workIndex: WorkIndex | null; systemIndex: SystemIndex | null; systemSelection: string | null;
  readOnlyReason: string | null;
  onRailOpen: (open: boolean) => void; onMode: (mode: WorkspaceMode, source?: HTMLElement, animate?: boolean) => void;
  onSearch: (search: string) => void; onUseAgent: (ref: string) => void; onSelectThread: (item: WorkIndexItem) => void;
  onSelectObject: (object: SystemIndexObject | null, ref?: string | null) => void;
  onNew: () => void; onOpenVenture: (venture: FirmVenture) => void; onResize: (width: number) => void; onSettings: () => void;
  onConfigurationChanged: () => void;
}) {
  const capabilities = useMemo(
    () => workflowCapabilities(credentials, lens?.configuration?.agents ?? [], capabilityInventory),
    [capabilityInventory, credentials, lens?.configuration?.agents],
  );
  const configuration = lens?.configuration ?? {
    id: "firm", schemaVersion: 1 as const, revision: 1,
    presentation: { participant: "specialist" as const, participantLabel: "agent", collectiveLabel: "agents" },
    defaults: { runtime: null, model: null, maxSteps: 24 },
    organization: { shape: "flat" as const, instructions: null, relationships: [] },
    coordination: { mode: "adaptive" as const, coordinatorRef: null, protocols: [], stopWhen: [] },
    authority: { outwardEffects: "wall" as const, configurationChanges: "founder" as const }, agents: [],
  };
  return <>
    <button type="button" className="thread-rail-launcher" aria-label="Open workspace rail" aria-expanded={railOpen} onClick={() => onRailOpen(!railOpen)}><Menu aria-hidden="true" /></button>
    <WorkspaceRail
      venture={venture} ventures={ventures} mode={mode} modeMotion={modeMotion} width={railWidth} search={search} selectedThread={selectedThread}
      crew={lens?.crew ?? []} configuration={configuration} capabilities={capabilities} workIndex={workIndex} systemIndex={systemIndex}
      selectedObjectRef={systemSelection} readOnlyReason={readOnlyReason}
      onMode={onMode} onSearch={onSearch} onUseAgent={onUseAgent} onSelectThread={onSelectThread} onSelectObject={onSelectObject}
      onNew={onNew} onSwitchVenture={onOpenVenture} onResize={onResize} onSettings={onSettings}
      onConfigurationChanged={onConfigurationChanged}
    />
  </>;
}
