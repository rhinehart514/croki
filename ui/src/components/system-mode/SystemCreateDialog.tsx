import { useState } from "react";
import type { SystemIndexObject, SystemMutation } from "@/api";

export function SystemCreateDialog({ kind, objects, readOnlyReason, onClose, onSwitchKind, onSave }: {
  kind: "object" | "connection";
  objects: SystemIndexObject[];
  readOnlyReason: string | null;
  onClose: () => void;
  onSwitchKind: (kind: "object" | "connection") => void;
  onSave: (mutation: SystemMutation) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [statement, setStatement] = useState("");
  const [territory, setTerritory] = useState<"product" | "gtm">("product");
  const [fromRef, setFromRef] = useState(objects[0]?.objectRef ?? "");
  const [toRef, setToRef] = useState(objects[1]?.objectRef ?? objects[0]?.objectRef ?? "");
  const [label, setLabel] = useState("");
  const connectionUnavailable = kind === "connection" && objects.length < 2;

  return (
    <div className="workspace-dialog-backdrop" role="presentation">
      <form className="workspace-dialog" onSubmit={(event) => {
        event.preventDefault();
        void onSave(kind === "object"
          ? { op: "create-object", name, statement, territory }
          : { op: "create-relationship", fromRef, toRef, label });
      }}>
        <header><div><span>Add to Product / GTM</span><h2>{kind === "object" ? "New object" : "New connection"}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
        <div className="workspace-dialog-tabs">
          <button type="button" aria-pressed={kind === "object"} onClick={() => onSwitchKind("object")}>Object</button>
          <button type="button" aria-pressed={kind === "connection"} onClick={() => onSwitchKind("connection")}>Connection</button>
        </div>
        {kind === "object" ? <>
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
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={Boolean(readOnlyReason) || connectionUnavailable}>Save</button></footer>
      </form>
    </div>
  );
}
