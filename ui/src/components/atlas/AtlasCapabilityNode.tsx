import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Database, Mail } from "lucide-react";
import type { AtlasNode } from "./atlasTypes";

// A capability on the stage — the composite's capability node: a warm instrument the firm can reach
// through. A small icon well (lit when connected), the plain name, and an ordinary on/off state word.
// These are the two real ports today — the bound product repository (always on) and Gmail (on only
// when the founder has connected it). Unavailable stays honestly unavailable; no invented connectors.

function CapabilityGlyph({ agentKind }: { agentKind: string }) {
  if (agentKind === "gmail") return <Mail aria-hidden="true" />;
  return <Database aria-hidden="true" />;
}

function AtlasCapabilityNodeView({ data, id, selected }: NodeProps<AtlasNode>) {
  const connected = data.authority === "read" || Boolean(data.capabilityConnected);
  const isSelected = Boolean(selected || data.selected);
  const stateWord = connected ? "connected" : "not connected";
  const agentKind = (data.capabilityKind as string | undefined) ?? "repo";
  return (
    <div
      className="atlas-capability"
      data-atlas-kind="capability"
      data-atlas-id={id}
      data-connected={connected ? "true" : "false"}
      data-selected={isSelected ? "true" : "false"}
      data-focus-role={data.focusRole}
    >
      <button
        type="button"
        className="atlas-capability-button"
        aria-label={`${data.title} — ${stateWord}`}
        aria-pressed={isSelected}
        onClick={(event) => { event.stopPropagation(); data.onSelect(id); }}
      >
        <span className={connected ? "cap-icon on" : "cap-icon off"}>
          <CapabilityGlyph agentKind={agentKind} />
        </span>
        <span className="cap-text">
          <span className="cap-label">{data.title}</span>
          <span className={connected ? "cap-state on" : "cap-state off"}>{stateWord}</span>
        </span>
      </button>
    </div>
  );
}

export const AtlasCapabilityNode = memo(AtlasCapabilityNodeView);
