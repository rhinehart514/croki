import { useState, type DragEvent } from "react";
import { Database, GripVertical, Library, Mail, Settings2, Split } from "lucide-react";
import type { FirmConfiguration, FirmCrewMember } from "@/types";
import { CrewFace } from "@/components/crew/CrewFace";
import { Button } from "@/components/ui/button";
import { configuredParticipantName } from "@/components/firm/teammateDisplay";
import { capabilityAnchorKey, crewAnchorKey, type CanvasAnchorKey } from "@/lib/lensLayout";
import { CANVAS_ITEM_MIME, type CanvasCapability } from "./canvasCapabilities";

function CapabilityIcon({ kind }: { kind: CanvasCapability["icon"] }) {
  if (kind === "mail") return <Mail aria-hidden="true" />;
  if (kind === "git") return <Split aria-hidden="true" />;
  return <Database aria-hidden="true" />;
}

export function CanvasTray({
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
  const [open, setOpen] = useState(false);
  const beginDrag = (event: DragEvent<HTMLElement>, key: CanvasAnchorKey) => {
    event.dataTransfer.setData(CANVAS_ITEM_MIME, key);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="firm-lens-tray" data-open={open ? "true" : "false"}>
      <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls="firm-canvas-tray" onClick={() => setOpen((current) => !current)}>
        <Library aria-hidden="true" /> Canvas tray
        <small>{crew.length + capabilities.length}</small>
      </Button>
      <section id="firm-canvas-tray" aria-label="Canvas tray" hidden={!open}>
          <header><strong>Place on the canvas</strong><small>Drag an item, or click to place it in view.</small></header>
          <div className="firm-lens-tray-group">
            <span>Crew</span>
            {crew.map((member) => {
              const key = crewAnchorKey(member.ref);
              const name = configuredParticipantName(configuration, member.ref, member);
              return (
                <button key={key} type="button" draggable={!readOnly} disabled={readOnly} onDragStart={(event) => beginDrag(event, key)} onClick={() => onPlace(key)} aria-label={`Place ${name} on canvas`}>
                  <GripVertical aria-hidden="true" />
                  <CrewFace agentRef={member.ref} size={28} />
                  <span><strong>{name}</strong><small>Move teammate</small></span>
                </button>
              );
            })}
          </div>
          <div className="firm-lens-tray-group">
            <span>Real capabilities</span>
            {capabilities.map((capability) => {
              const key = capabilityAnchorKey(capability.id);
              return (
                <button key={key} type="button" draggable={!readOnly} disabled={readOnly} onDragStart={(event) => beginDrag(event, key)} onClick={() => onPlace(key)} aria-label={`Place ${capability.name} on canvas`}>
                  <GripVertical aria-hidden="true" />
                  <i><CapabilityIcon kind={capability.icon} /></i>
                  <span><strong>{capability.name}</strong><small>{placedKeys.has(key) ? "On canvas · move" : capability.authority === "wall" ? "Founder review" : "Read only"}</small></span>
                </button>
              );
            })}
          </div>
          {onOpenSettings ? (
            <Button type="button" variant="ghost" size="sm" onClick={onOpenSettings}><Settings2 aria-hidden="true" /> Manage connections</Button>
          ) : null}
      </section>
    </div>
  );
}
