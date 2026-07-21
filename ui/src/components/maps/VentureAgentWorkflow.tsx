import { Bot, Radio, Send, ShieldCheck, Zap } from "lucide-react";
import { useState, type DragEvent, type PointerEvent, type ReactNode } from "react";
import type { WorkIndexOutlineObject } from "@/api";
import type { WorkflowCapability } from "@/components/workspace/workflowCapabilities";
import type { VentureGraph, VenturePipeline } from "./ventureMapModel";
import { VentureConditionalWorkflow } from "./VentureConditionalWorkflow";
import { conditionalWorkflowGraph } from "./conditionalWorkflowGraph";

type StepKind = "trigger" | "agent" | "gate" | "action" | "evidence";
type SelectionRect = { left: number; top: number; width: number; height: number };

function typeOf(object: WorkIndexOutlineObject) { return object.type.toLowerCase(); }
function list(value: unknown) { return Array.isArray(value) ? value.map(String).filter(Boolean) : []; }
function capabilityMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, string[]>;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, list(entry)]));
}

export function VentureAgentWorkflow({ graph, objects, selectedId, onSelect, onChat, onAgentDrop, onCapabilityDrop, onAgentRemove, onCapabilityRemove, onDeclareWorkflow }: {
  graph: VentureGraph;
  objects: WorkIndexOutlineObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChat?: (objectRef: string) => void;
  onAgentDrop?: (agentRef: string, pipelineRef: string) => void;
  onCapabilityDrop?: (capability: WorkflowCapability, pipelineRef: string, step: StepKind) => void;
  onAgentRemove?: (agentRef: string, pipelineRef: string) => void;
  onCapabilityRemove?: (capabilityId: string, pipelineRef: string, step: StepKind) => void;
  onDeclareWorkflow?: (objectRefs: string[]) => void;
}) {
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const byId = new Map(objects.map((object) => [object.id, object]));
  const toggleRef = (ref: string) => setSelectedRefs((current) => current.includes(ref) ? current.filter((entry) => entry !== ref) : [...current, ref]);
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, li, header")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const next = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    setOrigin(next); setSelection({ left: next.x, top: next.y, width: 0, height: 0 });
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!origin) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left; const y = event.clientY - bounds.top;
    setSelection({ left: Math.min(origin.x, x), top: Math.min(origin.y, y), width: Math.abs(x - origin.x), height: Math.abs(y - origin.y) });
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!origin || !selection) return;
    const canvas = event.currentTarget.getBoundingClientRect();
    if (selection.width > 12 || selection.height > 12) {
      const refs = [...event.currentTarget.querySelectorAll<HTMLElement>("li[data-object-ref]")].filter((node) => {
        const box = node.getBoundingClientRect();
        return box.right >= canvas.left + selection.left && box.left <= canvas.left + selection.left + selection.width && box.bottom >= canvas.top + selection.top && box.top <= canvas.top + selection.top + selection.height;
      }).map((node) => node.dataset.objectRef!).filter(Boolean);
      setSelectedRefs([...new Set(refs)]);
    }
    setOrigin(null); setSelection(null);
  };
  return <div className="venture-agent-workflows" aria-label="Agent GTM workflows" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("button, li, header")) onDeclareWorkflow?.([]); }}>
    {graph.pipelines.map((pipeline) => {
      const members = pipeline.nodeIds.map((id) => byId.get(id)).filter(Boolean) as WorkIndexOutlineObject[];
      const pipelineObject = members.find((object) => object.id === pipeline.id);
      const conditional = conditionalWorkflowGraph(pipelineObject);
      if (pipelineObject && conditional) return <VentureConditionalWorkflow key={pipeline.id} object={pipelineObject} graph={conditional} onSelect={onSelect} onChat={onChat} />;
      return <AgentWorkflow key={pipeline.id} pipeline={pipeline} members={members} context={graph.pipelines.length === 1 ? objects : members} selectedId={selectedId} selectedRefs={selectedRefs} onToggleRef={toggleRef} onSelect={onSelect} onChat={onChat} onAgentDrop={onAgentDrop} onCapabilityDrop={onCapabilityDrop} onAgentRemove={onAgentRemove} onCapabilityRemove={onCapabilityRemove} />;
    })}
    {selection ? <i className="workflow-selection-rect" style={{ left: selection.left, top: selection.top, width: selection.width, height: selection.height }} /> : null}
    {selectedRefs.length ? <div className="workflow-selection-action"><span>{selectedRefs.length} selected</span><button type="button" onClick={() => onDeclareWorkflow?.(selectedRefs)}>Make workflow</button><button type="button" onClick={() => setSelectedRefs([])}>Clear</button></div> : null}
  </div>;
}

function AgentWorkflow({ pipeline, members, context, selectedId, selectedRefs, onToggleRef, onSelect, onChat, onAgentDrop, onCapabilityDrop, onAgentRemove, onCapabilityRemove }: {
  pipeline: VenturePipeline; members: WorkIndexOutlineObject[]; context: WorkIndexOutlineObject[]; selectedId: string | null; selectedRefs: string[];
  onToggleRef: (ref: string) => void; onSelect: (id: string | null) => void; onChat?: (objectRef: string) => void;
  onAgentDrop?: (agentRef: string, pipelineRef: string) => void; onCapabilityDrop?: (capability: WorkflowCapability, pipelineRef: string, step: StepKind) => void;
  onAgentRemove?: (agentRef: string, pipelineRef: string) => void; onCapabilityRemove?: (capabilityId: string, pipelineRef: string, step: StepKind) => void;
}) {
  const pipelineObject = members.find((object) => object.id === pipeline.id);
  const signal = context.find((object) => ["signal", "telemetry", "observation"].includes(typeOf(object)));
  const campaign = members.find((object) => typeOf(object) === "campaign");
  const outcome = context.find((object) => ["outcome", "response", "return", "revenue"].includes(typeOf(object)));
  const agents = list(pipelineObject?.details?.agentRefs); const tools = list(pipelineObject?.details?.tools);
  const assigned = capabilityMap(pipelineObject?.details?.capabilityAssignments);
  const authority = String(pipelineObject?.details?.authority ?? "Founder approves outward action");
  const [expandedStep, setExpandedStep] = useState<string | null>(null); const activeStep = selectedId ? expandedStep : null;
  const [dropActive, setDropActive] = useState(false);
  const select = (id: string, step: string, multi: boolean) => { if (multi) { onToggleRef(`object:${id}`); return; } const closing = activeStep === step; setExpandedStep(closing ? null : step); onSelect(closing ? null : id); };
  const common = { pipelineRef: `object:${pipeline.id}`, selectedRefs, onToggleRef, onChat, onCapabilityDrop, onCapabilityRemove };
  const dropOnWorkflow = (event: DragEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("li")) return;
    const pipelineRef = `object:${pipeline.id}`;
    const agent = event.dataTransfer.getData("application/x-drover-agent");
    if (agent) { event.preventDefault(); onAgentDrop?.(agent, pipelineRef); setDropActive(false); return; }
    const raw = event.dataTransfer.getData("application/x-drover-capability");
    if (!raw) return;
    try { const capability = JSON.parse(raw) as WorkflowCapability; event.preventDefault(); onCapabilityDrop?.(capability, pipelineRef, capability.authority === "founder-gate" ? "gate" : "agent"); setDropActive(false); } catch { /* Ignore malformed drag data. */ }
  };
  return <section className="venture-agent-workflow" data-drop-active={dropActive ? "true" : undefined} aria-labelledby={`workflow-${pipeline.id}`} onDragEnter={(event) => { if (event.dataTransfer.types.some((type) => type.startsWith("application/x-drover-"))) setDropActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false); }} onDragOver={(event) => { if (!(event.target as HTMLElement).closest("li") && event.dataTransfer.types.some((type) => type.startsWith("application/x-drover-"))) event.preventDefault(); }} onDrop={dropOnWorkflow}>
    <header><div><span>Agent workflow</span><h2 id={`workflow-${pipeline.id}`}>{pipeline.name}</h2><p>{pipeline.value}</p></div><strong className="workflow-canvas-drop-hint">Drop to add to this workflow</strong></header>
    <ol>
      <WorkflowNode {...common} objectId={signal?.id ?? pipeline.id} icon={<Radio />} kind="trigger" label="Trigger" title={signal?.name ?? pipeline.trigger} detail={pipeline.trigger} expandedDetail={signal?.statement ?? "The exact signal that starts this path."} capabilities={assigned.trigger} selected={activeStep === "trigger"} onClick={(multi) => select(signal?.id ?? pipeline.id, "trigger", multi)} />
      <WorkflowNode {...common} objectId={pipeline.id} icon={<Bot />} kind="agent" label="Agent work" title={agents.length ? agents.join(" + ") : "Assign an agent"} detail={tools.length ? `${tools.length} connected ${tools.length === 1 ? "capability" : "capabilities"}` : "Drop agents and capabilities here"} expandedDetail={pipeline.value || "The agent advances this step using venture context."} agents={agents} capabilities={assigned.agent ?? tools} selected={activeStep === "agent"} onClick={(multi) => select(pipeline.id, "agent", multi)} onAgentDrop={onAgentDrop} onAgentRemove={onAgentRemove} />
      <WorkflowNode {...common} objectId={pipeline.id} icon={<ShieldCheck />} kind="gate" label="Founder gate" title="Approve outward action" detail={authority} expandedDetail="Only the founder can authorize an outward action." capabilities={assigned.gate} selected={activeStep === "gate"} onClick={(multi) => select(pipeline.id, "gate", multi)} />
      <WorkflowNode {...common} objectId={campaign?.id ?? pipeline.id} icon={<Send />} kind="action" label="Market action" title={campaign?.name ?? "Action unresolved"} detail={campaign?.statement ?? "Drop an outward capability or ask Drover"} expandedDetail={campaign?.statement ?? "The approved action moves into market."} capabilities={assigned.action} selected={activeStep === "action"} onClick={(multi) => select(campaign?.id ?? pipeline.id, "action", multi)} />
      <WorkflowNode {...common} objectId={outcome?.id ?? pipeline.id} icon={<Zap />} kind="evidence" label="Evidence return" title={outcome?.name ?? "Evidence unresolved"} detail={pipeline.repeatability} expandedDetail={outcome?.statement ?? "Observed evidence changes what agents do next."} capabilities={assigned.evidence} selected={activeStep === "evidence"} onClick={(multi) => select(outcome?.id ?? pipeline.id, "evidence", multi)} />
    </ol>
  </section>;
}

function WorkflowNode({ objectId, pipelineRef, icon, kind, label, title, detail, expandedDetail, agents = [], capabilities = [], selected, selectedRefs, onClick, onChat, onAgentDrop, onCapabilityDrop, onAgentRemove, onCapabilityRemove }: {
  objectId: string; pipelineRef: string; icon: ReactNode; kind: StepKind; label: string; title: string; detail: string; expandedDetail: string; agents?: string[]; capabilities?: string[]; selected: boolean; selectedRefs: string[];
  onToggleRef: (ref: string) => void; onClick: (multi: boolean) => void; onChat?: (ref: string) => void; onAgentDrop?: (agentRef: string, pipelineRef: string) => void; onCapabilityDrop?: (capability: WorkflowCapability, pipelineRef: string, step: StepKind) => void; onAgentRemove?: (agentRef: string, pipelineRef: string) => void; onCapabilityRemove?: (capabilityId: string, pipelineRef: string, step: StepKind) => void;
}) {
  const objectRef = `object:${objectId}`; const member = selectedRefs.includes(objectRef);
  const drop = (event: DragEvent<HTMLLIElement>) => {
    event.stopPropagation();
    const agent = event.dataTransfer.getData("application/x-drover-agent");
    if (agent && kind === "agent") { event.preventDefault(); onAgentDrop?.(agent, pipelineRef); return; }
    const raw = event.dataTransfer.getData("application/x-drover-capability"); if (!raw) return;
    try { const capability = JSON.parse(raw) as WorkflowCapability; if (capability.authority === "founder-gate" && !["gate", "action"].includes(kind)) return; event.preventDefault(); onCapabilityDrop?.(capability, pipelineRef, kind); } catch { /* Ignore malformed drag data. */ }
  };
  return <li data-kind={kind} data-selected={selected ? "true" : "false"} data-workflow-member={member ? "true" : "false"} data-object-ref={objectRef} onDragOver={(event) => { if (event.dataTransfer.types.some((type) => type.startsWith("application/x-drover-"))) event.preventDefault(); }} onDrop={drop}>
    <button type="button" aria-expanded={selected} onClick={(event) => onClick(event.shiftKey || event.metaKey)}><i aria-hidden="true">{icon}</i><span><small>{label}</small><strong>{title}</strong><em>{detail}</em>{capabilities.length ? <b>{capabilities.join(" · ")}</b> : null}</span></button>
    <div className="workflow-node-expanded" aria-hidden={!selected}>
      <p>{expandedDetail}</p>
      {agents.length || capabilities.length ? <ul className="workflow-node-assignments" aria-label={`${label} assignments`}>
        {agents.map((agent) => <li key={`agent:${agent}`}><span><small>Agent</small>{agent}</span><button type="button" tabIndex={selected ? 0 : -1} aria-label={`Remove agent ${agent}`} onClick={() => onAgentRemove?.(agent, pipelineRef)}>×</button></li>)}
        {capabilities.map((capability) => <li key={`capability:${capability}`}><span><small>Capability</small>{capability}</span><button type="button" tabIndex={selected ? 0 : -1} aria-label={`Remove capability ${capability}`} onClick={() => onCapabilityRemove?.(capability, pipelineRef, kind)}>×</button></li>)}
      </ul> : null}
      <button type="button" tabIndex={selected ? 0 : -1} onClick={() => onChat?.(objectRef)}>Work with agent</button>
    </div>
  </li>;
}
