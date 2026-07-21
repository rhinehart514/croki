import { useState } from "react";
import type { SystemIndexObject, SystemMutation } from "@/api";

export function SystemCreateDialog({ kind, objects, readOnlyReason, onClose, onSwitchKind, onSave }: {
  kind: "pipeline" | "campaign" | "object" | "connection";
  objects: SystemIndexObject[];
  readOnlyReason: string | null;
  onClose: () => void;
  onSwitchKind: (kind: "pipeline" | "campaign" | "object" | "connection") => void;
  onSave: (mutation: SystemMutation) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [statement, setStatement] = useState("");
  const [territory, setTerritory] = useState<"product" | "gtm">("product");
  const [fromRef, setFromRef] = useState(objects[0]?.objectRef ?? "");
  const [toRef, setToRef] = useState(objects[1]?.objectRef ?? objects[0]?.objectRef ?? "");
  const [label, setLabel] = useState("");
  const [trigger, setTrigger] = useState("");
  const [intendedOutcome, setIntendedOutcome] = useState("");
  const [agents, setAgents] = useState("");
  const [tools, setTools] = useState("");
  const [authority, setAuthority] = useState("");
  const [evidence, setEvidence] = useState("");
  const [audience, setAudience] = useState("");
  const [objective, setObjective] = useState("");
  const [offer, setOffer] = useState("");
  const [window, setWindow] = useState("");
  const [stopConditions, setStopConditions] = useState("");
  const connectionUnavailable = kind === "connection" && objects.length < 2;
  const list = (value: string) => value.split(",").map((entry) => entry.trim()).filter(Boolean);
  const mutation = (): SystemMutation => {
    if (kind === "pipeline") return { op: "create-object", type: "pipeline", territory: "gtm", name, statement: statement || intendedOutcome, properties: { trigger, intendedOutcome, agentRefs: list(agents), tools: list(tools), authority, evidenceToReturn: evidence } };
    if (kind === "campaign") return { op: "create-object", type: "campaign", territory: "gtm", name, statement: statement || objective, properties: { audience, objective, offer, window, stopConditions } };
    if (kind === "object") return { op: "create-object", name, statement, territory };
    return { op: "create-relationship", fromRef, toRef, label };
  };

  return (
    <div className="workspace-dialog-backdrop" role="presentation">
      <form className="workspace-dialog" onSubmit={(event) => {
        event.preventDefault();
        void onSave(mutation());
      }}>
        <header><div><span>Add to Product / GTM</span><h2>{kind === "pipeline" ? "New GTM pipeline" : kind === "campaign" ? "New campaign" : kind === "object" ? "New product or market truth" : "New connection"}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <div className="workspace-dialog-tabs">
          <button type="button" aria-pressed={kind === "pipeline"} onClick={() => onSwitchKind("pipeline")}>Pipeline</button>
          <button type="button" aria-pressed={kind === "campaign"} onClick={() => onSwitchKind("campaign")}>Campaign</button>
          <button type="button" aria-pressed={kind === "object"} onClick={() => onSwitchKind("object")}>Product / market</button>
          <button type="button" aria-pressed={kind === "connection"} onClick={() => onSwitchKind("connection")}>Connection</button>
        </div>
        {kind === "pipeline" ? <>
          <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Inbound founder leads" /></label>
          <label>Trigger<textarea required value={trigger} onChange={(event) => setTrigger(event.target.value)} placeholder="What causes this pipeline to begin?" /></label>
          <label>Intended outcome<textarea required value={intendedOutcome} onChange={(event) => setIntendedOutcome(event.target.value)} placeholder="What should be true when it works?" /></label>
          <label>Agents<input value={agents} onChange={(event) => setAgents(event.target.value)} placeholder="Agent refs, separated by commas" /></label>
          <label>Data and tools<input value={tools} onChange={(event) => setTools(event.target.value)} placeholder="Gmail, browser, CRM" /></label>
          <label>Founder authority<textarea value={authority} onChange={(event) => setAuthority(event.target.value)} placeholder="What must wait for the founder?" /></label>
          <label>Evidence to return<textarea required value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="What result, including silence, comes back?" /></label>
        </> : kind === "campaign" ? <>
          <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="July founder outreach" /></label>
          <label>Audience<input required value={audience} onChange={(event) => setAudience(event.target.value)} /></label>
          <label>Objective<textarea required value={objective} onChange={(event) => setObjective(event.target.value)} /></label>
          <label>Offer or Product release<input value={offer} onChange={(event) => setOffer(event.target.value)} /></label>
          <label>Period or batch<input value={window} onChange={(event) => setWindow(event.target.value)} placeholder="20 founders or July 20–27" /></label>
          <label>Stop or continue when<textarea required value={stopConditions} onChange={(event) => setStopConditions(event.target.value)} /></label>
        </> : kind === "object" ? <>
          <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Statement<textarea value={statement} onChange={(event) => setStatement(event.target.value)} /></label>
          <label>Territory<select value={territory} onChange={(event) => setTerritory(event.target.value as "product" | "gtm")}><option value="product">Product</option><option value="gtm">GTM</option></select></label>
        </> : <>
          <label>Source<select value={fromRef} onChange={(event) => setFromRef(event.target.value)}>{objects.map((object) => <option key={object.id} value={object.objectRef}>{object.name}</option>)}</select></label>
          <label>Target<select value={toRef} onChange={(event) => setToRef(event.target.value)}>{objects.map((object) => <option key={object.id} value={object.objectRef}>{object.name}</option>)}</select></label>
          <label>Relationship<input required value={label} onChange={(event) => setLabel(event.target.value)} placeholder="makes possible" /></label>
          {connectionUnavailable ? <p role="status">Add at least two objects before connecting them.</p> : null}
        </>}
        {readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={Boolean(readOnlyReason) || connectionUnavailable}>Create</button></footer>
      </form>
    </div>
  );
}
