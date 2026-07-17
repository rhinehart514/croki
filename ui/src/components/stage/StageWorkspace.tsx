// The adaptive center-stage layer — the CENTER that ADAPTS to the work. It mounts as a docked layer inside
// the venture-workspace-canvas cell OVER the still-mounted VentureCanvasStage (the canvas dims but never
// unmounts — the bench contract, explicitly NOT the whole-surface DiveSurface replacement). It ports the
// WorkbenchView spine off the Now route: a pinned identity head (what this is), one working-now pulse, and
// the contextual View control — and lets the OPEN stage registry propose the body. Which body renders is
// chosen entirely by which durable truth exists at the selection (product change → diff/tests/preview,
// >1 open sibling → parallel attempts, waiting outward act → in-context gate, plain direction →
// approaches/active-work/returned-results, else a read-only overview) — never the same card for every kind.
//
// Descending DEEPER is the same gesture on a row inside the body: onDescend re-keys the SAME selection, the
// breadcrumb grows one segment, the spine stays, only the body swaps. Escape / Close return via onReturn,
// owned by the frame so the camera restore and broaden ladder live in one place.
import { useMemo, useState } from "react";
import { ChevronLeft, Layers, X } from "lucide-react";
import type { FirmActiveDrive, FirmVenture } from "@/api";
import type { FirmArchitectureProjection, FirmConversationMessage, FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { projectStageContext } from "./projectStageContext";
import { buildStageWorkspaces, getStageWorkspace, type StageActions } from "./stageRegistry";
import "./stage-workspace.css";

export function StageWorkspace({
  venture,
  lens,
  messages,
  activeDrives,
  projection,
  cursor,
  selection,
  onDescend,
  onReturn,
  onScopePick,
  onStop,
  onChanged,
}: {
  venture: FirmVenture;
  lens: FirmLens | null;
  messages: FirmConversationMessage[];
  activeDrives: FirmActiveDrive[];
  projection: FirmArchitectureProjection | null;
  cursor: string | null;
  selection: CanvasSelection;
  onDescend: (selection: CanvasSelection) => void;
  onReturn: () => void;
  onScopePick?: (selection: CanvasSelection) => void;
  onStop?: (driveId: string) => void;
  onChanged: () => void;
}) {
  const stage = useMemo(
    () => projectStageContext(venture.id, selection, lens, messages, activeDrives, projection, cursor),
    [venture.id, selection, lens, messages, activeDrives, projection, cursor],
  );
  const list = useMemo(() => buildStageWorkspaces(stage), [stage]);

  // The active workspace: default to the first available (highest-precedence) body; reconcile to it if the
  // current id is no longer offered (truth changed, or a deeper descent re-keyed the selection). Keyed off
  // the selection identity so a fresh descent resets to the purpose-built default rather than a stale view.
  const selectionKey = `${selection?.betId ?? ""}:${selection?.workRef ?? ""}:${selection?.architectureId ?? ""}:${selection?.theoryId ?? ""}`;
  const [activeByKey, setActiveByKey] = useState<Record<string, string>>({});
  const activeId = activeByKey[selectionKey] ?? list[0]?.id ?? "overview";
  const active = getStageWorkspace(list, activeId);
  const [viewOpen, setViewOpen] = useState(false);

  const actions: StageActions = {
    ventureId: venture.id,
    onScopePick,
    onStop,
    onDescend,
    onReturn,
    onChanged,
  };

  // The breadcrumb: venture → direction → focused artifact. Each segment preserves orientation; the tail
  // grows one step on a deeper descent. A reversible route back is the Close control + Escape.
  const crumbs = [
    venture.name,
    stage.direction?.sentence ?? null,
    stage.focusLabel ?? null,
  ].filter((crumb): crumb is string => Boolean(crumb));

  const eyebrow = stage.waiting.length
    ? "Needs your decision"
    : stage.ctx?.drive
      ? "Working now"
      : stage.direction?.state === "from-market"
        ? "The market answered"
        : "This work";
  const title = stage.direction?.sentence ?? stage.focusLabel ?? venture.name;

  const pick = (id: string) => { setActiveByKey((prev) => ({ ...prev, [selectionKey]: id })); setViewOpen(false); };

  return (
    <div className="stage-workspace" data-testid="stage-workspace" role="region" aria-label="Descended work">
      <div className="stage-workspace-topbar">
        <button type="button" className="now-doc-back" onClick={onReturn}>
          <ChevronLeft aria-hidden="true" /> Back to the venture
        </button>
        <button type="button" className="stage-workspace-close" onClick={onReturn} aria-label="Close this workspace">
          <X aria-hidden="true" />
        </button>
      </div>

      {/* Breadcrumb — the selection ancestry, so orientation is never lost on descent. */}
      {crumbs.length > 1 ? (
        <nav className="stage-workspace-crumbs" aria-label="Where you are">
          {crumbs.map((crumb, index) => (
            <span key={index} className="stage-workspace-crumb">
              {crumb}{index < crumbs.length - 1 ? <span aria-hidden="true"> › </span> : null}
            </span>
          ))}
        </nav>
      ) : null}

      {/* Identity — pinned so the work is legible under every body. */}
      <div className="now-doc-head">
        <span className="now-doc-eyebrow">{eyebrow}</span>
        <h1 className="now-doc-title">{title}</h1>
        {stage.direction?.understanding ? <p className="now-doc-why">{stage.direction.understanding}</p> : null}
      </div>

      {/* One contextual View control — only when a real alternate body exists, never a persistent tab strip. */}
      {list.length > 1 ? (
        <div className="now-view">
          <button
            type="button"
            className="now-view-toggle"
            aria-haspopup="menu"
            aria-expanded={viewOpen}
            onClick={() => setViewOpen((open) => !open)}
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

      {/* The adaptive body the registry proposes. */}
      <div className="stage-workspace-body">
        {active.render(stage, actions)}
      </div>
    </div>
  );
}
