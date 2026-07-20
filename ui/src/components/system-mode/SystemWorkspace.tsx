import { useMemo, useState } from "react";
import type { SystemIndex, SystemIndexObject, SystemMutation, WorkIndex, WorkIndexOutline } from "@/api";
import { VentureMaps } from "@/components/maps/VentureMaps";
import type { Direction } from "@/components/now/directionModel";
import type { FirmArchitectureOperation } from "@/types";
import type { Viewport } from "@xyflow/react";
import { SystemCreateDialog } from "./SystemCreateDialog";
import { SystemObjectEditor, SystemRelationshipEditor } from "./SystemEditPanel";
import { systemAgentContext, systemWorkByObject, type SystemAgentContext } from "./systemWorkState";
import "./system-workspace.css";

export type SystemScope = "system" | "product" | "gtm" | "attention";

const SCOPE_TITLE: Record<SystemScope, string> = {
  system: "Whole venture",
  product: "Product",
  gtm: "Go-to-market",
  attention: "Needs attention",
};

export type SystemWorkspaceProps = {
  index: SystemIndex | null;
  workIndex?: WorkIndex | null;
  scope: SystemScope;
  selectedRef: string | null;
  directions: Direction[];
  camera: Viewport | null;
  readOnlyReason: string | null;
  onScope: (scope: SystemScope) => void;
  onSelect: (object: SystemIndexObject | null, linkedThreadRef?: string | null) => void;
  onAgentContextChange?: (context: SystemAgentContext | null) => void;
  onCameraChange: (camera: Viewport) => void;
  onMutate: (mutations: SystemMutation[]) => Promise<void>;
  onMutateArchitecture: (operations: FirmArchitectureOperation[], reason: string) => Promise<void>;
  onOpenWork: (threadRef: string) => void;
};

export function SystemWorkspace({ index, workIndex, scope, selectedRef, directions, camera, readOnlyReason, onScope, onSelect, onAgentContextChange, onCameraChange, onMutate, onMutateArchitecture, onOpenWork }: SystemWorkspaceProps) {
  const [adding, setAdding] = useState<"object" | "connection" | null>(null);
  const [editingObject, setEditingObject] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<string | null>(null);
  const outline = useMemo<WorkIndexOutline | null>(() => index ? ({
    architectureRevision: index.architectureRevision,
    objects: index.objects.map((object) => ({ ...object, sectionId: object.territory ?? "system", parentRef: null, details: object.properties, targetable: true })),
    relationships: index.relationships,
    unplacedThreadRefs: [],
  }) : null, [index]);
  const workByObject = useMemo(() => systemWorkByObject(index?.objects ?? [], workIndex), [index?.objects, workIndex]);
  const selectedId = selectedRef?.replace(/^(?:object|architecture):/, "") ?? null;
  const selected = index?.objects.find((object) => object.id === selectedId) ?? null;
  const selectedContext = useMemo(() => selected ? systemAgentContext(selected, workIndex) : null, [selected, workIndex]);
  const selectedRelationships = selected ? (index?.relationships ?? []).filter((entry) => entry.fromRef.endsWith(`:${selected.id}`) || entry.toRef.endsWith(`:${selected.id}`)) : [];
  const relationship = selectedRelationships.find((entry) => entry.id === editingRelationship) ?? null;

  const selectObject = (object: SystemIndexObject | null) => {
    const context = object ? systemAgentContext(object, workIndex) : null;
    onSelect(object, context?.threadRef);
    onAgentContextChange?.(context);
    if (!object) setEditingObject(false);
  };

  const inspectorActions = selected ? <div className="system-inspector-actions">
    <button type="button" onClick={() => setEditingObject(true)}>Edit object</button>
    {selectedContext?.threadRef ? <button type="button" onClick={() => onOpenWork(selectedContext.threadRef!)}>Open thread</button> : null}
    {selectedRelationships.map((entry) => <button type="button" key={entry.id} onClick={() => setEditingRelationship(entry.id)}>Edit “{entry.label}”</button>)}
  </div> : null;

  return (
    <main className="mode-workspace system-workspace">
      <header className="system-workspace-header">
        <div className="system-workspace-title"><span>Product / GTM</span><h1>{SCOPE_TITLE[scope]}</h1><small>{index ? `${index.counts.total} objects` : "Loading"}</small></div>
        <button className="system-add-button" type="button" disabled={Boolean(readOnlyReason)} onClick={() => setAdding("object")}>Add to Product / GTM</button>
      </header>
      {readOnlyReason ? <p className="mode-connection-state" role="status">{readOnlyReason}</p> : null}

      {scope === "attention" ? (
        <SystemAttention index={index} workByObject={workByObject} onSelect={selectObject} />
      ) : (
        <VentureMaps
          outline={outline}
          directions={directions}
          view={scope}
          selectedId={selectedId}
          camera={camera}
          workByObject={workByObject}
          inspectorActions={inspectorActions}
          showHeader={false}
          onCameraChange={onCameraChange}
          onViewChange={onScope}
          onSelectionChange={(id) => selectObject(index?.objects.find((object) => object.id === id) ?? null)}
          onOpenDirection={(direction) => onOpenWork(direction.id)}
          onOpenObject={(object) => selectObject(index?.objects.find((entry) => entry.id === object.id) ?? null)}
        />
      )}

      {adding ? <SystemCreateDialog kind={adding} objects={index?.objects ?? []} readOnlyReason={readOnlyReason} onClose={() => setAdding(null)} onSwitchKind={setAdding} onSave={async (mutation) => { await onMutate([mutation]); setAdding(null); }} /> : null}
      {editingObject && selected ? <SystemObjectEditor object={selected} readOnlyReason={readOnlyReason} onClose={() => setEditingObject(false)} onSystemMutate={onMutate} onArchitectureMutate={onMutateArchitecture} /> : null}
      {relationship ? <SystemRelationshipEditor relationship={relationship} readOnlyReason={readOnlyReason} onClose={() => setEditingRelationship(null)} onSystemMutate={onMutate} onArchitectureMutate={onMutateArchitecture} /> : null}
    </main>
  );
}

function SystemAttention({ index, workByObject, onSelect }: { index: SystemIndex | null; workByObject: Map<string, SystemAgentContext>; onSelect: (object: SystemIndexObject) => void }) {
  if (!index) return <div className="system-state" role="status"><strong>Loading Product / GTM…</strong><p>Product and market truth will appear here when the current revision arrives.</p></div>;
  const objects = index.objects.filter((object) => object.attention.length > 0);
  if (!objects.length) return <div className="system-state"><strong>No Product / GTM gaps need attention</strong><p>Unresolved proposals, stale claims, traceability gaps, and disconnected objects will appear here.</p></div>;
  return <section className="system-attention" aria-label="Product and go-to-market attention">{objects.map((object) => {
    const context = workByObject.get(object.id);
    return <button key={object.id} type="button" onClick={() => onSelect(object)}><span><strong>{object.name}</strong><small>{object.attention[0]?.reason ?? "Needs founder judgment"}</small></span>{context?.state ? <i data-state={context.state}>{stateLabel(context.state)}</i> : null}</button>;
  })}</section>;
}

function stateLabel(state: NonNullable<SystemAgentContext["state"]>) {
  return state === "needs-review" ? "Needs review" : state[0].toUpperCase() + state.slice(1);
}
