import { useMemo, useState } from "react";
import type { ReleaseDetail, ReleaseMutation, SystemIndexObject, WorkIndexItem } from "@/api";

const LINK_ROLES = [
  "Product delta",
  "Customer consequence",
  "Supported claim or offer",
  "Audience",
  "Distribution",
  "Measurement",
  "Evidence",
] as const;

export function ReleaseBuild({ release, objects, threads, readOnlyReason, onMutate }: {
  release: ReleaseDetail; objects: SystemIndexObject[]; threads: WorkIndexItem[]; readOnlyReason: string | null;
  onMutate: (mutations: ReleaseMutation[]) => Promise<void>;
}) {
  const availableObjects = useMemo(() => objects.filter((object) => object.type !== "release" && object.id !== release.id && !release.relatedObjectRefs.includes(object.objectRef)), [objects, release.id, release.relatedObjectRefs]);
  const availableThreads = useMemo(() => threads.filter((thread) => !release.threadRefs.includes(thread.threadRef)), [release.threadRefs, threads]);
  const [objectRef, setObjectRef] = useState(availableObjects[0]?.objectRef ?? "");
  const [role, setRole] = useState<(typeof LINK_ROLES)[number]>("Product delta");
  const [threadRef, setThreadRef] = useState(availableThreads[0]?.threadRef ?? "");
  const effectiveObjectRef = availableObjects.some((object) => object.objectRef === objectRef) ? objectRef : availableObjects[0]?.objectRef ?? "";
  const effectiveThreadRef = availableThreads.some((thread) => thread.threadRef === threadRef) ? threadRef : availableThreads[0]?.threadRef ?? "";
  const objectName = (ref: string) => objects.find((object) => object.objectRef === ref)?.name ?? ref;
  const threadName = (ref: string) => threads.find((thread) => thread.threadRef === ref)?.founderIntent ?? ref;
  return <section className="release-build">
    <header><h2>Composable release links</h2><p>These links make the movement concrete without turning release work into a required form.</p></header>
    {readOnlyReason ? <p role="status">{readOnlyReason}</p> : null}
    <div className="release-link-list">
      {release.relationships.map((relationship) => {
        const otherRef = relationship.fromRef === release.releaseRef ? relationship.toRef : relationship.fromRef;
        return <div key={relationship.id}><span><small>{relationship.label}</small><strong>{objectName(otherRef)}</strong></span><button type="button" disabled={Boolean(readOnlyReason)} onClick={() => void onMutate([{ op: "unlink-object", relationshipRef: `relationship:${relationship.id}` }])}>Remove link</button></div>;
      })}
      {release.threadRefs.map((ref) => <div key={ref}><span><small>Exact work</small><strong>{threadName(ref)}</strong></span><button type="button" disabled={Boolean(readOnlyReason)} onClick={() => void onMutate([{ op: "unlink-thread", threadRef: ref }])}>Remove link</button></div>)}
    </div>
    <form className="release-link-form" onSubmit={(event) => { event.preventDefault(); if (effectiveObjectRef) void onMutate([{ op: "link-object", objectRef: effectiveObjectRef, label: role }]); }}>
      <h3>Link venture context</h3>
      <label>Role<select value={role} onChange={(event) => setRole(event.target.value as (typeof LINK_ROLES)[number])}>{LINK_ROLES.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
      <label>Object<select value={effectiveObjectRef} onChange={(event) => setObjectRef(event.target.value)}><option value="">Choose an object</option>{availableObjects.map((object) => <option key={object.id} value={object.objectRef}>{object.name}</option>)}</select></label>
      <button type="submit" disabled={!effectiveObjectRef || Boolean(readOnlyReason)}>Add link</button>
    </form>
    <form className="release-link-form" onSubmit={(event) => { event.preventDefault(); if (effectiveThreadRef) void onMutate([{ op: "link-thread", threadRef: effectiveThreadRef }]); }}>
      <h3>Join exact work</h3>
      <label>Thread<select value={effectiveThreadRef} onChange={(event) => setThreadRef(event.target.value)}><option value="">Choose a thread</option>{availableThreads.map((thread) => <option key={thread.threadRef} value={thread.threadRef}>{thread.founderIntent}</option>)}</select></label>
      <button type="submit" disabled={!effectiveThreadRef || Boolean(readOnlyReason)}>Join work</button>
    </form>
  </section>;
}
