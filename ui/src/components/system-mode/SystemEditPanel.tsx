import { useState } from "react";
import type { SystemIndexObject, SystemIndexRelationship, SystemMutation } from "@/api";
import type { FirmArchitectureOperation } from "@/types";

export function SystemObjectEditor({ object, readOnlyReason, onClose, onSystemMutate, onArchitectureMutate }: {
  object: SystemIndexObject; readOnlyReason: string | null; onClose: () => void;
  onSystemMutate: (mutations: SystemMutation[]) => Promise<void>;
  onArchitectureMutate: (operations: FirmArchitectureOperation[], reason: string) => Promise<void>;
}) {
  const [name, setName] = useState(object.name); const [statement, setStatement] = useState(object.statement);
  const [territory, setTerritory] = useState<"product" | "gtm">(object.territory ?? "product");
  const save = async () => {
    if (object.compatibilityOwned) await onArchitectureMutate([{ op: "update-element", elementId: object.id, value: { name, statement } }], `Update ${object.name} from Product / GTM`);
    else await onSystemMutate([{ op: "update-object", objectRef: object.objectRef, name, statement, territory }]);
    onClose();
  };
  return <div className="workspace-dialog-backdrop" role="presentation"><form className="workspace-dialog" onSubmit={(event) => { event.preventDefault(); void save(); }}><header><div><span>Edit system object</span><h2>{object.name}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header><label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Statement<textarea value={statement} onChange={(event) => setStatement(event.target.value)} /></label><label>Territory<select value={territory} disabled={object.compatibilityOwned} onChange={(event) => setTerritory(event.target.value as "product" | "gtm")}><option value="product">Product</option><option value="gtm">GTM</option></select>{object.compatibilityOwned ? <small>Its territory comes from its architecture role and stays on that compatibility adapter.</small> : null}</label>{readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}<footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!name.trim() || Boolean(readOnlyReason)}>Save changes</button></footer></form></div>;
}

export function SystemRelationshipEditor({ relationship, readOnlyReason, onClose, onSystemMutate, onArchitectureMutate }: {
  relationship: SystemIndexRelationship; readOnlyReason: string | null; onClose: () => void;
  onSystemMutate: (mutations: SystemMutation[]) => Promise<void>;
  onArchitectureMutate: (operations: FirmArchitectureOperation[], reason: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(relationship.label);
  const update = async () => {
    if (relationship.compatibilityOwned) await onArchitectureMutate([{ op: "update-connection", connectionId: relationship.id, value: { label } }], "Update a Product / GTM connection");
    else await onSystemMutate([{ op: "update-relationship", relationshipRef: relationship.relationshipRef, label }]);
    onClose();
  };
  const remove = async () => {
    if (relationship.compatibilityOwned) await onArchitectureMutate([{ op: "remove-connection", connectionId: relationship.id }], "Remove a Product / GTM connection");
    else await onSystemMutate([{ op: "remove-relationship", relationshipRef: relationship.relationshipRef }]);
    onClose();
  };
  return <div className="workspace-dialog-backdrop" role="presentation"><form className="workspace-dialog" onSubmit={(event) => { event.preventDefault(); void update(); }}><header><div><span>Edit connection</span><h2>{relationship.label}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header><label>Relationship<input required value={label} onChange={(event) => setLabel(event.target.value)} /></label>{readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}<footer><button type="button" disabled={Boolean(readOnlyReason)} onClick={() => void remove()}>Remove connection</button><button type="submit" disabled={!label.trim() || Boolean(readOnlyReason)}>Save label</button></footer></form></div>;
}
