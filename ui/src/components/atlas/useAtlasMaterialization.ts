import { useEffect, useRef, useState, useTransition } from "react";
import type { AtlasNode } from "./atlasTypes";

// Kinetic materialization (contract §3): a composer direction unfolds the working theory over ~2–3s,
// nodes born in sequence rather than snapping in all at once. The resting stage renders the hub, the
// efforts ringing it, the crew, and the capabilities (ventureAtlasModel.canvasArchetypeScene); when a
// direction lands, a batch of these arrives together from the projection. This hook holds that batch
// hidden, then reveals its members one at a time on a cadence, so the theory *unfolds*. It uses React
// 19 useTransition so each reveal is a low-priority update that never blocks input (the founder can pan
// or type while the theory is still arriving).
//
// It is deliberately conservative about *when* to stage: only a genuine burst — several new stage nodes
// appearing at once against a settled known set — unfolds. Incremental single-node arrivals (a lone new
// effort returning later) fall through to the per-node arrival animation already on the cards, so this
// never re-hides a live field on every poll. Reduced motion reveals instantly.

const STEP_MS = 220; // cadence between node births; ~9 nodes fills the ~2s signature window.
const BURST_MIN = 3; // fewer than this is an increment, not a materialization — no staged unfold.

function stageId(node: AtlasNode): string {
  return node.id;
}

export function useAtlasMaterialization(
  nodes: AtlasNode[],
  reducedMotion: boolean,
): { revealedIds: ReadonlySet<string> | null; materializingIds: ReadonlySet<string> } {
  const knownRef = useRef<Set<string> | null>(null);
  const timersRef = useRef<number[]>([]);
  const [revealed, setRevealed] = useState<Set<string> | null>(null);
  const [, startReveal] = useTransition();

  useEffect(() => {
    const known = knownRef.current;
    const currentIds = nodes.map(stageId);
    const currentSet = new Set(currentIds);

    // First settle (or a venture swap that reset the known set): learn the field without unfolding it —
    // opening onto an existing venture should not re-animate its whole stage.
    if (known === null) {
      knownRef.current = currentSet;
      setRevealed(null);
      return;
    }

    const arrived = currentIds.filter((id) => !known.has(id));
    // Keep known in sync with removals too, so a later re-arrival counts as new.
    knownRef.current = currentSet;

    if (reducedMotion || arrived.length < BURST_MIN) {
      // Not a materialization burst: reveal everything immediately; the cards' own arrival animation
      // (arrivalReceiptId) carries any single new node. Clear any staged holdback.
      setRevealed(null);
      return;
    }

    // A burst: hold the arrived nodes hidden, then reveal them one at a time. Everything already known
    // stays visible throughout; only the newly-arrived theory unfolds.
    const held = new Set(currentIds.filter((id) => known.has(id)));
    setRevealed(held);
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = arrived.map((id, index) =>
      window.setTimeout(() => {
        startReveal(() => {
          setRevealed((previous) => {
            const next = new Set(previous ?? held);
            next.add(id);
            // Once every arrived node is in, drop the holdback entirely (null = show all) so the field
            // is never left partially gated if the node set changes underneath the cadence.
            if (arrived.every((arrivedId) => next.has(arrivedId))) return null;
            return next;
          });
        });
      }, STEP_MS * (index + 1)),
    );
  }, [nodes, reducedMotion]);

  useEffect(() => () => { timersRef.current.forEach((timer) => window.clearTimeout(timer)); }, []);

  // materializingIds = the currently-held-back set (present in the field but not yet revealed), so the
  // decorator can mark them for the enter animation.
  const materializingIds = new Set<string>();
  if (revealed) {
    for (const node of nodes) if (!revealed.has(node.id)) materializingIds.add(node.id);
  }
  return { revealedIds: revealed, materializingIds };
}
