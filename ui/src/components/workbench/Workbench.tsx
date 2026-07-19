// Workbench — the PERMANENT center of the venture workspace, and the piece that inverts the old hierarchy:
// the adaptive workspace is now the resting surface, not an overlay summoned from a graph node. It shows
// VentureHome when nothing is selected, and when the founder selects a direction / run / artifact / decision
// it opens the best representation the OPEN stage registry proposes for THAT selection's durable truth
// (waiting act → in-context gate, staged change → diff/tests/preview, >1 open sibling → parallel attempts,
// plain direction → approaches/active-work/results, else a read-only overview). Never the same card for
// every kind. The graph is one action away via "Map" and is a mode, not the host.
//
// Selected work follows the T3 thread/result composition: intent, conversation, returned material, and the
// next founder decision occupy one continuous reading surface. Registry-backed alternatives remain available
// as a compact result switcher, not a permanent second pane. Descending DEEPER re-keys the SAME selection.
import { useMemo, useState } from "react";
import { ChevronLeft, ClipboardList, Compass, FileDiff, Files, GitCompareArrows, ShieldCheck } from "lucide-react";
import type { FirmActiveDrive, FirmVenture, WorkIndexOutlineObject } from "@/api";
import type { FirmArchitectureProjection, FirmConversationMessage, FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import type { Direction, DirectionSection } from "@/components/now/directionModel";
import { projectStageContext } from "@/components/stage/projectStageContext";
import { buildStageWorkspaces, getStageWorkspace, type StageActions } from "@/components/stage/stageRegistry";
import { VentureHome } from "./VentureHome";
import { WorkNarrative } from "./WorkNarrative";
import "./workbench.css";

const SURFACE_ICON = {
  consequence: ShieldCheck,
  "product-artifact": FileDiff,
  comparison: GitCompareArrows,
  direction: ClipboardList,
  overview: Files,
} as const;

const SURFACE_LABEL: Record<string, string> = {
  consequence: "Decision",
  "product-artifact": "Changes",
  comparison: "Approaches",
  direction: "Result",
  overview: "Context",
};

const SURFACE_KICKER: Record<string, string> = {
  consequence: "Your decision",
  "product-artifact": "What changed",
  comparison: "Compare the work",
  direction: "Latest result",
  overview: "Supporting context",
};

export function Workbench({
  venture,
  lens,
  messages,
  activeDrives,
  projection,
  cursor,
  selection,
  selectedDirection,
  selectedObject = null,
  sections,
  now,
  onSelectDirection,
  onDescend,
  onBroaden,
  onScopePick,
  onStop,
  onChanged,
  onSummonMap,
  readOnlyReason,
}: {
  venture: FirmVenture;
  lens: FirmLens | null;
  messages: FirmConversationMessage[];
  activeDrives: FirmActiveDrive[];
  projection: FirmArchitectureProjection | null;
  cursor: string | null;
  selection: CanvasSelection;
  selectedDirection: Direction | null;
  selectedObject?: WorkIndexOutlineObject | null;
  sections: DirectionSection[];
  now: number;
  onSelectDirection: (direction: Direction) => void;
  onDescend: (selection: CanvasSelection) => void;
  onBroaden: () => void;
  onScopePick?: (selection: CanvasSelection) => void;
  onStop?: (driveId: string) => void;
  onChanged: () => void;
  onSummonMap: () => void;
  readOnlyReason: string | null;
}) {
  const stage = useMemo(
    () => projectStageContext(venture.id, selection, lens, messages, activeDrives, projection, cursor, selectedDirection, selectedObject),
    [venture.id, selection, lens, messages, activeDrives, projection, cursor, selectedDirection, selectedObject],
  );
  const list = useMemo(() => buildStageWorkspaces(stage), [stage]);

  // A representation choice belongs only to this visit to this truth state. A new selection, a return through
  // Home, or a newly higher-precedence body (especially a founder gate) resets to the registry default rather
  // than reviving an older manual view that can hide what just changed.
  const selectionKey = `${selection?.betId ?? ""}:${selection?.workRef ?? ""}:${selection?.threadRef ?? ""}:${selection?.objectId ?? ""}:${selection?.architectureId ?? ""}:${selection?.theoryId ?? ""}`;
  const defaultId = list[0]?.id ?? "overview";
  const [views, setViews] = useState<Record<string, { defaultId: string; activeId: string }>>({});
  const remembered = views[selectionKey];
  const rememberedIsCurrent = remembered?.defaultId === defaultId
    && list.some((workspace) => workspace.id === remembered.activeId);
  const active = getStageWorkspace(list, rememberedIsCurrent ? remembered.activeId : defaultId);

  const actions: StageActions = {
    ventureId: venture.id,
    onScopePick,
    onStop,
    onDescend,
    onReturn: onBroaden,
    onChanged,
    readOnlyReason,
  };

  const showHome = !selection && !selectedDirection;

  const crumbs = [venture.name, stage.focusLabel ?? null]
    .filter((crumb): crumb is string => Boolean(crumb));

  const pick = (id: string) => setViews((current) => ({
    ...current,
    [selectionKey]: { defaultId, activeId: id },
  }));

  return (
    <section className="workbench" data-testid="venture-workbench" data-mode="work">
      <header className="workbench-bar">
        {!showHome ? (
          <button type="button" className="workbench-back" onClick={onBroaden}>
            <ChevronLeft aria-hidden="true" /> {selection?.workRef ? "Back to direction" : "Venture overview"}
          </button>
        ) : (
          <span className="workbench-here">Workbench</span>
        )}
        <div className="workbench-bar-actions">
          <button type="button" className="workbench-map" onClick={onSummonMap}>
            <Compass aria-hidden="true" /> Map
          </button>
        </div>
      </header>

      {showHome ? (
        <VentureHome
          venture={venture}
          sections={sections}
          now={now}
          onSelectDirection={onSelectDirection}
          onStop={onStop}
          onSummonMap={onSummonMap}
        />
      ) : (
        <div className="selected-work-environment">
          <div className="selected-work-scroll">
            <div className="selected-work-thread">
              {crumbs.length > 1 ? (
                <nav className="stage-workspace-crumbs" aria-label="Where you are">
                  {crumbs.map((crumb, index) => (
                    <span key={index} className="stage-workspace-crumb">
                      {crumb}{index < crumbs.length - 1 ? <span aria-hidden="true"> / </span> : null}
                    </span>
                  ))}
                </nav>
              ) : null}
              {lens && !stage.object ? <WorkNarrative stage={stage} lens={lens} messages={messages} /> : null}

              <section className="work-material" aria-label="Result">
                <header className="work-material-head">
                  <div>
                    <span className="work-material-kicker">{SURFACE_KICKER[active.id] ?? "Result"}</span>
                    <h3>{SURFACE_LABEL[active.id] ?? active.label}</h3>
                  </div>
                  {list.length > 1 ? (
                    <div className="work-material-tabs" role="tablist" aria-label="Result views">
                      {list.map((workspace) => {
                        const Icon = SURFACE_ICON[workspace.id as keyof typeof SURFACE_ICON] ?? Files;
                        const label = SURFACE_LABEL[workspace.id] ?? workspace.label;
                        return (
                          <button
                            key={workspace.id}
                            type="button"
                            role="tab"
                            aria-selected={workspace.id === active.id}
                            aria-label={label}
                            title={label}
                            className="work-material-tab"
                            onClick={() => pick(workspace.id)}
                          >
                            <Icon aria-hidden="true" /><span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </header>
                <div className="stage-workspace-body" data-testid="stage-workspace" role="tabpanel" aria-label={SURFACE_LABEL[active.id] ?? active.label}>
                  {active.render(stage, actions)}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
