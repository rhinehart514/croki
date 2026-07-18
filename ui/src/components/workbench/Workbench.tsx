// Workbench — the PERMANENT center of the venture workspace, and the piece that inverts the old hierarchy:
// the adaptive workspace is now the resting surface, not an overlay summoned from a graph node. It shows
// VentureHome when nothing is selected, and when the founder selects a direction / run / artifact / decision
// it opens the best representation the OPEN stage registry proposes for THAT selection's durable truth
// (waiting act → in-context gate, staged change → diff/tests/preview, >1 open sibling → parallel attempts,
// plain direction → approaches/active-work/results, else a read-only overview). Never the same card for
// every kind. The graph is one action away via "Map" and is a mode, not the host.
//
// This ports the StageWorkspace spine (pinned identity head, contextual View control, breadcrumb) onto the
// permanent center. Descending DEEPER re-keys the SAME selection (onDescend); broadening (onBroaden) and
// Escape climb back one rung. The frame owns the selection + mode state; the Workbench only renders it.
import { useMemo, useState } from "react";
import { ChevronLeft, Compass, Layers } from "lucide-react";
import type { FirmActiveDrive, FirmVenture } from "@/api";
import type { FirmArchitectureProjection, FirmConversationMessage, FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import type { Direction, DirectionSection } from "@/components/now/directionModel";
import { projectStageContext } from "@/components/stage/projectStageContext";
import { buildStageWorkspaces, getStageWorkspace, type StageActions } from "@/components/stage/stageRegistry";
import { VentureHome } from "./VentureHome";
import "./workbench.css";

export function Workbench({
  venture,
  lens,
  messages,
  activeDrives,
  projection,
  cursor,
  selection,
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
    () => projectStageContext(venture.id, selection, lens, messages, activeDrives, projection, cursor),
    [venture.id, selection, lens, messages, activeDrives, projection, cursor],
  );
  const list = useMemo(() => buildStageWorkspaces(stage), [stage]);

  // A representation choice belongs only to this visit to this truth state. A new selection, a return through
  // Home, or a newly higher-precedence body (especially a founder gate) resets to the registry default rather
  // than reviving an older manual view that can hide what just changed.
  const selectionKey = `${selection?.betId ?? ""}:${selection?.workRef ?? ""}:${selection?.architectureId ?? ""}:${selection?.theoryId ?? ""}`;
  const defaultId = list[0]?.id ?? "overview";
  const [view, setView] = useState({ selectionKey, defaultId, activeId: defaultId, open: false });
  const viewIsCurrent = view.selectionKey === selectionKey
    && view.defaultId === defaultId
    && list.some((workspace) => workspace.id === view.activeId);
  if (!viewIsCurrent) setView({ selectionKey, defaultId, activeId: defaultId, open: false });
  const active = getStageWorkspace(list, viewIsCurrent ? view.activeId : defaultId);
  const viewOpen = viewIsCurrent && view.open;

  const actions: StageActions = {
    ventureId: venture.id,
    onScopePick,
    onStop,
    onDescend,
    onReturn: onBroaden,
    onChanged,
    readOnlyReason,
  };

  const showHome = !selection;

  const crumbs = [venture.name, stage.direction?.sentence ?? null, stage.focusLabel ?? null]
    .filter((crumb): crumb is string => Boolean(crumb));

  const eyebrow = stage.waiting.length
    ? "Needs your decision"
    : stage.ctx?.drive
      ? "Working now"
      : stage.direction?.state === "from-market"
        ? "The market answered"
        : "This work";
  const title = stage.direction?.sentence ?? stage.focusLabel ?? venture.name;

  const pick = (id: string) => setView({ selectionKey, defaultId, activeId: id, open: false });

  return (
    <section className="workbench" data-testid="venture-workbench" data-mode="work">
      <header className="workbench-bar">
        {selection ? (
          <button type="button" className="workbench-back" onClick={onBroaden}>
            <ChevronLeft aria-hidden="true" /> Back to venture
          </button>
        ) : (
          <span className="workbench-here">Workbench</span>
        )}
        <div className="workbench-bar-actions">
          {selection && list.length > 1 ? (
            <div className="now-view">
              <button
                type="button"
                className="now-view-toggle"
                aria-haspopup="menu"
                aria-expanded={viewOpen}
                onClick={() => setView((current) => ({
                  selectionKey,
                  defaultId,
                  activeId: viewIsCurrent ? current.activeId : defaultId,
                  open: viewIsCurrent ? !current.open : true,
                }))}
              >
                <Layers aria-hidden="true" /> View · {active.label}
              </button>
              {viewOpen ? (
                <div className="now-view-menu" role="menu">
                  {list.map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={workspace.id === active.id}
                      className="now-view-option"
                      onClick={() => pick(workspace.id)}
                    >
                      {workspace.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
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
        <div className="workbench-scroll">
          {crumbs.length > 1 ? (
            <nav className="stage-workspace-crumbs" aria-label="Where you are">
              {crumbs.map((crumb, index) => (
                <span key={index} className="stage-workspace-crumb">
                  {crumb}{index < crumbs.length - 1 ? <span aria-hidden="true"> › </span> : null}
                </span>
              ))}
            </nav>
          ) : null}

          <div className="now-doc-head">
            <span className="now-doc-eyebrow">{eyebrow}</span>
            <h1 className="now-doc-title">{title}</h1>
            {stage.direction?.understanding ? <p className="now-doc-why">{stage.direction.understanding}</p> : null}
          </div>

          <div className="stage-workspace-body" data-testid="stage-workspace" role="region" aria-label="Selected work">
            {active.render(stage, actions)}
          </div>
        </div>
      )}
    </section>
  );
}
