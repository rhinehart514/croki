import { memo, type KeyboardEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AtlasBetWorkflow } from "./AtlasBetWorkflow";
import { AtlasMachineryGlyph } from "./AtlasMachineryGlyph";
import type { AtlasNode } from "./atlasTypes";

function moveBetFocus(event: KeyboardEvent<HTMLButtonElement>) {
  const direction = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].indexOf(event.key);
  if (direction < 0) return;
  const bets = [...document.querySelectorAll<HTMLButtonElement>(".atlas-bet-summary")];
  const current = bets.indexOf(event.currentTarget);
  if (current < 0 || !bets.length) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0
    : event.key === "End" ? bets.length - 1
      : (current + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + bets.length) % bets.length;
  bets[next]?.focus();
}

function AtlasBetNodeView({ data, id, selected }: NodeProps<AtlasNode>) {
  const expanded = Boolean(data.expanded || selected);
  const orbitLabel = data.motionLabel === "No path named" ? "In progress" : data.motionLabel;
  return (
    <article className="atlas-bet-node atlas-element" data-atlas-kind="bet" data-kind="bet" data-focus-role={data.focusRole} data-position={data.bet?.position} data-orbit-side={data.orbitSide} data-band={data.decisionBand} data-expanded={expanded ? "true" : "false"}>
      {/* Hidden, centered handles so the hub spoke and staged-work edges route to this effort. */}
      <Handle type="target" position={Position.Left} className="atlas-hidden-handle" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="atlas-hidden-handle" isConnectable={false} />
      <button type="button" className="atlas-bet-summary" aria-pressed={expanded} title={data.title} onKeyDown={moveBetFocus} onClick={(event) => { event.stopPropagation(); data.onSelect(id); }}>
        <span><small>{orbitLabel}</small><em>{data.decisionBand?.replaceAll("-", " ")}</em></span>
        <strong title={data.title}>{data.title}</strong>
        <AtlasMachineryGlyph counts={data.machineryCounts} />
      </button>
      {expanded ? <div className="atlas-bet-workflow-wrap"><AtlasBetWorkflow id={id} data={data} /></div> : null}
    </article>
  );
}

export const AtlasBetNode = memo(AtlasBetNodeView);
