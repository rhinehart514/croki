// The workbench host — the stable spine around ONE default body. The direction head (identity), the single
// working-now pulse (movement, never a step counter), and the pinned waiting DecisionGate (authority) live
// HERE, above the body, so they are never hidden. Below them the direction shows its result by default; a
// single contextual "View" control — not a persistent tab strip — offers the alternates that genuinely add
// something (the exact diff, a live approach comparison), and only when more than one exists. Switching a
// view is pure view-state (activeRepresentationId): never a route change, never a drive, so the composer
// docked below and the conversation spine do not fragment. The host hardcodes only safe rendering, which id
// is active, and the authority boundary; the registry proposes the body.
import { useMemo, useState } from "react";
import { ChevronLeft, Layers, Square } from "lucide-react";
import type { FirmActiveDrive, WallQueueItemView } from "@/api";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import type { CanvasSelection } from "@/components/firm/directionTarget";
import { DecisionGate } from "./DecisionGate";
import type { Direction } from "./directionModel";
import { projectDirection } from "./projectDirection";
import { buildRepresentations, getRepresentation } from "./representations";

export function WorkbenchView({
  ventureId,
  direction,
  lens,
  wallItems,
  activeDrives,
  projection,
  onBack,
  onChanged,
  onStop,
  onScopePick,
}: {
  ventureId: string;
  direction: Direction;
  lens: FirmLens;
  wallItems: WallQueueItemView[];
  activeDrives: FirmActiveDrive[];
  projection: FirmArchitectureProjection | null;
  onBack: () => void;
  onChanged: () => void;
  onStop: (driveId: string) => void;
  onScopePick?: (selection: CanvasSelection) => void;
}) {
  const ctx = useMemo(
    () => projectDirection(ventureId, direction, lens, wallItems, activeDrives, projection),
    [ventureId, direction, lens, wallItems, activeDrives, projection],
  );
  const list = useMemo(() => buildRepresentations(ctx), [ctx]);

  // Own the active representation. Default to the result body (SEED[0]); reconcile to it if the current id
  // is no longer available (truth changed, or the direction was re-selected) — never a blank pane.
  const [activeId, setActiveId] = useState<string>(list[0]?.id ?? "result");
  const [viewOpen, setViewOpen] = useState(false);
  const active = getRepresentation(list, activeId);
  const activeResolvedId = active?.id ?? "result";
  // Evidence honesty: only the exact-change view renders the diff, so on EVERY other view the pinned gate
  // must render it itself — a repository change is never released with the diff nowhere on screen. This is
  // also how "exact change stays behind the result until a decision requires it" holds: when a product
  // change is waiting, the gate surfaces the diff on the result view without the founder switching.
  const gateShowsDiff = (kind: string) => kind !== "product-change" || activeResolvedId !== "exact-change";

  const { drive, waiting } = ctx;
  const tone = waiting.length ? "needs-you" : direction.state;
  const eyebrow = waiting.length ? "Needs your decision" : drive ? "Working now" : direction.state === "from-market" ? "The market answered" : "Direction";

  const pick = (id: string) => { setActiveId(id); setViewOpen(false); };

  return (
    <div className="now-doc" data-tone={tone}>
      <button type="button" className="now-doc-back" onClick={onBack}>
        <ChevronLeft aria-hidden="true" /> All directions
      </button>

      {/* Identity — pinned, so the direction is legible under every representation. */}
      <div className="now-doc-head">
        <span className="now-doc-eyebrow">{eyebrow}</span>
        <h1 className="now-doc-title">{direction.sentence}</h1>
        <p className="now-doc-why">{direction.understanding}</p>
      </div>

      {/* Movement — one calm working-now pulse when a live drive exists, never a machinery counter. This is
          also where live agents surface: work-before-worker, with detail behind the machinery disclosure. */}
      {drive ? (
        <div className="now-progress">
          <span className="now-progress-dot" aria-hidden="true" />
          <span>Drover is working on this now. It will return an artifact and stop at any outward step.</span>
          {drive.abortSupported ? (
            <button type="button" className="now-progress-stop" onClick={() => onStop(drive.id)} disabled={Boolean(drive.abortRequestedAt)}>
              <Square aria-hidden="true" style={{ width: 11, height: 11 }} /> {drive.abortRequestedAt ? "Stopping…" : "Stop"}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Authority — pinned above the body so a decision is never buried behind a non-active view. */}
      {waiting.length ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">{waiting.length === 1 ? "Your decision" : "Your decisions"}</span>
          {waiting.map((item) => (
            <DecisionGate
              key={item.id}
              ventureId={ventureId}
              item={item}
              onDecided={onChanged}
              showArtifact={gateShowsDiff(String(item.effect.kind ?? "").toLowerCase())}
            />
          ))}
        </div>
      ) : null}

      {/* One contextual View control — shown only when there is a real alternate, never a persistent tab
          strip. It names the current body and discloses the others on demand. */}
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
              {list.map((representation) => (
                <button
                  key={representation.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={representation.id === activeResolvedId}
                  className="now-view-option"
                  onClick={() => pick(representation.id)}
                >
                  {representation.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* The body — the default result, or the alternate the founder chose. */}
      {active.render(ctx, { onScopePick })}
    </div>
  );
}
