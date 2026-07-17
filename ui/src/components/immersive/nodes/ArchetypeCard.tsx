// Shared paper-card body for the semantic-layer archetypes (concept / system / motion / campaign /
// record). Each archetype is the same card frame with a role-named kicker; the distinct components
// exist so the worldNodeTypes registry can map kind → archetype and so later phases can specialize a
// single role's body without touching the others. Consumes real AtlasNodeData verbatim.
import { Handle, Position } from "@xyflow/react";
import { NodeChrome } from "./nodeChrome";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function ArchetypeCard({
  id,
  data,
  kicker,
}: {
  id: string;
  data: AtlasNode["data"];
  kicker: string;
}) {
  return (
    <NodeChrome data={data}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <button
        type="button"
        className="iw-card"
        onClick={() => data.onSelect(id)}
        aria-label={data.title}
      >
        <div className="iw-kicker">{kicker}</div>
        <div className="iw-title">{data.title}</div>
        {data.statement ? <div className="iw-body">{data.statement}</div> : null}
        {data.stateLabel ? (
          <div className="iw-foot">
            <span className="iw-dot" />
            <span className="iw-state">{data.stateLabel}</span>
          </div>
        ) : null}
      </button>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </NodeChrome>
  );
}
