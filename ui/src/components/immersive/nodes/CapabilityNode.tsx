// A real port into the world (repo / inbox). Green when connected; neutral when not. capabilityKind
// distinguishes the glyph. Founder-facing state word stays ordinary (connected / not connected).
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeChrome } from "./nodeChrome";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

function CapabilityGlyph({ kind }: { kind: string | undefined }) {
  if (kind === "gmail") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3v12" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

export function CapabilityNode({ id, data }: NodeProps<AtlasNode>) {
  const connected = data.capabilityConnected !== false;
  return (
    <NodeChrome data={data}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <button
        type="button"
        className="iw-cap"
        data-connected={connected ? "true" : "false"}
        onClick={() => data.onSelect(id)}
        aria-label={data.title}
      >
        <div className="iw-cap-head">
          <span className="iw-cap-ic"><CapabilityGlyph kind={data.capabilityKind} /></span>
          <span className="iw-cap-name">{data.title}</span>
        </div>
        <div className="iw-cap-state">
          <span className="iw-cdot" />
          {connected ? "Connected" : "Not connected"}
        </div>
      </button>
    </NodeChrome>
  );
}
