import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CrewFace } from "@/components/crew/CrewFace";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import { atlasTeammates, relatedAtlasBets } from "./atlasTeammates";

export function AtlasMachinery({
  nodeId,
  projection,
  lens,
  onClose,
}: {
  nodeId: string;
  projection: FirmArchitectureProjection;
  lens: FirmLens;
  onClose: () => void;
}) {
  const architectureId = nodeId.startsWith("architecture:") ? nodeId.slice("architecture:".length) : null;
  const element = projection.elements.find((candidate) => candidate.id === architectureId);
  const bet = nodeId.startsWith("bet:") ? lens.bets.find((candidate) => candidate.id === nodeId.slice("bet:".length)) : null;
  const relatedBets = relatedAtlasBets(projection, lens, nodeId);
  const teammates = atlasTeammates(projection, lens, nodeId);
  return (
    <aside data-atlas-machinery className="atlas-machinery" aria-label="Execution details">
      <header><span><small>Receipt depth</small><strong>How this runs</strong></span><Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Hide execution details"><X /></Button></header>
      <p>{element?.name ?? bet?.intent ?? "Selected execution context"}</p>
      <dl>
        <div><dt>Architecture</dt><dd>revision {projection.revision}</dd></div>
        <div className="atlas-machinery-teammates"><dt>Agents</dt><dd>{teammates.length ? <span>{teammates.slice(0, 3).map((teammate) => <CrewFace key={teammate.ref} agentRef={teammate.ref} size={26} />)}<b>{teammates.map((teammate) => teammate.name).join(" + ")}</b></span> : "None configured"}</dd></div>
        <div><dt>Related work</dt><dd>{relatedBets.length || "None yet"}</dd></div>
        <div><dt>Exact work</dt><dd>{relatedBets.reduce((count, item) => count + item.staged.length, 0)} prepared pieces</dd></div>
        <div><dt>Runtime</dt><dd>Shown on each work receipt</dd></div>
        <div><dt>Authority</dt><dd>Outward effects wait for your review</dd></div>
      </dl>
      <small>Tools, models, worktrees, costs, and coordination remain attached to exact work rather than defining the venture map.</small>
    </aside>
  );
}
