import { useMemo, useState, type DragEvent } from "react";
import { ChevronLeft, ChevronRight, Database, GitBranch, Mail, Settings2, Users } from "lucide-react";
import type { FirmConfiguration, FirmCrewMember } from "@/types";
import { CrewFace } from "@/components/crew/CrewFace";
import { configuredParticipantName } from "@/components/firm/teammateDisplay";
import { capabilityAnchorKey, crewAnchorKey, type CanvasAnchorKey } from "@/lib/lensLayout";
import { CANVAS_ITEM_MIME, type CanvasCapability } from "@/components/lens/canvasCapabilities";

// The shelf is the home for the two things you place onto the canvas yourself: teammates and real
// capabilities. It stays on the far-left edge so the working canvas and the conversation never sit on
// it. Each chip drags onto the canvas or click-places it; a placed item becomes a draggable node.
function CapabilityIcon({ kind }: { kind: CanvasCapability["icon"] }) {
  if (kind === "mail") return <Mail aria-hidden="true" />;
  if (kind === "git") return <GitBranch aria-hidden="true" />;
  return <Database aria-hidden="true" />;
}

export function AtlasShelf({
  crew,
  configuration,
  capabilities,
  placedKeys,
  readOnly,
  onPlace,
  onOpenSettings,
}: {
  crew: FirmCrewMember[];
  configuration: FirmConfiguration;
  capabilities: CanvasCapability[];
  placedKeys: Set<string>;
  readOnly: boolean;
  onPlace: (key: CanvasAnchorKey) => void;
  onOpenSettings?: () => void;
}) {
  const itemKeys = useMemo(() => [
    ...crew.map((member) => crewAnchorKey(member.ref)),
    ...capabilities.map((capability) => capabilityAnchorKey(capability.id)),
  ], [capabilities, crew]);
  const allPlaced = itemKeys.length > 0 && itemKeys.every((key) => placedKeys.has(key));
  const [completeBenchExpanded, setCompleteBenchExpanded] = useState(false);
  const expanded = !allPlaced || completeBenchExpanded;
  const beginDrag = (event: DragEvent<HTMLElement>, key: CanvasAnchorKey) => {
    event.dataTransfer.setData(CANVAS_ITEM_MIME, key);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="atlas-shelf" aria-label="Teammates and capabilities" data-expanded={expanded ? "true" : "false"}>
      <header>
        <Users aria-hidden="true" />
        <span>Canvas bench</span>
        <button type="button" disabled={!allPlaced} onClick={() => setCompleteBenchExpanded((open) => !open)} aria-label={expanded ? "Collapse canvas bench" : "Expand canvas bench"} title={!allPlaced ? "The bench stays open until every item is placed" : expanded ? "Collapse bench" : "Expand bench"}>
          {expanded ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        </button>
      </header>
      <div className="atlas-shelf-group" role="group" aria-label="Teammates">
        <span className="atlas-shelf-label">Teammates</span>
        {crew.map((member) => {
          const key = crewAnchorKey(member.ref);
          const name = configuredParticipantName(configuration, member.ref, member);
          return (
            <button
              key={key}
              type="button"
              className="atlas-shelf-chip"
              data-placed={placedKeys.has(key) ? "true" : "false"}
              draggable={!readOnly}
              disabled={readOnly}
              onDragStart={(event) => beginDrag(event, key)}
              onClick={() => onPlace(key)}
              aria-label={`Place ${name} on the canvas`}
              title={placedKeys.has(key) ? `${name} · reveal on canvas` : `Place ${name} on the canvas`}
            >
              <CrewFace agentRef={member.ref} size={30} />
              <span className="atlas-shelf-chip-text"><strong>{name}</strong><small>{placedKeys.has(key) ? "On canvas" : "Teammate"}</small></span>
            </button>
          );
        })}
      </div>
      <div className="atlas-shelf-group" role="group" aria-label="Capabilities">
        <span className="atlas-shelf-label">Capabilities</span>
        {capabilities.map((capability) => {
          const key = capabilityAnchorKey(capability.id);
          return (
            <button
              key={key}
              type="button"
              className="atlas-shelf-chip"
              data-placed={placedKeys.has(key) ? "true" : "false"}
              data-authority={capability.authority}
              draggable={!readOnly}
              disabled={readOnly}
              onDragStart={(event) => beginDrag(event, key)}
              onClick={() => onPlace(key)}
              aria-label={`Place ${capability.name} on the canvas`}
              title={placedKeys.has(key) ? `${capability.name} · reveal on canvas` : `Place ${capability.name} on the canvas`}
            >
              <i className="atlas-shelf-chip-icon"><CapabilityIcon kind={capability.icon} /></i>
              <span className="atlas-shelf-chip-text"><strong>{capability.name}</strong><small>{placedKeys.has(key) ? "On canvas · move" : capability.authority === "wall" ? "Founder review" : "Read only"}</small></span>
            </button>
          );
        })}
      </div>
      {onOpenSettings ? (
        <button type="button" className="atlas-shelf-manage" onClick={onOpenSettings} aria-label="Manage connections" title="Manage connections"><Settings2 aria-hidden="true" /><span>Manage connections</span></button>
      ) : null}
    </aside>
  );
}
