import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Database, Mail } from "lucide-react";
import { useAtlasDensity } from "./atlasDensity";
import { EpistemicToken } from "./EpistemicToken";
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
  // Zoomed out, the capability reads as its lit/unlit icon + name; the on/off state word re-details as
  // the founder zooms in (contract §3). A selected capability always shows it.
  const density = useAtlasDensity();
  const cardDensity = isSelected ? "detailed" : density;
  return (
    <div
      className="atlas-capability"
      data-atlas-kind="capability"
      data-atlas-id={id}
      data-territory={data.territory ?? undefined}
      data-connected={connected ? "true" : "false"}
      data-density={cardDensity}
      data-selected={isSelected ? "true" : "false"}
      data-focus-role={data.focusRole}
      data-epi-state={data.epistemic ?? "empty"}
    >
      {/* Reserved epistemic corner slot (Law 11), hollow — a capability port carries no epistemic claim. */}
      <EpistemicToken state={data.epistemic ?? null} />
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
