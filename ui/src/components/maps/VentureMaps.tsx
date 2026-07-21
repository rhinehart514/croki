import { useMemo, useState, type ReactNode } from "react";
import type { WorkIndexOutline, WorkIndexOutlineObject } from "@/api";
import type { Viewport } from "@xyflow/react";
import type { Direction } from "@/components/now/directionModel";
import type { SystemAgentContext, SystemWorkState } from "@/components/system-mode/systemWorkState";
import type { WorkflowCapability } from "@/components/workspace/workflowCapabilities";
import { objectMapFacts, objectMapTypeLabel, ventureGraph, type VentureMapView } from "./ventureMapModel";
import { VentureSystemGraph } from "./VentureSystemGraph";
import "./venture-maps.css";

const VIEW_LABEL: Record<VentureMapView, string> = {
  system: "Whole venture",
  product: "Product",
  gtm: "Go-to-market",
};

export function VentureMaps({
  outline,
  directions,
  onOpenDirection,
  onOpenObject,
  view: controlledView,
  selectedId: controlledSelectedId,
  onViewChange,
  onSelectionChange,
  camera,
  onCameraChange,
  workByObject,
  inspectorActions,
  onEmptyAction,
  onAgentDrop,
  onCapabilityDrop,
  onAgentRemove,
  onCapabilityRemove,
  onDeclareWorkflow,
  onChatObject,
  positions,
  onNodeMove,
  showHeader = true,
}: {
  outline: WorkIndexOutline | null | undefined;
  directions: Direction[];
  onOpenDirection: (direction: Direction) => void;
  onOpenObject: (object: WorkIndexOutlineObject) => void;
  view?: VentureMapView;
  selectedId?: string | null;
  onViewChange?: (view: VentureMapView) => void;
  onSelectionChange?: (id: string | null) => void;
  camera?: Viewport | null;
  onCameraChange?: (camera: Viewport) => void;
  workByObject?: ReadonlyMap<string, SystemAgentContext>;
  inspectorActions?: ReactNode;
  onEmptyAction?: () => void;
  onAgentDrop?: (agentRef: string, pipelineRef: string) => void;
  onCapabilityDrop?: (capability: WorkflowCapability, pipelineRef: string, step: "trigger" | "agent" | "gate" | "action" | "evidence") => void;
  onAgentRemove?: (agentRef: string, pipelineRef: string) => void;
  onCapabilityRemove?: (capabilityId: string, pipelineRef: string, step: "trigger" | "agent" | "gate" | "action" | "evidence") => void;
  onDeclareWorkflow?: (objectRefs: string[]) => void;
  onChatObject?: (objectRef: string) => void;
  positions?: Record<string, { x: number; y: number }>;
  onNodeMove?: (objectRef: string, position: { x: number; y: number }) => void;
  showHeader?: boolean;
}) {
  const [localView, setLocalView] = useState<VentureMapView>("system");
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const view = controlledView ?? localView;
  const selectedId = controlledSelectedId === undefined ? localSelectedId : controlledSelectedId;
  const setView = (next: VentureMapView) => { setLocalView(next); onViewChange?.(next); };
  const setSelectedId = (next: string | null) => { setLocalSelectedId(next); onSelectionChange?.(next); };
  const directionByRef = useMemo(() => new Map(directions.map((direction) => [direction.id, direction])), [directions]);
  const graph = useMemo(() => ventureGraph(outline, view), [outline, view]);
  const outlineObjects = outline?.objects ?? [];
  const visibleSelectedId = selectedId && graph.nodes.some((node) => node.object.id === selectedId) ? selectedId : null;
  const selected = visibleSelectedId ? outlineObjects.find((object) => object.id === visibleSelectedId) ?? null : null;
  const returned = selected?.type.toLowerCase() === "return";
  const facts = selected ? objectMapFacts(selected) : [];
  const connections = selected ? graph.links.filter((link) => link.source === selected.id || link.target === selected.id) : [];
  const agentContext = selected ? workByObject?.get(selected.id) ?? null : null;

  const open = (object: WorkIndexOutlineObject) => {
    const direction = object.threadRefs.map((ref) => directionByRef.get(ref)).find(Boolean);
    if (direction) onOpenDirection(direction);
    else onOpenObject(object);
  };

  return (
    <section className="venture-maps" aria-label="Venture Product and go-to-market map" data-view={view} data-header={showHeader ? "true" : "false"}>
      {showHeader ? <header className="venture-maps-head">
        <div>
          <span>Generated from venture truth</span>
          <h1>{VIEW_LABEL[view]}</h1>
          <p>{view === "system" ? "Product truth and GTM execution in one evidence loop" : view === "gtm" ? "Signals → pipelines → campaigns → outcomes" : "How the product creates and delivers value"}</p>
        </div>
        <div className="venture-map-tabs" role="tablist" aria-label="Map view">
          {(Object.keys(VIEW_LABEL) as VentureMapView[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => {
                setView(id);
                setSelectedId(null);
              }}
            >
              {VIEW_LABEL[id]}
            </button>
          ))}
        </div>
      </header> : null}

      {!outline || graph.nodes.length === 0 ? (
        <div className="venture-map-empty-canvas" role="region" aria-label="Empty Product and go-to-market canvas">
          <header><div><strong>Describe the mechanism you want to create</strong><p>Drover will open a Work thread and sketch the conditional graph before anything becomes Product / GTM truth.</p></div><div>{onEmptyAction ? <button type="button" onClick={onEmptyAction}>Describe workflow</button> : null}{onDeclareWorkflow ? <button type="button" className="is-secondary" onClick={() => onDeclareWorkflow([])}>Create on canvas</button> : null}</div></header>
          <ol aria-label="Product and go-to-market visual structure">
            {[['Signal', 'A market fact or opportunity enters'], ['Pipeline', 'Agents and tools repeatedly advance it'], ['Campaign', 'A bounded execution goes to market'], ['Outcome', 'Evidence returns and changes the system']].map(([title, detail], index) => <li key={title}><span>{index + 1}</span><div><small>Open</small><strong>{title}</strong><p>{detail}</p></div>{index < 3 ? <i aria-hidden="true">→</i> : null}</li>)}
          </ol>
        </div>
      ) : (
        <><VentureSystemGraph
            outline={outline}
            view={view}
            selectedId={visibleSelectedId}
            onSelect={setSelectedId}
            camera={camera}
            onCameraChange={onCameraChange}
            workByObject={workByObject}
            positions={positions}
            onNodeMove={onNodeMove}
          />{view === "gtm" && onDeclareWorkflow ? <button type="button" className="venture-map-create-workflow" onClick={() => onDeclareWorkflow([])}>Create workflow</button> : null}</>
      )}

      {selected ? (
        <aside className="venture-map-inspector" aria-label={`${selected.name} route`} data-kind={returned ? "return" : undefined}>
          <header>
            <span>{objectMapTypeLabel(selected)}</span>
            <button type="button" aria-label="Close route" onClick={() => setSelectedId(null)}>×</button>
          </header>
          <h2>{selected.name}</h2>
          {!returned && agentContext ? <AgentContext context={agentContext} objectName={selected.name} /> : null}
          {!returned && facts.length ? (
            <dl>
              {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
            </dl>
          ) : !returned && selected.statement ? <p>{selected.statement}</p> : null}
          {!returned ? <section>
            <h3>{connections.length ? `Connected to ${connections.length}` : "Missing connection"}</h3>
            {connections.length ? (
              <ul>
                {connections.map((link) => {
                  const otherId = link.source === selected.id ? link.target : link.source;
                  const other = outlineObjects.find((object) => object.id === otherId);
                  return <li key={link.id}><span>{link.label}</span><strong>{other?.name ?? otherId}</strong></li>;
                })}
              </ul>
            ) : <p>This node is visible, but it is not part of an operating path yet.</p>}
          </section> : null}
          {inspectorActions ?? <button type="button" className="venture-map-open" onClick={() => open(selected)}>{selected.threadRefs.length ? "Open work" : "Open context"}</button>}
        </aside>
      ) : (
        <div className="venture-map-hint">Select a signal, pipeline, campaign, or outcome to inspect its exact context and work.</div>
      )}
    </section>
  );
}

const STATE_LABEL: Record<SystemWorkState, string> = {
  working: "Agent working",
  "needs-review": "Needs your review",
  failed: "Work failed",
  completed: "Work completed",
};

function AgentContext({ context, objectName }: { context: SystemAgentContext; objectName: string }) {
  return <div className="venture-map-agent" data-state={context.state ?? "ready"} aria-live="polite">
    <span><i />Agent context</span>
    <strong>{context.state ? STATE_LABEL[context.state] : context.threadRef ? "Linked work is ready" : `Ready to work on ${objectName}`}</strong>
    <p>{context.thread?.founderIntent ?? (context.threadRef ? "Open the linked thread to continue with this node in context." : `Your next message can begin work with ${objectName} as its exact subject.`)}</p>
  </div>;
}
