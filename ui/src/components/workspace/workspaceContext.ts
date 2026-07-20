import type { ReleaseIndex, SystemIndex, WorkIndex, WorkIndexItem } from "@/api";
import type { WorkspaceContext, WorkspaceMode } from "@/lib/venture-session";

const objectId = (ref: string) => ref.match(/^(?:object|architecture):(.+)$/)?.[1] ?? null;
const releaseRank = (release: ReleaseIndex["releases"][number]) => release.attention.length ? 4 : release.lifecycle === "in-market" ? 3 : release.lifecycle === "draft" ? 2 : 1;
const bestWork = (items: WorkIndexItem[]) => [...items].sort((a, b) => {
  const priority = (item: WorkIndexItem) => item.activity !== "idle" ? 4 : item.attention !== "none" ? 3 : item.lifecycle === "open" ? 2 : 1;
  return priority(b) - priority(a) || String(b.updatedAt).localeCompare(String(a.updatedAt));
})[0] ?? null;

export function resolveWorkspaceContext({ from, to, context, workIndex, systemIndex, releaseIndex }: {
  from: WorkspaceMode; to: WorkspaceMode; context: WorkspaceContext;
  workIndex: WorkIndex | null; systemIndex: SystemIndex | null; releaseIndex: ReleaseIndex | null;
}): WorkspaceContext {
  if (from === to) return context;
  const work = workIndex?.items ?? [];
  const objects = systemIndex?.objects ?? [];
  const releases = releaseIndex?.releases ?? [];
  if (from === "work" && context?.kind === "thread") {
    const thread = work.find((entry) => entry.threadRef === context.ref);
    const linked = (thread?.subjectRefs ?? []).map(objectId).filter(Boolean).map((id) => objects.find((entry) => entry.id === id)).filter(Boolean);
    if (to === "system") {
      const selected = linked.sort((a, b) => Number(b!.type === "release") - Number(a!.type === "release") || String(b!.updatedAt).localeCompare(String(a!.updatedAt)))[0];
      return selected ? { kind: selected.type === "release" ? "release" : "object", ref: selected.objectRef } : context;
    }
    const candidates = releases.filter((release) => release.threadRefs.includes(context.ref));
    const selected = candidates.sort((a, b) => releaseRank(b) - releaseRank(a) || String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    return selected ? { kind: "release", ref: selected.releaseRef } : context;
  }
  if (from === "system" && (context?.kind === "object" || context?.kind === "release")) {
    const id = objectId(context.ref);
    if (to === "work") {
      const object = objects.find((entry) => entry.id === id);
      const selected = bestWork(work.filter((entry) => object?.threadRefs.includes(entry.threadRef) || entry.subjectRefs.some((ref) => objectId(ref) === id)));
      return selected ? { kind: "thread", ref: selected.threadRef } : context;
    }
    const selected = releases.filter((release) => release.id === id || release.relatedObjectRefs.some((ref) => objectId(ref) === id)).sort((a, b) => releaseRank(b) - releaseRank(a) || String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    return selected ? { kind: "release", ref: selected.releaseRef } : context;
  }
  if (from === "releases" && context?.kind === "release") {
    const release = releases.find((entry) => entry.releaseRef === context.ref);
    if (to === "system") return context;
    const selected = bestWork(work.filter((entry) => release?.threadRefs.includes(entry.threadRef)));
    return selected ? { kind: "thread", ref: selected.threadRef } : context;
  }
  return context;
}
