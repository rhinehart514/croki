import { Check, CircleDot, FileText, MessageSquareReply, Shield } from "lucide-react";
import type { DiveNode } from "./diveProjection";

const iconByKind = {
  bet: CircleDot,
  event: Check,
  work: FileText,
  gate: Shield,
  outcome: MessageSquareReply,
} as const;

function displayedTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function DiveWorkflowNode({ node, onInspectGate }: { node: DiveNode; onInspectGate: (itemId: string) => void }) {
  const Icon = iconByKind[node.kind];
  const content = <>
    <span className="atlas-dive-node-heading">
      <span className="atlas-dive-node-icon"><Icon aria-hidden="true" /></span>
      <span className="atlas-dive-node-copy"><span><small>{node.eyebrow}</small><em>{node.state}</em></span><strong>{node.title}</strong></span>
    </span>
    {node.body ? <p title={node.body}>{node.body}</p> : null}
    <dl>
      {node.teammateNames.length ? <div><dt>Teammate</dt><dd>{node.teammateNames.join(" + ")}</dd></div> : null}
      {node.runningTeammateNames.length ? <div><dt>Here now</dt><dd>{node.runningTeammateNames.join(" + ")}</dd></div> : null}
      {node.runningSince ? <div><dt>Since</dt><dd><time dateTime={node.runningSince}>{displayedTime(node.runningSince)}</time></dd></div> : null}
      {node.at ? <div><dt>Receipt</dt><dd><time dateTime={node.at}>{displayedTime(node.at)}</time></dd></div> : null}
      {node.receipts.map((receipt) => <div key={`${receipt.label}:${receipt.value}`}><dt>{receipt.label}</dt><dd title={receipt.value}>{receipt.value}</dd></div>)}
    </dl>
  </>;

  if (node.kind === "gate" && node.wallItem) {
    return (
      <article className="atlas-dive-node atlas-dive-node-gate" data-state={node.state}>
        {content}
        <button type="button" className="atlas-dive-gate-action" onClick={() => onInspectGate(node.wallItem!.id)}>Inspect held act</button>
      </article>
    );
  }
  return <article className="atlas-dive-node" data-state={node.state}>{content}</article>;
}
