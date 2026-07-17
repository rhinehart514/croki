// The amber needs-your-hand pulse (architecture §1/§3, redesign §8/§9). The ONLY floating chrome that
// earns amber: it shows the count of wall items still awaiting the founder's decision (decision === null)
// and, on click, descends into THE GATE — the "decide what touches the world" surface. This is the single
// glanceable answer to outcome 5. The gate is the aggregate wall node (id "atlas:wall"), whose descent
// reading (DescendReading.wallItemFor → GateReading) renders the freshest waiting item's exact payload
// with a Release/Hold dialogue. Crucially it must NOT descend into the associated effort's node
// (bet:<id>) — that opens a steerable EffortReading, not the gate. So the pulse routes through the
// world's own selectNode into the wall node directly, ignoring any bet-specific target.
import { useCallback, useMemo } from "react";
import type { WallQueueItemView } from "@/api";
import { useShellState } from "../state/shellState";

// The aggregate gate node placed by the atlas projection; its descent reading resolves the waiting item.
const GATE_NODE_ID = "atlas:wall";

export function NeedsYouPulse({
  wallItems,
}: {
  wallItems: WallQueueItemView[];
  // A prior wiring passed a bet-targeting descend callback here; the pulse now owns gate routing itself
  // (it must reach the gate, never the effort behind it), so it drives selectNode(atlas:wall) directly.
  onDescendToGate?: () => void;
}) {
  const { world } = useShellState();
  const waiting = useMemo(() => wallItems.filter((item) => item.decision === null).length, [wallItems]);
  const active = waiting > 0;

  // Descend to the gate node itself (never the effort behind it). The world publishes selectNode into
  // shell state; it drives the same fly-in-and-open descent a node click uses, and DescendReading routes
  // the wall node to GateReading. When the gate node is not placed yet, do nothing rather than error.
  const descendToGate = useCallback(() => {
    const selectNode = world?.selectNode;
    if (!selectNode) return;
    if (world?.nodes?.some((node) => node.id === GATE_NODE_ID)) selectNode(GATE_NODE_ID);
  }, [world]);

  if (!active) {
    return (
      <div className="iw-pulse" data-state="clear" aria-label="Nothing needs your decision">
        <span className="iw-pulse-dot" aria-hidden="true" />
        <span className="iw-pulse-label">Nothing needs you</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="iw-pulse"
      data-state="waiting"
      onClick={descendToGate}
      aria-label={`${waiting} ${waiting === 1 ? "decision waits" : "decisions wait"} for you — open the gate`}
    >
      <span className="iw-pulse-dot" aria-hidden="true" />
      <span className="iw-pulse-count">{waiting}</span>
      <span className="iw-pulse-label">{waiting === 1 ? "needs you" : "need you"}</span>
    </button>
  );
}
