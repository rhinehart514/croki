import { useState, type FormEvent } from "react";
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { Check, Plus } from "lucide-react";
import { CrewFace } from "@/components/crew/CrewFace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FirmConfiguredAgent, FirmCrewMember } from "@/types";
import type { CanvasAltitude } from "./lensScene";

export type CrewNodeData = {
  crew: FirmCrewMember;
  agent: FirmConfiguredAgent | null;
  participantLabel: string;
  working: boolean;
  altitude?: CanvasAltitude;
  focusRole?: "focus" | "related" | "context";
  readOnly?: boolean;
  onProposeCapability?: (agentRef: string, capability: string) => Promise<void>;
};

const HIDDEN_HANDLE_STYLE = { opacity: 0 } as const;

export function CrewNode({ data, selected }: NodeProps & { data: CrewNodeData }) {
  const { crew, agent, participantLabel, working, altitude = "near", focusRole = "context", readOnly = false, onProposeCapability } = data;
  const name = agent?.name ?? (typeof crew.soul?.name === "string" ? crew.soul.name : crew.ref);
  const runtime = agent?.runtime.provider ?? "Auto runtime";
  const capabilityCount = agent?.capabilities.additional.length ?? 0;
  const [adding, setAdding] = useState(false);
  const [capability, setCapability] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const next = capability.trim();
    if (!next || !onProposeCapability) return;
    setBusy(true); setError(null);
    try {
      await onProposeCapability(crew.ref, next);
      setCapability(""); setAdding(false); setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };

  return (
    <div className={`firm-lens-crew-node firm-lens-crew-node-${altitude}`} data-focus-role={focusRole}>
      <Handle id="organization-in" type="target" position={Position.Left} style={HIDDEN_HANDLE_STYLE} />
      <Handle id="organization-out" type="source" position={Position.Right} style={HIDDEN_HANDLE_STYLE} />
      <Handle id="work" type="source" position={Position.Bottom} style={HIDDEN_HANDLE_STYLE} />
      <NodeToolbar isVisible={selected} position={Position.Right} offset={14} className="firm-lens-participant-toolbar nodrag">
        {!adding ? (
          <Button type="button" variant="outline" size="sm" disabled={readOnly} onClick={() => { setAdding(true); setDone(false); }}>
            {done ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {done ? "Proposal sent to chat" : "Propose capability"}
          </Button>
        ) : (
          <form onSubmit={(event) => void submit(event)} aria-label={`Propose capability for ${name}`}>
            <label>
              <span>Capability for {name}</span>
              <Input
                autoFocus
                className="nodrag bg-[var(--canvas)]"
                value={capability}
                onChange={(event) => { setCapability(event.target.value); setDone(false); }}
                placeholder="e.g. independent verification"
                disabled={busy || readOnly}
              />
            </label>
            <div>
              <Button type="submit" size="sm" disabled={busy || readOnly || !capability.trim()}>{busy ? "Proposing…" : "Send to chat"}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
            </div>
            {error ? <small role="alert">{error}</small> : null}
          </form>
        )}
      </NodeToolbar>
      <div className="firm-lens-participant-card" title={`${name}, ${agent?.label ?? participantLabel}`}>
        <CrewFace agentRef={crew.ref} size={altitude === "far" ? 28 : 40} state={working ? "working" : "idle"} />
        <span>
          <strong>{name}</strong>
          {altitude !== "far" ? <small>{agent?.label ?? participantLabel} · {runtime}</small> : null}
        </span>
        {altitude === "near" && capabilityCount ? <em>{capabilityCount} {capabilityCount === 1 ? "capability" : "capabilities"}</em> : null}
      </div>
    </div>
  );
}
