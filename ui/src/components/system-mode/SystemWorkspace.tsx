import { useMemo, useState } from "react";
import type { SystemIndex, SystemIndexObject, SystemMutation, WorkIndexOutline } from "@/api";
import { VentureMaps } from "@/components/maps/VentureMaps";
import type { Direction } from "@/components/now/directionModel";
import type { FirmArchitectureOperation } from "@/types";
import type { Viewport } from "@xyflow/react";
import { SystemObjectEditor, SystemRelationshipEditor } from "./SystemEditPanel";

export function SystemWorkspace({ index, scope, selectedRef, directions, camera, readOnlyReason, onScope, onSelect, onCameraChange, onMutate, onMutateArchitecture, onOpenWork, onOpenChat }: {
  index: SystemIndex | null; scope: "system" | "product" | "gtm" | "attention"; selectedRef: string | null; directions: Direction[];
  camera: Viewport | null;
  readOnlyReason: string | null; onScope: (scope: "system" | "product" | "gtm" | "attention") => void; onSelect: (object: SystemIndexObject | null) => void;
  onCameraChange: (camera: Viewport) => void;
  onMutate: (mutations: SystemMutation[]) => Promise<void>; onMutateArchitecture: (operations: FirmArchitectureOperation[], reason: string) => Promise<void>;
  onOpenWork: (threadRef: string) => void; onOpenChat: (source: HTMLElement) => void;
}) {
  const [adding, setAdding] = useState<"object" | "connection" | null>(null);
  const [editingObject, setEditingObject] = useState(false); const [editingRelationship, setEditingRelationship] = useState<string | null>(null);
  const outline = useMemo<WorkIndexOutline | null>(() => index ? ({ architectureRevision: index.architectureRevision, objects: index.objects.map((object) => ({ ...object, sectionId: object.territory ?? "system", parentRef: null, details: object.properties, targetable: true })), relationships: index.relationships, unplacedThreadRefs: [] }) : null, [index]);
  const selectedId = selectedRef?.replace(/^(?:object|architecture):/, "") ?? null;
  const selected = index?.objects.find((object) => object.id === selectedId) ?? null;
  const selectedRelationships = selected ? (index?.relationships ?? []).filter((relationship) => relationship.fromRef.endsWith(`:${selected.id}`) || relationship.toRef.endsWith(`:${selected.id}`)) : [];
  const relationship = selectedRelationships.find((entry) => entry.id === editingRelationship) ?? null;
  return (
    <main className="mode-workspace system-workspace">
      <header className="mode-workspace-header"><div><span>Product / GTM</span><h1>{selected?.name ?? (scope === "system" ? "Whole system" : scope === "attention" ? "Needs attention" : scope === "gtm" ? "Go-to-market" : "Product")}</h1><p>{selected?.statement || "Shape the connected venture system directly, with cited truth and reversible inward edits."}</p></div><button type="button" onClick={(event) => onOpenChat(event.currentTarget)}>Open chat</button></header>
      {scope === "attention" ? (
        <section className="attention-list" aria-label="System attention">
          {(index?.objects ?? []).map((object) => <button key={object.id} type="button" onClick={() => onSelect(object)}><span>{object.name}</span><small>{object.attention[0]?.reason ?? "Needs founder judgment"}</small></button>)}
          {index && !index.objects.length ? <div className="mode-empty"><strong>No system gaps need attention</strong><p>Unresolved proposals, stale claims, traceability gaps, and disconnected objects will appear here.</p></div> : null}
        </section>
      ) : <VentureMaps outline={outline} directions={directions} view={scope} selectedId={selectedId} camera={camera} onCameraChange={onCameraChange} onViewChange={onScope} onSelectionChange={(id) => onSelect(index?.objects.find((object) => object.id === id) ?? null)} onOpenDirection={(direction) => onOpenWork(direction.id)} onOpenObject={(object) => onSelect(index?.objects.find((entry) => entry.id === object.id) ?? null)} />}
      <div className="workspace-fab"><button type="button" onClick={() => setAdding("object")}>Add to system</button></div>
      {adding ? <SystemEditor kind={adding} objects={index?.objects ?? []} readOnlyReason={readOnlyReason} onClose={() => setAdding(null)} onSwitchKind={setAdding} onSave={async (mutation) => { await onMutate([mutation]); setAdding(null); }} /> : null}
      {selected ? <div className="workspace-context-actions"><button type="button" onClick={() => setEditingObject(true)}>Edit object</button>{selectedRelationships.map((entry) => <button type="button" key={entry.id} onClick={() => setEditingRelationship(entry.id)}>Edit “{entry.label}”</button>)}{selected.threadRefs[0] ? <button type="button" onClick={() => onOpenWork(selected.threadRefs[0])}>Open linked work</button> : null}</div> : null}
      {editingObject && selected ? <SystemObjectEditor object={selected} readOnlyReason={readOnlyReason} onClose={() => setEditingObject(false)} onSystemMutate={onMutate} onArchitectureMutate={onMutateArchitecture} /> : null}
      {relationship ? <SystemRelationshipEditor relationship={relationship} readOnlyReason={readOnlyReason} onClose={() => setEditingRelationship(null)} onSystemMutate={onMutate} onArchitectureMutate={onMutateArchitecture} /> : null}
    </main>
  );
}

function SystemEditor({ kind, objects, readOnlyReason, onClose, onSwitchKind, onSave }: { kind: "object" | "connection"; objects: SystemIndexObject[]; readOnlyReason: string | null; onClose: () => void; onSwitchKind: (kind: "object" | "connection") => void; onSave: (mutation: SystemMutation) => Promise<void> }) {
  const [name, setName] = useState(""); const [statement, setStatement] = useState(""); const [territory, setTerritory] = useState<"product" | "gtm">("product");
  const [fromRef, setFromRef] = useState(objects[0]?.objectRef ?? ""); const [toRef, setToRef] = useState(objects[1]?.objectRef ?? ""); const [label, setLabel] = useState("");
  return <div className="workspace-dialog-backdrop" role="presentation"><form className="workspace-dialog" onSubmit={(event) => { event.preventDefault(); void onSave(kind === "object" ? { op: "create-object", name, statement, territory } : { op: "create-relationship", fromRef, toRef, label }); }}><header><div><span>Add to system</span><h2>{kind === "object" ? "New object" : "New connection"}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header><div className="workspace-dialog-tabs"><button type="button" aria-pressed={kind === "object"} onClick={() => onSwitchKind("object")}>Object</button><button type="button" aria-pressed={kind === "connection"} onClick={() => onSwitchKind("connection")}>Connection</button></div>{kind === "object" ? <><label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Statement<textarea value={statement} onChange={(event) => setStatement(event.target.value)} /></label><label>Territory<select value={territory} onChange={(event) => setTerritory(event.target.value as "product" | "gtm")}><option value="product">Product</option><option value="gtm">GTM</option></select></label></> : <><label>Source<select value={fromRef} onChange={(event) => setFromRef(event.target.value)}>{objects.map((object) => <option key={object.id} value={object.objectRef}>{object.name}</option>)}</select></label><label>Target<select value={toRef} onChange={(event) => setToRef(event.target.value)}>{objects.map((object) => <option key={object.id} value={object.objectRef}>{object.name}</option>)}</select></label><label>Relationship<input required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="makes possible" /></label></>} {readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}<footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={Boolean(readOnlyReason)}>Save</button></footer></form></div>;
}
