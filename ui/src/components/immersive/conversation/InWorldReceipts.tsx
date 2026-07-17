// Ambient in-world receipts (architecture §1, redesign §3/§7). Agent work surfaces as flat icon+mono log
// rows anchored next to the node they concern — never chat bubbles, never a docked column. This component
// takes the polled conversation, keeps the few most-recent scoped messages, and renders each as a small
// glass receipt positioned over its world node using the live viewport transform. Firm-wide messages (no
// target) and checkpoints (handoffs) are not shown here — those live in the summonable thread.
//
// Position is derived from the node's engine-placed coordinates projected through the ReactFlow viewport
// (useStore) so a receipt tracks its node as the founder pans/zooms. Read-only; conversation is
// append-only (CONTRACT 1.5).
import { useMemo } from "react";
import { useStore } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import type { FirmConversationMessage } from "@/types";
import { crewName, isCheckpoint, receiptNodeId } from "./conversationModel";

// How many recent receipts to surface at once — kept small so the world stays legible (redesign §10:
// wide-but-quiet). Older receipts recede into the summonable thread.
const MAX_RECEIPTS = 4;

type PlacedReceipt = {
  id: string;
  nodeId: string;
  x: number;
  y: number;
  line: string;
  crew: string;
};

export function InWorldReceipts({
  conversation,
  nodes,
}: {
  conversation: FirmConversationMessage[];
  nodes: AtlasNode[];
}) {
  const transform = useStore((state) => state.transform);
  const [tx, ty, zoom] = transform;

  const placed = useMemo<PlacedReceipt[]>(() => {
    const byId = new Map<string, Node<AtlasNode["data"]>>();
    for (const node of nodes) byId.set(node.id, node as unknown as Node<AtlasNode["data"]>);
    const rows: PlacedReceipt[] = [];
    // Walk newest-first so the freshest scoped receipts win the small budget.
    for (let i = conversation.length - 1; i >= 0 && rows.length < MAX_RECEIPTS; i -= 1) {
      const message = conversation[i];
      if (isCheckpoint(message)) continue;
      if (message.role === "founder") continue;
      const nodeId = receiptNodeId(message);
      if (!nodeId) continue;
      const node = byId.get(nodeId);
      if (!node) continue;
      const width = node.measured?.width ?? node.width ?? 244;
      rows.push({
        id: message.id,
        nodeId,
        // Anchor to the node's top-right in world space; the viewport transform maps it to the screen.
        x: node.position.x + width,
        y: node.position.y,
        line: message.content,
        crew: crewName(message.teammateRef),
      });
    }
    return rows;
  }, [conversation, nodes]);

  if (!placed.length) return null;

  return (
    <div className="iw-receipts" aria-live="polite" aria-label="What the crew is doing">
      {placed.map((receipt) => (
        <div
          key={receipt.id}
          className="iw-receipt"
          style={{ transform: `translate(${receipt.x * zoom + tx}px, ${receipt.y * zoom + ty}px)` }}
        >
          <span className="iw-receipt-glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <div className="iw-receipt-body">
            <span className="iw-receipt-crew">{receipt.crew}</span>
            <span className="iw-receipt-line">{receipt.line}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
