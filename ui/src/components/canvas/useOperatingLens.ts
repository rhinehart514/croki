// useOperatingLens — the small state home for the reversible operating lens (spec §2).
//
// Holds ONE piece of state: the active lens id, or null for "free arrangement" (the founder's own
// layout). `L` cycles null → understand → design → execute → learn → null; `Shift+L` reverses; `Escape`
// exits to null. The keyboard is bound HERE (not in the stage) so the state and its keys live together and
// the stage's outline keys ("o") stay separate — the spec repoints the outline off "l" so L is
// unambiguously the lens. Typing is skipped. Escape preventDefaults so the workspace broaden stands down
// this press (Escape-ladder ordering, hard risk 3).
//
// This hook owns no positions and no FLIP — it is pure view state. useLensFlip watches the id it returns
// and plays the reorganize/restore. Reduced-motion, camera, and setNodes all live in the flip hook.

import { useCallback, useEffect, useState } from "react";
import { LENS_SEQUENCE, type LensId } from "./lensArrangement";

// Step the cycle: null is the free arrangement at both ends. Forward from null enters the first lens;
// forward from the last lens returns to null. `direction` is +1 (L) or -1 (Shift+L).
export function nextLens(current: LensId | null, direction: 1 | -1): LensId | null {
  const order = LENS_SEQUENCE;
  if (current === null) return direction === 1 ? order[0] : order[order.length - 1];
  const index = order.indexOf(current);
  const next = index + direction;
  if (next < 0 || next >= order.length) return null;
  return order[next];
}

// The lens and the generated answer are mutually exclusive (they both drive the ONE node array through a
// FLIP — coexisting corrupts each other's restore frame). The stage passes a preempt: `isAnswerOpen` reads
// whether an answer is live, `dismissAnswer` restores the free frame. Entering a lens while an answer is
// open dismisses the answer and swallows that press, so the NEXT press enters the lens from the restored
// free frame — never from the answer's arrangement. ('a' is blocked in the other direction by the stage.)
export function useOperatingLens({
  isAnswerOpen,
  dismissAnswer,
}: {
  isAnswerOpen?: () => boolean;
  dismissAnswer?: () => void;
} = {}) {
  const [lensId, setLensId] = useState<LensId | null>(null);

  // Guard a lens ENTRY (a transition to a non-null lens from free) on an open answer: dismiss it and report
  // that this action was consumed by the preempt. An exit (→ null) is never guarded.
  const preempt = useCallback((): boolean => {
    if (isAnswerOpen?.()) { dismissAnswer?.(); return true; }
    return false;
  }, [isAnswerOpen, dismissAnswer]);

  const cycle = useCallback((direction: 1 | -1) => {
    // Check the preempt OUTSIDE the state updater (an updater must stay pure — it re-runs under StrictMode).
    // An answer is only ever open while the lens is free, so a preempt can only intercept an entry.
    if (lensId === null && preempt()) return;
    setLensId((current) => nextLens(current, direction));
  }, [lensId, preempt]);

  const exit = useCallback(() => setLensId(null), []);
  const setLens = useCallback((next: LensId | null) => {
    if (next !== null && preempt()) return; // picking a lens word while an answer is open: preempt
    setLensId(next);
  }, [preempt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.matches("input, textarea, [contenteditable='true']")) return;
      // The lens key. Shift reverses the cycle. We match on the physical key rather than event.key so a
      // capital "L" (shift held) still reads as the lens key.
      if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        cycle(event.shiftKey ? -1 : 1);
        return;
      }
      // Escape exits the lens to the free arrangement AND preventDefaults so the workspace broaden at
      // VentureWorkspace.tsx stands down THIS press — one Escape does one thing (lens-exit first, then the
      // next press broadens). Only consume Escape when a lens is actually active.
      if (event.key === "Escape") {
        // Read current via the functional updater so the guard is against the live value, not a stale
        // closure — but we still need to preventDefault synchronously, so check and act in one pass.
        setLensId((current) => {
          if (current !== null) event.preventDefault();
          return null;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycle]);

  return { lensId, cycle, exit, setLens };
}
