// The workbench host — the one pane that replaces the fixed WorkDetail stack. It is the stable spine
// around a swappable representation: the direction head (identity), the single working-now pulse
// (movement, never a step counter), and the pinned waiting DecisionGate (authority) all live HERE, ABOVE
// the pane, so they can never hide behind a non-active chip. Below them a quiet per-direction chip strip
// offers only the representations whose durable truth exists, and the selected one renders. Switching a
// chip is pure view-state (activeRepresentationId) — never a route change, never a drive — so the
// composer docked below and the conversation spine do not fragment. The host hardcodes only safe
// rendering, which id is active, and the authority boundary; the model/registry proposes the pane.
import { useMemo, useState } from "react";
import { ChevronLeft, Square } from "lucide-react";
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

  // Own the active representation. Reconcile if the current id is no longer available (truth changed, or
  // the direction was re-selected) — falling back to overview, never a blank pane.
  const [activeId, setActiveId] = useState<string>(list[0]?.id ?? "overview");
  const active = getRepresentation(list, activeId);
  const activeResolvedId = active?.id ?? "overview";
  // Evidence honesty: the pinned gate suppresses its own diff ONLY when the active representation is
  // already showing that exact change (overview or exact-change). Under any other representation the
  // diff is nowhere on screen, so the gate must render it — a repository change is never released unseen.
  const activeShowsExactChange = activeResolvedId === "overview" || activeResolvedId === "exact-change";

  const { drive, waiting } = ctx;
  const tone = waiting.length ? "needs-you" : direction.state;
  const eyebrow = waiting.length ? "Needs your decision" : drive ? "Working now" : direction.state === "from-market" ? "The market answered" : "Direction";

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

      {/* Movement — one calm working-now pulse when a live drive exists, never a machinery counter. */}
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

      {/* Authority — pinned above the pane so a decision is never buried behind a non-active chip. */}
      {waiting.length ? (
        <div className="now-detail-block">
          <span className="now-detail-block-label">{waiting.length === 1 ? "Your decision" : "Your decisions"}</span>
          {waiting.map((item) => (
            <DecisionGate
              key={item.id}
              ventureId={ventureId}
              item={item}
              onDecided={onChanged}
              showArtifact={String(item.effect.kind ?? "").toLowerCase() !== "product-change" || !activeShowsExactChange}
            />
          ))}
        </div>
      ) : null}

      {/* The per-direction chip strip — a quiet segmented control, never a global tab bar. Only shown
          when there is a real choice (more than the always-present overview). */}
      {list.length > 1 ? (
        <div className="now-reps" role="group" aria-label="How to view this direction" data-tone={tone}>
          {list.map((representation) => (
            <button
              key={representation.id}
              type="button"
              className="now-rep-chip"
              aria-pressed={representation.id === activeResolvedId}
              onClick={() => setActiveId(representation.id)}
            >
              {representation.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* The swappable pane — the only thing that repaints on a chip switch. */}
      {active.render(ctx, { onScopePick, onStop })}
    </div>
  );
}
