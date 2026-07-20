import type { SystemIndexObject, WorkIndex, WorkIndexItem } from "@/api";

export type SystemWorkState = "working" | "needs-review" | "failed" | "completed";

export type SystemAgentContext = {
  objectRef: string;
  subjectRefs: [string];
  threadRef: string | null;
  thread: WorkIndexItem | null;
  state: SystemWorkState | null;
};

const priority: Record<SystemWorkState, number> = {
  failed: 4,
  "needs-review": 3,
  working: 2,
  completed: 1,
};

export function systemWorkState(item: WorkIndexItem): SystemWorkState | null {
  if (item.attention === "failure" || item.terminal === "failed") return "failed";
  if (item.attention === "decision" || item.attention === "review") return "needs-review";
  if (item.activity !== "idle") return "working";
  if (item.terminal === "completed") return "completed";
  return null;
}

function timestamp(item: WorkIndexItem) {
  const value = Date.parse(item.updatedAt ?? item.createdAt ?? "");
  return Number.isNaN(value) ? 0 : value;
}

export function linkedWork(object: SystemIndexObject, workIndex: WorkIndex | null | undefined) {
  const linked = new Set(object.threadRefs);
  return (workIndex?.items ?? [])
    .filter((item) => linked.has(item.threadRef))
    .sort((left, right) => timestamp(right) - timestamp(left));
}

export function systemAgentContext(object: SystemIndexObject, workIndex: WorkIndex | null | undefined): SystemAgentContext {
  const threads = linkedWork(object, workIndex);
  const thread = threads[0] ?? null;
  const states = threads.map(systemWorkState).filter((state): state is SystemWorkState => Boolean(state));
  const state = states.sort((left, right) => priority[right] - priority[left])[0] ?? null;
  return { objectRef: object.objectRef, subjectRefs: [object.objectRef], threadRef: thread?.threadRef ?? object.threadRefs[0] ?? null, thread, state };
}

export function systemWorkByObject(objects: SystemIndexObject[], workIndex: WorkIndex | null | undefined) {
  return new Map(objects.map((object) => [object.id, systemAgentContext(object, workIndex)]));
}
