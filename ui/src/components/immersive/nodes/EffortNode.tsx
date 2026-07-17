// The effort / live-push archetype (bet). Renders the resting card anatomy from the prototype:
// kicker · serif title · body · draft chip · footer (state dot + label + facepile). Provisional vs
// durable and needs-your-hand tone are legible via NodeChrome + the data-tone attribute. Consumes the
// real AtlasNodeData produced by projectAtlas — no invented fields.
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeChrome } from "./nodeChrome";
import { crewColor, initialFor } from "./nodeCrew";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

export function EffortNode({ id, data }: NodeProps<AtlasNode>) {
  const tone = data.effortTone === "needs" ? "needs" : "live";
  const draftCount = data.draftCount ?? 0;
  const teammates = data.teammates ?? [];
  return (
    <NodeChrome data={data}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <button
        type="button"
        className="iw-card"
        data-tone={tone}
        onClick={() => data.onSelect(id)}
        aria-label={data.title}
      >
        {data.effortKicker ? <div className="iw-kicker">{data.effortKicker}</div> : null}
        <div className="iw-title">{data.title}</div>
        {data.statement ? <div className="iw-body">{data.statement}</div> : null}
        {draftCount > 0 ? (
          <span className="iw-drafts">
            {data.draftTitle ?? `${draftCount} draft${draftCount > 1 ? "s" : ""}`}
          </span>
        ) : null}
        <div className="iw-foot">
          <span className="iw-dot" />
          <span className="iw-state">{data.stateLabel ?? "Underway"}</span>
          {teammates.length ? (
            <span className="iw-faces">
              {teammates.slice(0, 4).map((mate) => (
                <span key={mate.ref} className="iw-face" style={{ ["--face-color" as string]: crewColor(mate.ref) }}>
                  {initialFor(mate.name || mate.ref)}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        {data.continuation ? <div className="iw-detail-only iw-continuation">{data.continuation}</div> : null}
      </button>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </NodeChrome>
  );
}
