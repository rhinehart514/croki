import { Database, Mail, ShieldCheck, X, type LucideIcon } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { CanvasAltitude } from "./lensScene";
import type { CanvasCapability } from "./canvasCapabilities";

export type CapabilityNodeData = {
  capability: CanvasCapability;
  altitude?: CanvasAltitude;
  readOnly?: boolean;
  onRemove?: (id: string) => void;
};

const ICONS: Record<CanvasCapability["icon"], LucideIcon> = {
  database: Database,
  mail: Mail,
};

const OUTPUT: Record<CanvasCapability["id"], string> = {
  "product-truth": "Cited product evidence",
  gmail: "Joined replies and prepared sends",
};

export function CapabilityNode({ id, data }: NodeProps & { data: CapabilityNodeData }) {
  const { capability, altitude = "near", readOnly = false, onRemove } = data;
  const Icon = ICONS[capability.icon];
  return (
    <article className={`firm-lens-capability-node firm-lens-capability-node-${altitude}`}>
      <span className="firm-lens-capability-icon" aria-hidden="true"><Icon /></span>
      <span>
        <strong>{capability.name}</strong>
        {altitude !== "far" ? <small>{capability.source}</small> : null}
      </span>
      {altitude === "near" ? <p>{capability.description}</p> : null}
      {altitude !== "far" ? (
        <footer className="firm-lens-capability-reading">
          <b>{capability.authority === "wall" ? <ShieldCheck aria-hidden="true" /> : null}{capability.authority === "wall" ? "Founder-held" : "Ready"}</b>
          <span>{OUTPUT[capability.id]}</span>
          <em>Direct</em>
        </footer>
      ) : null}
      <button className="nodrag" type="button" disabled={readOnly} aria-label={`Remove ${capability.name} from canvas`} onClick={(event) => { event.stopPropagation(); onRemove?.(id); }}>
        <X aria-hidden="true" />
      </button>
    </article>
  );
}
