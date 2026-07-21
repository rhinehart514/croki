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
  const pipeline = ["pipeline", "motion"].includes(object.type.toLowerCase());
  const campaign = object.type.toLowerCase() === "campaign";
  const value = (key: string) => typeof object.properties[key] === "string" ? object.properties[key] as string : Array.isArray(object.properties[key]) ? (object.properties[key] as unknown[]).join(", ") : "";
  const [trigger, setTrigger] = useState(value("trigger") || value("entry"));
  const [intendedOutcome, setIntendedOutcome] = useState(value("intendedOutcome") || value("value"));
  const [agents, setAgents] = useState(value("agentRefs"));
  const [tools, setTools] = useState(value("tools"));
  const [authority, setAuthority] = useState(value("authority"));
  const [evidence, setEvidence] = useState(value("evidenceToReturn"));
  const [audience, setAudience] = useState(value("audience"));
  const [objective, setObjective] = useState(value("objective"));
  const [offer, setOffer] = useState(value("offer"));
  const [window, setWindow] = useState(value("window"));
  const [stopConditions, setStopConditions] = useState(value("stopConditions"));
  const list = (input: string) => input.split(",").map((entry) => entry.trim()).filter(Boolean);
  const save = async () => {
    if (object.compatibilityOwned) await onArchitectureMutate([{ op: "update-element", elementId: object.id, value: { name, statement } }], `Update ${object.name} from Product / GTM`);
    else await onSystemMutate([{ op: "update-object", objectRef: object.objectRef, name, statement, territory,
      ...(pipeline ? { properties: { trigger, intendedOutcome, agentRefs: list(agents), tools: list(tools), authority, evidenceToReturn: evidence } } : {}),
      ...(campaign ? { properties: { audience, objective, offer, window, stopConditions } } : {}),
    }]);
    onClose();
  };
  return <div className="workspace-dialog-backdrop" role="presentation"><form className="workspace-dialog" onSubmit={(event) => { event.preventDefault(); void save(); }}><header><div><span>{pipeline ? "Refine GTM pipeline" : campaign ? "Refine campaign" : "Edit Product / GTM object"}</span><h2>{object.name}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header><label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Statement<textarea value={statement} onChange={(event) => setStatement(event.target.value)} /></label>{pipeline ? <><label>Trigger<textarea value={trigger} onChange={(event) => setTrigger(event.target.value)} /></label><label>Intended outcome<textarea value={intendedOutcome} onChange={(event) => setIntendedOutcome(event.target.value)} /></label><label>Agents<input value={agents} onChange={(event) => setAgents(event.target.value)} /></label><label>Data and tools<input value={tools} onChange={(event) => setTools(event.target.value)} /></label><label>Founder authority<textarea value={authority} onChange={(event) => setAuthority(event.target.value)} /></label><label>Evidence to return<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} /></label></> : null}{campaign ? <><label>Audience<input value={audience} onChange={(event) => setAudience(event.target.value)} /></label><label>Objective<textarea value={objective} onChange={(event) => setObjective(event.target.value)} /></label><label>Offer or Product release<input value={offer} onChange={(event) => setOffer(event.target.value)} /></label><label>Period or batch<input value={window} onChange={(event) => setWindow(event.target.value)} /></label><label>Stop or continue when<textarea value={stopConditions} onChange={(event) => setStopConditions(event.target.value)} /></label></> : null}<label>Territory<select value={territory} disabled={object.compatibilityOwned} onChange={(event) => setTerritory(event.target.value as "product" | "gtm")}><option value="product">Product</option><option value="gtm">GTM</option></select>{object.compatibilityOwned ? <small>Its territory comes from its architecture role and stays on that compatibility adapter.</small> : null}</label>{readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}<footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!name.trim() || Boolean(readOnlyReason)}>Save changes</button></footer></form></div>;
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
