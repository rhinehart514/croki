import { useState } from "react";
import type { ReleaseDetail, ReleaseMutation, SystemIndexObject, WorkIndexItem } from "@/api";
import { RELEASE_PATH_META, type ReleasePathKey } from "./releaseRecords";

const ROLES: Record<Exclude<ReleasePathKey, "action" | "evidence">, string[]> = {
  product: ["Product delta", "Capability", "Workflow"],
  customer: ["Customer consequence"],
  distribution: ["Distribution", "Audience", "Supported claim or offer"],
};

export function ReleaseBuild({ release, step, objects, threads, readOnlyReason, onMutate, onClose }: {
  release: ReleaseDetail;
  step: Exclude<ReleasePathKey, "evidence">;
  objects: SystemIndexObject[];
  threads: WorkIndexItem[];
  readOnlyReason: string | null;
  onMutate: (mutations: ReleaseMutation[]) => Promise<void>;
  onClose: () => void;
}) {
  const availableObjects = objects.filter((object) => object.type !== "release" && object.id !== release.id && !release.relatedObjectRefs.includes(object.objectRef));
  const availableThreads = threads.filter((thread) => !release.threadRefs.includes(thread.threadRef));
  const [objectRef, setObjectRef] = useState(availableObjects[0]?.objectRef ?? "");
  const [threadRef, setThreadRef] = useState(availableThreads[0]?.threadRef ?? "");
  const roles = step === "action" ? [] : ROLES[step];
  const [role, setRole] = useState(roles[0] ?? "Product delta");
  const effectiveObjectRef = availableObjects.some((object) => object.objectRef === objectRef) ? objectRef : availableObjects[0]?.objectRef ?? "";
  const effectiveThreadRef = availableThreads.some((thread) => thread.threadRef === threadRef) ? threadRef : availableThreads[0]?.threadRef ?? "";
  const heading = step === "action" ? "Join exact work" : `Link ${RELEASE_PATH_META[step].title.toLowerCase()}`;

  return <section className="release-link-editor" aria-label={heading}>
    <header><div><span>Complete this connection</span><h2>{heading}</h2></div><button type="button" onClick={onClose}>Close</button></header>
    {readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}
    {step === "action" ? <form onSubmit={(event) => {
      event.preventDefault();
      if (!effectiveThreadRef) return;
      void onMutate([{ op: "link-thread", threadRef: effectiveThreadRef }]).then(onClose);
    }}>
      <label>Thread<select value={effectiveThreadRef} onChange={(event) => setThreadRef(event.target.value)}><option value="">Choose a thread</option>{availableThreads.map((thread) => <option key={thread.threadRef} value={thread.threadRef}>{thread.founderIntent}</option>)}</select></label>
      <button type="submit" disabled={!effectiveThreadRef || Boolean(readOnlyReason)}>Join work</button>
    </form> : <form onSubmit={(event) => {
      event.preventDefault();
      if (!effectiveObjectRef) return;
      void onMutate([{ op: "link-object", objectRef: effectiveObjectRef, label: role }]).then(onClose);
    }}>
      {roles.length > 1 ? <label>Relationship<select value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((entry) => <option key={entry}>{entry}</option>)}</select></label> : null}
      <label>Venture object<select value={effectiveObjectRef} onChange={(event) => setObjectRef(event.target.value)}><option value="">Choose an object</option>{availableObjects.map((object) => <option key={object.objectRef} value={object.objectRef}>{object.name}</option>)}</select></label>
      <button type="submit" disabled={!effectiveObjectRef || Boolean(readOnlyReason)}>Add link</button>
    </form>}
  </section>;
}
