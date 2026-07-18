// RevisionReceipts — the visible receipt rail for the canvas revision stack (SPEC B). Reuses the atlas
// revision receipt CSS/motion (venture-atlas.css `.atlas-revision-receipt`) so an undo on the canvas reads
// the same as the atlas one the founder already knows. It names the changed object in FOUNDER words (the
// entry's `reason`) and offers Undo / Redo.
//
// THE GATE, rendered: a world-boundary entry (something an effect-executor ran in the world — a release, an
// authorized deploy) renders WITHOUT an Undo control, because it cannot be reversed by re-applying an
// inverse. `canUndo` from the stack already reports false at that top; this component reflects it visually so
// the founder is never offered an undo that would silently do nothing.
//
// Keyboard: ⌘Z undoes, ⌘⇧Z redoes, guarded by the same input/textarea/contenteditable skip the stage uses
// for its other shortcuts so a founder typing in a field is never hijacked. This component only READS the
// stack and calls onUndo/onRedo — the stage owns applying the inverse/forward against the live revision and
// surfacing a 409 ("changed since — can't undo cleanly"). Isolated by design.

import { useEffect } from "react";
import type { CanvasRevisionEntry } from "./useCanvasRevisionStack";
import "./revision-receipts.css";

export type RevisionReceiptsProps = {
  // The top undo entry to name, or null when the stack is empty.
  peekUndo: CanvasRevisionEntry | null;
  peekRedo: CanvasRevisionEntry | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

// Whether a keyboard event originates from a field where the founder is typing — the shortcut is inert
// there. Mirrors the stage's own skip so the two never disagree.
function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches("input, textarea, [contenteditable='true']");
}

export function RevisionReceipts({ peekUndo, peekRedo, canUndo, canRedo, onUndo, onRedo }: RevisionReceiptsProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      if (!meta || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) {
        if (canRedo) onRedo();
      } else if (canUndo) {
        onUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, canRedo, onUndo, onRedo]);

  // Nothing to show when there is neither an undo entry to name nor a redo available.
  if (!peekUndo && !peekRedo) return null;

  const worldBoundary = peekUndo?.worldBoundary === true;

  return (
    <div className="atlas-revision-receipt canvas-revision-receipt" role="status" aria-live="polite">
      <span>
        <small>{worldBoundary ? "In the world — kept" : "Last change"}</small>
        <strong>{peekUndo ? peekUndo.reason : peekRedo ? `Undone: ${peekRedo.reason}` : ""}</strong>
      </span>
      <div className="canvas-revision-receipt-actions">
        {/* A world-boundary entry renders WITHOUT Undo — the gate, made visible. */}
        {peekUndo && !worldBoundary ? (
          <button
            type="button"
            className="canvas-revision-receipt-action"
            onClick={onUndo}
            disabled={!canUndo}
          >
            Undo
          </button>
        ) : null}
        {canRedo ? (
          <button
            type="button"
            className="canvas-revision-receipt-action is-quiet"
            onClick={onRedo}
          >
            Redo
          </button>
        ) : null}
      </div>
    </div>
  );
}
