// useCanvasRevisionStack — bounded undo + redo for the venture canvas (SPEC B). This generalizes the single
// atlas revision receipt (useAtlasRevisionReceipt: one slot, one inverse) into a multi-level undo/redo stack
// persisted to sessionStorage. Every undoable act on the canvas — a placement (positions inverse), a
// rename/edit/connect/soft-delete/promote (a mutateArchitecture op with a computable inverse) — pushes ONE
// entry carrying its forward, its inverse, a founder-facing reason, the revision it produced, its kind, and
// whether it crossed a world boundary.
//
// THE SINGLE MOST IMPORTANT CORRECTNESS GATE: a `worldBoundary:true` entry HARD-STOPS the stack. Anything an
// effect-executor ran in the world — a release, an authorized deploy — is NOT reversible by re-applying an
// inverse, so once such an entry is pushed, nothing below it may ever be undone. `canUndo` reports false the
// instant the top of the undo stack is a world-boundary entry, and `peekUndo` returns it so the receipt rail
// can render it WITHOUT an Undo control. This is unit-tested directly.
//
// The stack is store-only bookkeeping: it holds the inverse a caller supplies and hands it back on undo. It
// NEVER applies the inverse itself (no mutation client here), NEVER moves a node — the stage owns applying
// forward/inverse against a possibly-moved revision and handling a 409. Isolated by design.

import { useCallback, useMemo, useState } from "react";

// A canvas revision entry. `forward`/`inverse` are opaque to the stack — the stage interprets them by
// `kind` (placement → position maps via placementInverse; architecture → mutateArchitecture ops). The stack
// only stores, orders, and gates them.
export type CanvasRevisionKind = "placement" | "rename" | "connect" | "soft-delete" | "restore" | "promote" | "edit";

export type CanvasRevisionEntry = {
  id: string;
  // What to re-apply to REDO this act (position map or mutation ops), shape known to the stage by `kind`.
  forward: unknown;
  // What to apply to UNDO this act. Null only for a world-boundary entry (nothing to reverse).
  inverse: unknown;
  // Founder-facing name of the changed object, e.g. "Moved 3 directions" / "Named the offer".
  reason: string;
  // The architecture revision this act produced, so an undo can detect drift (the stage compares before
  // applying an inverse and surfaces "changed since — can't undo cleanly" on a 409). Null for a placement,
  // which rides putPlacement's own revision, not the architecture revision.
  revision: number | null;
  kind: CanvasRevisionKind;
  // TRUE for anything an effect-executor ran in the world (a release, an authorized deploy). A world-boundary
  // entry HARD-STOPS the stack: nothing at or below it may be undone.
  worldBoundary: boolean;
};

// The persisted shape. Undo stack grows as acts happen; redo stack fills as undos happen and is CLEARED by
// any new forward act (a new act invalidates the redo future — standard undo semantics).
type StoredStack = {
  undo: CanvasRevisionEntry[];
  redo: CanvasRevisionEntry[];
  updatedAt: number;
};

// Bounded so sessionStorage never grows without limit and the receipt rail stays legible. The oldest undo
// entries are dropped first; dropping history never breaks the world-boundary gate (the gate is evaluated on
// the TOP of the stack, and a boundary entry is never dropped while entries above it survive).
const MAX_DEPTH = 25;
const STACK_TTL_MS = 30 * 60 * 1_000;

function storageKey(ventureId: string): string {
  return `drover:canvas-revision-stack:${ventureId}`;
}

function readStack(ventureId: string): StoredStack {
  const empty: StoredStack = { undo: [], redo: [], updatedAt: Date.now() };
  try {
    const raw = window.sessionStorage.getItem(storageKey(ventureId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as StoredStack | null;
    if (!parsed || Date.now() - parsed.updatedAt > STACK_TTL_MS) return empty;
    return {
      undo: Array.isArray(parsed.undo) ? parsed.undo : [],
      redo: Array.isArray(parsed.redo) ? parsed.redo : [],
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return empty;
  }
}

function persist(ventureId: string, stack: StoredStack): void {
  try {
    window.sessionStorage.setItem(storageKey(ventureId), JSON.stringify(stack));
  } catch {
    // sessionStorage may be unavailable (private mode / quota) — undo simply does not persist across a
    // reload, which is acceptable; the in-memory stack still works this session.
  }
}

// The top undo entry, or null. Exposed as a pure helper so both the hook and its test read the gate the
// same way.
export function topUndo(stack: Pick<StoredStack, "undo">): CanvasRevisionEntry | null {
  return stack.undo.length ? stack.undo[stack.undo.length - 1] : null;
}

// THE GATE: undo is possible only when there is a top entry AND that entry is not a world boundary. A
// world-boundary entry at the top hard-stops the stack.
export function canUndoStack(stack: Pick<StoredStack, "undo">): boolean {
  const top = topUndo(stack);
  return top !== null && top.worldBoundary === false;
}

export function useCanvasRevisionStack(ventureId: string) {
  const [stack, setStack] = useState<StoredStack>(() => readStack(ventureId));

  const commit = useCallback((next: StoredStack) => {
    const bounded: StoredStack = {
      undo: next.undo.slice(-MAX_DEPTH),
      redo: next.redo.slice(-MAX_DEPTH),
      updatedAt: Date.now(),
    };
    persist(ventureId, bounded);
    setStack(bounded);
  }, [ventureId]);

  // Record a new forward act. Clears the redo future (a new act invalidates redo). A world-boundary act is
  // pushed like any other — the gate reads it on undo, so it is NOT rejected here; it is remembered so the
  // rail can show it without an Undo control.
  const push = useCallback((entry: Omit<CanvasRevisionEntry, "id">) => {
    setStack((current) => {
      const next: StoredStack = {
        undo: [...current.undo, { ...entry, id: `rev-${Date.now()}-${current.undo.length}` }],
        redo: [],
        updatedAt: Date.now(),
      };
      const bounded = { ...next, undo: next.undo.slice(-MAX_DEPTH) };
      persist(ventureId, bounded);
      return bounded;
    });
  }, [ventureId]);

  // Pop the top undo entry for the stage to reverse — but NEVER across a world boundary. Returns the entry
  // (and moves it onto the redo stack) only when the gate allows; returns null when the top is a world
  // boundary or the stack is empty. The stage applies the returned entry's `inverse`.
  const popUndo = useCallback((): CanvasRevisionEntry | null => {
    if (!canUndoStack(stack)) return null;
    const entry = topUndo(stack)!;
    commit({
      undo: stack.undo.slice(0, -1),
      redo: [...stack.redo, entry],
      updatedAt: Date.now(),
    });
    return entry;
  }, [stack, commit]);

  // Pop the top redo entry for the stage to re-apply its `forward`, moving it back onto the undo stack.
  const popRedo = useCallback((): CanvasRevisionEntry | null => {
    if (!stack.redo.length) return null;
    const entry = stack.redo[stack.redo.length - 1];
    commit({
      undo: [...stack.undo, entry],
      redo: stack.redo.slice(0, -1),
      updatedAt: Date.now(),
    });
    return entry;
  }, [stack, commit]);

  const clear = useCallback(() => {
    window.sessionStorage.removeItem(storageKey(ventureId));
    setStack({ undo: [], redo: [], updatedAt: Date.now() });
  }, [ventureId]);

  const canUndo = useMemo(() => canUndoStack(stack), [stack]);
  const canRedo = stack.redo.length > 0;
  const peekUndo = useMemo(() => topUndo(stack), [stack]);
  const peekRedo = stack.redo.length ? stack.redo[stack.redo.length - 1] : null;

  return {
    entries: stack.undo,
    redoEntries: stack.redo,
    push,
    popUndo,
    popRedo,
    clear,
    canUndo,
    canRedo,
    peekUndo,
    peekRedo,
  };
}
