import { useRef, useState } from "react";
import { Undo2, Redo2, History } from "lucide-react";
import type { CanvasEdit } from "@/lib/canvasHistory";
import { agentPersona, FAMILY_TINT } from "@/lib/agentPersona";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "@/styles/canvas-history.css";

// CanvasHistoryControl — the founder's take-it-back control for the working board, plus the visible
// trail of what they and Claude built. It sits quiet in the bottom-left corner: two arrows to step
// back and forward, and a list button that unfurls the receipts. Monochrome zinc throughout — amber
// stays reserved for the founder gate. A crew edit carries its agent's family tint on its dot when the
// agent is known; a founder edit reads plain ink.

function relTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function dotStyle(edit: CanvasEdit): React.CSSProperties {
  if (edit.actor.by === "claude" && edit.actor.agentRef) {
    const tint = FAMILY_TINT[agentPersona(edit.actor.agentRef).family];
    return { background: tint.fg };
  }
  // Founder edit → solid ink. Generic crew edit (no known agent) → a hollow ring so it still reads as
  // "not you" without inventing a color.
  return edit.actor.by === "you"
    ? { background: "var(--ink)" }
    : { background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--muted)" };
}

function actorName(edit: CanvasEdit): string {
  if (edit.actor.by === "you") return "You";
  if (edit.actor.agentRef) return agentPersona(edit.actor.agentRef).role;
  return "Claude";
}

export function CanvasHistoryControl({
  edits,
  index,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  edits: CanvasEdit[];
  index: number;         // entries at/after this cursor are "undone" (redoable)
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  // The clock reading for relative times, captured when the trail opens (an event, not render) so the
  // render body stays pure. Re-stamped on each open, which is exactly when the list is read.
  const [openedAt, setOpenedAt] = useState(0);

  const hasTrail = edits.length > 0;
  // Newest at the top. An edit is "undone" when it sits at or past the cursor.
  const rows = edits.map((edit, i) => ({ edit, undone: i >= index })).reverse();
  const setTrailOpen = (nextOpen: boolean) => {
    if (nextOpen && !open) setOpenedAt(Date.now());
    setOpen(nextOpen);
  };

  // Nothing built yet → nothing to take back. A row of three greyed, inert buttons is pure clutter on a
  // fresh canvas, so the control stays hidden until there's a real board edit (undo is still on ⌘Z). The
  // moment the first edit lands, hasTrail flips true and the bar appears.
  if (!hasTrail) return null;

  return (
    <div className="chist">
      <Popover
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          const target = eventDetails.event.target;
          const pressedControlBar = target instanceof Node && barRef.current?.contains(target);
          if (!nextOpen && eventDetails.reason === "outside-press" && pressedControlBar) {
            eventDetails.cancel();
            return;
          }
          setTrailOpen(nextOpen);
        }}
      >
        <div ref={barRef} className="chist-bar" role="group" aria-label="Undo and redo board edits">
          <button
            type="button"
            className="chist-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            aria-label="Undo the last board edit"
          >
            <Undo2 size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="chist-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (⇧⌘Z)"
            aria-label="Redo the next board edit"
          >
            <Redo2 size={15} strokeWidth={2} />
          </button>
          <span className="chist-sep" aria-hidden="true" />
          <PopoverTrigger
            render={(
              <button
                type="button"
                className={`chist-btn chist-trail-toggle ${open ? "on" : ""}`}
                disabled={!hasTrail}
                title="What you and Claude built"
                aria-label="Show the board history"
              />
            )}
          >
            <History size={15} strokeWidth={2} />
            {hasTrail ? <span className="chist-count">{edits.length}</span> : null}
          </PopoverTrigger>
        </div>
        {hasTrail ? (
          <PopoverContent
            className="chist-trail !gap-0 !ring-0"
            side="top"
            align="start"
            sideOffset={8}
            aria-label="Board history"
          >
            <div role="log" aria-label="What you and Claude built">
              <div className="chist-trail-head">Board history</div>
              <ul className="chist-list">
                {rows.map(({ edit, undone }) => (
                  <li key={edit.id} className={`chist-row ${undone ? "undone" : ""}`}>
                    <span className="chist-dot" style={dotStyle(edit)} aria-hidden="true" />
                    <span className="chist-row-text">
                      <span className="chist-label">{edit.label}</span>
                      <span className="chist-meta">{actorName(edit)} · {relTime(edit.at, openedAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </PopoverContent>
        ) : null}
      </Popover>
    </div>
  );
}
