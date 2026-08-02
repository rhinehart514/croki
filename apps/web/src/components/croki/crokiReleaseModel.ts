import {
  CROKI_CONTEXT_LIMITS,
  type CrokiContext,
  type CrokiContextReference,
} from "@croki/shared/crokiContext";
import {
  CROKI_RELEASE_LIMITS,
  parseCrokiReleaseCandidate,
  type CrokiReleaseCandidate,
  type CrokiReleaseCriterion,
  type CrokiReleaseItem,
  type CrokiReleaseSourceThread,
} from "@croki/shared/crokiReleaseCandidate";

import type { CrokiCanvasModelError, CrokiCanvasTransition } from "./crokiCanvasModel";

interface CreateReleaseInput {
  readonly version: string;
  readonly baseline: string;
  readonly goal: string;
}

interface AddReleaseItemInput {
  readonly id: string;
  readonly title: string;
  readonly sourceThread?: CrokiReleaseSourceThread;
}

export function createCrokiReleaseCandidate(
  context: CrokiContext,
  input: CreateReleaseInput,
  now: string,
): CrokiCanvasTransition {
  return commitRelease(
    context,
    {
      version: input.version,
      baseline: input.baseline,
      goal: input.goal,
      status: "active",
      items: [],
    },
    now,
  );
}

export function updateCrokiReleaseCandidate(
  context: CrokiContext,
  patch: Partial<Pick<CrokiReleaseCandidate, "version" | "baseline" | "goal" | "status">>,
  now: string,
): CrokiCanvasTransition {
  if (!context.release) return fail(context, "missing-release");
  return commitRelease(context, { ...context.release, ...patch }, now);
}

export function addCrokiReleaseItem(
  context: CrokiContext,
  input: AddReleaseItemInput,
  now: string,
): CrokiCanvasTransition {
  const release = context.release;
  if (!release) return fail(context, "missing-release");
  if (release.items.length >= CROKI_RELEASE_LIMITS.items) {
    return fail(context, "release-item-limit");
  }
  if (release.items.some((item) => item.id === input.id)) {
    return fail(context, "duplicate-release-item");
  }
  const item: CrokiReleaseItem = {
    id: input.id,
    title: input.title,
    kind: "feature",
    status: input.sourceThread ? "working" : "candidate",
    outcome: "",
    acceptanceCriteria: [],
    sourceThreads: input.sourceThread ? [input.sourceThread] : [],
  };
  return commitRelease(context, { ...release, items: [...release.items, item] }, now);
}

export function updateCrokiReleaseItem(
  context: CrokiContext,
  itemId: string,
  patch: Partial<Pick<CrokiReleaseItem, "title" | "kind" | "status" | "outcome">>,
  now: string,
): CrokiCanvasTransition {
  const item = context.release?.items.find((candidate) => candidate.id === itemId);
  if (!context.release || !item) return fail(context, "missing-release-item");
  const next = { ...item, ...patch };
  if (next.status === "verified" && !canVerifyCrokiReleaseItem(next)) {
    return fail(context, "release-verification-required");
  }
  return replaceReleaseItem(context, next, now);
}

export function deleteCrokiReleaseItem(
  context: CrokiContext,
  itemId: string,
  now: string,
): CrokiCanvasTransition {
  if (!context.release?.items.some((item) => item.id === itemId)) {
    return fail(context, "missing-release-item");
  }
  return commitRelease(
    context,
    {
      ...context.release,
      items: context.release.items.filter((item) => item.id !== itemId),
    },
    now,
  );
}

export function linkCrokiReleaseSourceThread(
  context: CrokiContext,
  itemId: string,
  thread: CrokiReleaseSourceThread,
  now: string,
): CrokiCanvasTransition {
  const item = context.release?.items.find((candidate) => candidate.id === itemId);
  if (!item) return fail(context, "missing-release-item");
  if (item.sourceThreads.some((candidate) => candidate.id === thread.id)) {
    return { context, error: null };
  }
  if (item.sourceThreads.length >= CROKI_RELEASE_LIMITS.sourceThreadsPerItem) {
    return fail(context, "release-thread-limit");
  }
  return replaceReleaseItem(
    context,
    { ...item, sourceThreads: [...item.sourceThreads, thread] },
    now,
  );
}

export function unlinkCrokiReleaseSourceThread(
  context: CrokiContext,
  itemId: string,
  threadId: string,
  now: string,
): CrokiCanvasTransition {
  const item = context.release?.items.find((candidate) => candidate.id === itemId);
  if (!item) return fail(context, "missing-release-item");
  return replaceReleaseItem(
    context,
    { ...item, sourceThreads: item.sourceThreads.filter((thread) => thread.id !== threadId) },
    now,
  );
}

export function addCrokiReleaseCriterion(
  context: CrokiContext,
  itemId: string,
  criterion: Pick<CrokiReleaseCriterion, "id" | "text">,
  now: string,
): CrokiCanvasTransition {
  const item = context.release?.items.find((candidate) => candidate.id === itemId);
  if (!item) return fail(context, "missing-release-item");
  if (item.acceptanceCriteria.length >= CROKI_RELEASE_LIMITS.criteriaPerItem) {
    return fail(context, "release-criterion-limit");
  }
  if (item.acceptanceCriteria.some((candidate) => candidate.id === criterion.id)) {
    return fail(context, "duplicate-release-criterion");
  }
  return replaceReleaseItem(
    context,
    {
      ...item,
      acceptanceCriteria: [
        ...item.acceptanceCriteria,
        { ...criterion, status: "pending" as const },
      ],
    },
    now,
  );
}

export function updateCrokiReleaseCriterion(
  context: CrokiContext,
  itemId: string,
  criterionId: string,
  patch: Partial<Pick<CrokiReleaseCriterion, "text" | "status">>,
  now: string,
): CrokiCanvasTransition {
  const item = context.release?.items.find((candidate) => candidate.id === itemId);
  const criterion = item?.acceptanceCriteria.find((candidate) => candidate.id === criterionId);
  if (!item || !criterion) return fail(context, "missing-release-criterion");
  const acceptanceCriteria = item.acceptanceCriteria.map((candidate) =>
    candidate.id === criterionId ? { ...candidate, ...patch } : candidate,
  );
  const status = item.status === "verified" ? "candidate" : item.status;
  return replaceReleaseItem(context, { ...item, status, acceptanceCriteria }, now);
}

export function deleteCrokiReleaseCriterion(
  context: CrokiContext,
  itemId: string,
  criterionId: string,
  now: string,
): CrokiCanvasTransition {
  const item = context.release?.items.find((candidate) => candidate.id === itemId);
  if (!item?.acceptanceCriteria.some((criterion) => criterion.id === criterionId)) {
    return fail(context, "missing-release-criterion");
  }
  const status = item.status === "verified" ? "candidate" : item.status;
  return replaceReleaseItem(
    context,
    {
      ...item,
      status,
      acceptanceCriteria: item.acceptanceCriteria.filter(
        (criterion) => criterion.id !== criterionId,
      ),
    },
    now,
  );
}

export function addCrokiReleaseCriterionReference(
  context: CrokiContext,
  itemId: string,
  criterionId: string,
  reference: CrokiContextReference,
  now: string,
): CrokiCanvasTransition {
  const item = context.release?.items.find((candidate) => candidate.id === itemId);
  const criterion = item?.acceptanceCriteria.find((candidate) => candidate.id === criterionId);
  if (!item || !criterion) return fail(context, "missing-release-criterion");
  const references = criterion.references ?? [];
  if (references.length >= CROKI_CONTEXT_LIMITS.referencesPerNode) {
    return fail(context, "reference-limit");
  }
  if (references.some((candidate) => referenceKey(candidate) === referenceKey(reference))) {
    return fail(context, "duplicate-reference");
  }
  return replaceCriterion(
    context,
    item,
    { ...criterion, references: [...references, reference] },
    now,
  );
}

export function removeCrokiReleaseCriterionReference(
  context: CrokiContext,
  itemId: string,
  criterionId: string,
  reference: CrokiContextReference,
  now: string,
): CrokiCanvasTransition {
  const item = context.release?.items.find((candidate) => candidate.id === itemId);
  const criterion = item?.acceptanceCriteria.find((candidate) => candidate.id === criterionId);
  if (!item || !criterion) return fail(context, "missing-release-criterion");
  const references = (criterion.references ?? []).filter(
    (candidate) => referenceKey(candidate) !== referenceKey(reference),
  );
  const { references: _references, ...withoutReferences } = criterion;
  return replaceCriterion(
    context,
    item,
    references.length > 0 ? { ...withoutReferences, references } : withoutReferences,
    now,
  );
}

export function canVerifyCrokiReleaseItem(item: CrokiReleaseItem): boolean {
  return (
    item.acceptanceCriteria.length > 0 &&
    item.acceptanceCriteria.every((criterion) => criterion.status === "passed")
  );
}

export function nextCrokiReleaseItemId(release: CrokiReleaseCandidate, title: string): string {
  return nextId(
    release.items.map((item) => item.id),
    title || "release-item",
  );
}

export function nextCrokiReleaseCriterionId(item: CrokiReleaseItem): string {
  return nextId(
    item.acceptanceCriteria.map((criterion) => criterion.id),
    "acceptance",
  );
}

function replaceCriterion(
  context: CrokiContext,
  item: CrokiReleaseItem,
  criterion: CrokiReleaseCriterion,
  now: string,
): CrokiCanvasTransition {
  const acceptanceCriteria = item.acceptanceCriteria.map((candidate) =>
    candidate.id === criterion.id ? criterion : candidate,
  );
  const status = item.status === "verified" ? "candidate" : item.status;
  return replaceReleaseItem(context, { ...item, status, acceptanceCriteria }, now);
}

function replaceReleaseItem(
  context: CrokiContext,
  item: CrokiReleaseItem,
  now: string,
): CrokiCanvasTransition {
  if (!context.release) return fail(context, "missing-release");
  return commitRelease(
    context,
    {
      ...context.release,
      items: context.release.items.map((candidate) =>
        candidate.id === item.id ? item : candidate,
      ),
    },
    now,
  );
}

function commitRelease(
  context: CrokiContext,
  release: CrokiReleaseCandidate,
  now: string,
): CrokiCanvasTransition {
  try {
    const parsed = parseCrokiReleaseCandidate(release);
    return { context: { ...context, release: parsed, updatedAt: now }, error: null };
  } catch {
    return fail(context, "invalid-release");
  }
}

function fail(context: CrokiContext, error: CrokiCanvasModelError): CrokiCanvasTransition {
  return { context, error };
}

function nextId(existing: readonly string[], input: string): string {
  const base =
    input
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, CROKI_RELEASE_LIMITS.itemIdChars) || "item";
  const used = new Set(existing);
  if (!used.has(base)) return base;
  let suffix = 2;
  let candidate = withIdSuffix(base, suffix);
  while (used.has(candidate)) {
    suffix += 1;
    candidate = withIdSuffix(base, suffix);
  }
  return candidate;
}

function withIdSuffix(base: string, suffix: number): string {
  const ending = `-${suffix}`;
  return `${base.slice(0, CROKI_RELEASE_LIMITS.itemIdChars - ending.length)}${ending}`;
}

function referenceKey(reference: CrokiContextReference): string {
  return reference.kind === "file"
    ? `file:${reference.path}:${reference.line ?? ""}`
    : `url:${reference.url}`;
}
