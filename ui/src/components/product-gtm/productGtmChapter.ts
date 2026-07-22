import type { FirmSemanticModel, MarketMovementIndex } from "@/types";
import { productGtmRefId, workNodeId } from "./productGtmLayout";
import type { ProductGtmProjectionContext } from "./productGtmProjection";

// Chapter selection and focus: the pure rules that decide which exact object a resting canvas frames and
// which local neighborhood lights up around a selection. Kept out of projection assembly so the projection
// stays a graph builder and this stays the single place the canvas' attention logic is defined.

const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => list(value).map(String);

export function focusNeighborhood(selectedId: string | null, spine: string[], model: FirmSemanticModel, extraEdges: Array<[string, string]>) {
  if (!selectedId) return new Set(spine);
  const neighbors = new Map<string, Set<string>>();
  const join = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a)?.add(b); neighbors.get(b)?.add(a);
  };
  for (const relationship of model.relationships) join(productGtmRefId(relationship.fromRef), productGtmRefId(relationship.toRef));
  for (const [source, target] of extraEdges) join(source, target);
  const focused = new Set([selectedId]);
  for (const first of neighbors.get(selectedId) ?? []) {
    focused.add(first);
    for (const second of neighbors.get(first) ?? []) focused.add(second);
  }
  return focused;
}

export function objectFocusFor(
  selectedId: string | null,
  model: FirmSemanticModel,
  movement: MarketMovementIndex | null,
) {
  if (!selectedId) return null;
  if (model.objects.some((object) => object.id === selectedId)) return selectedId;
  if (selectedId.startsWith("branch:")) {
    const branchRef = `model-branch:${selectedId.slice("branch:".length)}`;
    return model.modelChanges
      .filter((change) => change.branchRef === branchRef)
      .map((change) => productGtmRefId(change.targetRef ?? ""))
      .find((id) => model.objects.some((object) => object.id === id)) ?? null;
  }
  if (selectedId.startsWith("action:")) {
    return movement?.actions.find((action) => `action:${action.id}` === selectedId)?.subjectRefs
      .map(productGtmRefId).find((id) => model.objects.some((object) => object.id === id)) ?? null;
  }
  const work = (movement?.liveWork ?? []).find((item, index) => workNodeId(item, index) === selectedId);
  return strings(work?.subjectRefs).map(productGtmRefId)
    .find((id) => model.objects.some((object) => object.id === id)) ?? null;
}

export function automaticChapter(movement: MarketMovementIndex | null, context: ProductGtmProjectionContext) {
  if (context.wholeVenture) return null;
  const unreadSubjects = new Set((context.unreadSubjectRefs ?? []).map(productGtmRefId));
  const unreadThreads = new Set(context.unreadThreadRefs ?? []);
  const actions = movement?.actions ?? [];
  const decision = actions.find((action) => action.state === "needs-founder");
  if (decision) return { id: `action:${decision.id}`, kind: "decision" as const };
  const returned = actions.find((action) => action.state === "returned" && (
    context.unreadSubjectRefs === undefined
    || action.subjectRefs.some((ref) => unreadSubjects.has(productGtmRefId(ref)))
    || action.workRefs.some((ref) => unreadThreads.has(ref))
  ));
  if (returned) return { id: `action:${returned.id}`, kind: "return" as const };
  const reviewIndex = (movement?.liveWork ?? []).findIndex((item) => {
    const attention = String(item.attention ?? "").toLowerCase();
    return ["decision", "failure", "review"].includes(attention) && item.unread !== false;
  });
  if (reviewIndex >= 0) return { id: workNodeId(movement!.liveWork[reviewIndex], reviewIndex), kind: "review" as const };
  const staleBranch = movement?.modelBranches?.find((branch) => !branch.closedAt && branch.baseModelRevision < movement.revision);
  if (staleBranch) return { id: `branch:${staleBranch.id}`, kind: "review" as const };
  const activeIndex = (movement?.liveWork ?? []).findIndex((item) => item.activity === "running");
  if (activeIndex >= 0) return { id: workNodeId(movement!.liveWork[activeIndex], activeIndex), kind: "active" as const };
  return null;
}

// A repository citation (repository:<file>#L..-L..:digest) reduced to the bare file path the read was
// drawn from, so a provisional read can attach to the page that renders the same file.
export function citationSourceFile(ref: string): string | null {
  const match = /^repository:(.+?)#L\d+/.exec(ref);
  return match ? match[1] : null;
}

// The concrete repository files behind a provisional read: the working-theory subject's own cited sources
// plus any source carried on its provenance. Used to attach the read to the page(s) it derives from.
export function readSourceFiles(object: FirmSemanticModel["objects"][number]): Set<string> {
  const provenance = (object.provenance ?? {}) as Record<string, unknown>;
  const workingTheory = (object.properties?.workingTheory ?? {}) as Record<string, unknown>;
  const refs = [
    ...strings(workingTheory.sourceRefs),
    ...(provenance.sourceRef ? [String(provenance.sourceRef)] : []),
    ...strings(provenance.sourceRefs),
  ];
  const files = new Set<string>();
  for (const ref of refs) {
    const file = citationSourceFile(ref);
    if (file) files.add(file);
  }
  return files;
}
