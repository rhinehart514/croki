import { useState } from "react";
import { Plus } from "lucide-react";
import type { SystemIndex, SystemIndexObject, WorkIndex, WorkIndexItem } from "@/api";
import { CrewFace } from "@/components/crew/CrewFace";
import { ThreadList } from "@/components/thread/ThreadList";
import type { WorkspaceMode } from "@/lib/venture-session";
import type { FirmConfiguration, FirmCrewMember } from "@/types";
import { AgentCreateDialog } from "./AgentCreateDialog";
import { AgentPurposeDialog } from "./AgentPurposeDialog";
import { CapabilityLogo } from "./CapabilityLogo";
import { relevantWorkflowCapabilities, type WorkflowCapability } from "./workflowCapabilities";
import { CAPABILITY_KINDS, authorityLabel, statusLabel } from "./capabilityPresentation";

function agentKind(agent: FirmConfiguration["agents"][number] | undefined) {
  if (agent?.runtime?.provider === "codex") return "Agent · Codex";
  if (agent?.runtime?.provider === "claude-code") return "Agent · Claude";
  return "Agent";
}

// An agent acts inward by default; the only outward distinction the model carries is whether its
// effects are blocked entirely or must pass the founder wall. "wall" earns Approval; everything else
// (blocked, or an unconfigured agent) honestly resolves to inward-only.
function agentAuthorityLabel(agent: FirmConfiguration["agents"][number] | undefined) {
  return agent?.authority?.outwardEffects === "wall" ? "Approval" : "Inward";
}

function ProductRail({ ventureId, index, crew, configuration, capabilities, selectedRef, search, readOnlyReason, onSelect, onUseAgent, onConfigurationChanged }: {
  ventureId: string; index: SystemIndex | null; crew: FirmCrewMember[]; configuration: FirmConfiguration; capabilities: WorkflowCapability[];
  selectedRef: string | null; search: string; readOnlyReason: string | null;
  onSelect: (object: SystemIndexObject) => void; onUseAgent: (ref: string) => void; onConfigurationChanged: () => void;
}) {
  const [inspectedAgentRef, setInspectedAgentRef] = useState<string | null>(null);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const needle = search.trim().toLowerCase();
  const matches = needle ? (index?.objects ?? []).filter((object) => `${object.name} ${object.statement} ${object.type}`.toLowerCase().includes(needle)).slice(0, 20) : [];
  const inspectedMember = crew.find((member) => member.ref === inspectedAgentRef) ?? null;
  const inspectedAgent = configuration.agents.find((agent) => agent.ref === inspectedAgentRef) ?? null;
  const workflowNames = inspectedAgentRef ? (index?.objects ?? []).filter((object) => Array.isArray(object.properties.agentRefs) && object.properties.agentRefs.map(String).includes(inspectedAgentRef)).map((object) => object.name) : [];
  const selectedObject = (index?.objects ?? []).find((object) => object.objectRef === selectedRef) ?? null;
  const visibleCapabilities = relevantWorkflowCapabilities(capabilities, selectedObject);

  return <div className="mode-rail-body product-rail-body">
    {needle ? <section aria-label="Product and go-to-market search results"><h2>Product / GTM results</h2>{matches.length ? matches.map((object) => <button type="button" key={object.objectRef} aria-current={selectedRef === object.objectRef ? "true" : undefined} onClick={() => onSelect(object)}><strong>{object.name}</strong><small>{object.territory === "gtm" ? "Go-to-market" : "Product"}</small></button>) : <p>No matching Product / GTM context.</p>}</section> : <>
      <section className="product-agent-palette" aria-label="Product and go-to-market agents"><h2><span>Agents {crew.length ? <small>{crew.length}</small> : null}</span><button type="button" onClick={() => setCreatingAgent(true)}><Plus aria-hidden="true" />New</button></h2>{crew.length ? <div className="product-palette-pills">{crew.map((member) => { const agent = configuration.agents.find((candidate) => candidate.ref === member.ref); const name = member.soul?.name?.trim() || agent?.name || member.ref; const kind = agentKind(agent); const authority = agentAuthorityLabel(agent); return <button type="button" className="product-palette-pill" draggable key={member.ref} data-authority={authority === "Approval" ? "founder-gate" : "inward"} aria-label={`${name}, ${kind}, ${authority} access`} title={agent?.perspective || "Venture-scoped agent; open to inspect authority."} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-drover-agent", member.ref); }} onClick={() => setInspectedAgentRef(member.ref)}><CrewFace agentRef={member.ref} size={26} /><span><strong>{name}</strong><small>{kind}</small></span><i>{authority}</i></button>; })}</div> : <p>Use Claude or Codex directly. Add a specialist only when repeated purpose or boundaries earn one.</p>}</section>
      {visibleCapabilities.length ? <section className="product-capability-palette" aria-label="Product and go-to-market capabilities"><h2><span>Tools &amp; sources</span><small>Attach to exact work</small></h2><div className="product-palette-pills">{visibleCapabilities.map((capability) => { const kind = CAPABILITY_KINDS[capability.kind]; const status = statusLabel(capability); const available = capability.status === "available"; return <button type="button" className="product-palette-pill" draggable={available} key={capability.id} data-authority={capability.authority} data-status={capability.status} aria-disabled={!available || undefined} aria-label={`${capability.label}, ${kind}, ${authorityLabel(capability)} access${status ? `, ${status}` : ""}`} title={`${capability.detail}${status ? ` · ${status}` : ""}`} onDragStart={(event) => { if (!available) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-drover-capability", JSON.stringify(capability)); }}><CapabilityLogo capability={capability} size={26} /><span><strong>{capability.label}</strong><small>{kind}{status ? ` · ${status}` : ""}</small></span><i>{authorityLabel(capability)}</i></button>; })}</div></section> : null}
    </>}
    {inspectedMember ? <AgentPurposeDialog member={inspectedMember} agent={inspectedAgent} workflowNames={workflowNames} onClose={() => setInspectedAgentRef(null)} onWork={onUseAgent} /> : null}
    {creatingAgent ? <AgentCreateDialog ventureId={ventureId} configuration={configuration} readOnlyReason={readOnlyReason} onClose={() => setCreatingAgent(false)} onCreated={(agent) => { setCreatingAgent(false); setInspectedAgentRef(agent.ref); onConfigurationChanged(); }} /> : null}
  </div>;
}

export function WorkspaceRailBody({ ventureId, mode, workIndex, crew, configuration, capabilities, selectedThread, systemIndex, selectedObjectRef, readOnlyReason, search, onUseAgent, onSelectThread, onSelectObject, onConfigurationChanged }: {
  ventureId: string; mode: WorkspaceMode; workIndex: WorkIndex | null; crew: FirmCrewMember[]; configuration: FirmConfiguration; capabilities: WorkflowCapability[];
  selectedThread: string | null; systemIndex: SystemIndex | null; selectedObjectRef: string | null; readOnlyReason: string | null;
  search: string; onUseAgent: (ref: string) => void; onSelectThread: (item: WorkIndexItem) => void;
  onSelectObject: (object: SystemIndexObject) => void; onConfigurationChanged: () => void;
}) {
  if (mode === "work") return <ThreadList workIndex={workIndex} search={search} selected={selectedThread} onSelect={onSelectThread} />;
  return <ProductRail ventureId={ventureId} index={systemIndex} crew={crew} configuration={configuration} capabilities={capabilities} selectedRef={selectedObjectRef} search={search} readOnlyReason={readOnlyReason} onSelect={onSelectObject} onUseAgent={onUseAgent} onConfigurationChanged={onConfigurationChanged} />;
}
