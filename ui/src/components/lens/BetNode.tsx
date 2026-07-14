// BetNode.tsx — one bet's card on the lens: its intent, how many drafts are staged, and the market's
// latest return, if any. Position (live / at-wall / ended) is the ONE status signal shown, and it is
// drawn with the wall's own amber (DESIGN.md: "the wall owns amber") — never a health score, never a
// count of anything the market said. A bet has no kind (FIRM-SPEC.md), so this card never switches on
// one; it only ever shows the content a bet actually carries.

import { Handle, Position as HandlePosition, type NodeProps } from "@xyflow/react";
import { GitFork } from "lucide-react";
import type { FirmBet } from "@/types";

export type BetNodeData = { bet: FirmBet };

const POSITION_LABEL: Record<FirmBet["position"], string> = {
  live: "Live",
  "at-wall": "At the wall",
  ended: "Ended",
};

export function BetNode({ data }: NodeProps & { data: BetNodeData }) {
  const { bet } = data;
  return (
    <div className={`firm-lens-bet-node firm-lens-bet-node-${bet.position}`}>
      <Handle type="target" position={HandlePosition.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={HandlePosition.Bottom} style={{ opacity: 0 }} />
      <div className="firm-lens-bet-node-header">
        {bet.forkedFrom ? <GitFork size={12} aria-hidden="true" className="firm-lens-bet-node-fork-icon" /> : null}
        <span className="firm-lens-bet-node-position">{POSITION_LABEL[bet.position]}</span>
      </div>
      <p className="firm-lens-bet-node-intent">{bet.intent}</p>
      <div className="firm-lens-bet-node-footer">
        {bet.stagedCount > 0 ? <span>{bet.stagedCount} staged</span> : null}
        {bet.latestOutcome ? <span className="firm-lens-bet-node-voice">"{bet.latestOutcome.body}"</span> : null}
      </div>
    </div>
  );
}
