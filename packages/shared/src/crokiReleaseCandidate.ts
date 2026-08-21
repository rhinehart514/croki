import {
  assertCrokiContextStringLimit,
  CROKI_CONTEXT_LIMITS,
  CrokiContextParseError,
  parseCrokiContextReference,
  type CrokiContextReference,
} from "./crokiContextValidation.ts";

export const CROKI_RELEASE_LIMITS = {
  versionChars: 80,
  goalChars: 1_000,
  items: 60,
  itemIdChars: 120,
  itemTitleChars: 240,
  itemOutcomeChars: 4_000,
  criteriaPerItem: 20,
  criterionIdChars: 120,
  criterionTextChars: 1_000,
  sourceThreadsPerItem: 12,
  sourceThreadIdChars: 128,
  sourceThreadTitleChars: 240,
} as const;

export const CROKI_RELEASE_STATUSES = ["active", "frozen", "released"] as const;
export type CrokiReleaseStatus = (typeof CROKI_RELEASE_STATUSES)[number];

export const CROKI_RELEASE_ITEM_KINDS = ["feature", "bug", "performance", "cleanup"] as const;
export type CrokiReleaseItemKind = (typeof CROKI_RELEASE_ITEM_KINDS)[number];

export const CROKI_RELEASE_ITEM_STATUSES = [
  "proposed",
  "working",
  "candidate",
  "blocked",
  "verified",
  "deferred",
] as const;
export type CrokiReleaseItemStatus = (typeof CROKI_RELEASE_ITEM_STATUSES)[number];

export const CROKI_RELEASE_CRITERION_STATUSES = ["pending", "passed", "failed"] as const;
export type CrokiReleaseCriterionStatus = (typeof CROKI_RELEASE_CRITERION_STATUSES)[number];

export interface CrokiReleaseSourceThread {
  readonly id: string;
  readonly title: string;
}

export interface CrokiReleaseCriterion {
  readonly id: string;
  readonly text: string;
  readonly status: CrokiReleaseCriterionStatus;
  readonly references?: readonly CrokiContextReference[];
}

export interface CrokiReleaseItem {
  readonly id: string;
  readonly title: string;
  readonly kind: CrokiReleaseItemKind;
  readonly status: CrokiReleaseItemStatus;
  readonly outcome: string;
  readonly acceptanceCriteria: readonly CrokiReleaseCriterion[];
  readonly sourceThreads: readonly CrokiReleaseSourceThread[];
}

export interface CrokiReleaseCandidate {
  readonly version: string;
  readonly baseline: string;
  readonly goal: string;
  readonly status: CrokiReleaseStatus;
  readonly items: readonly CrokiReleaseItem[];
}

export function parseCrokiReleaseCandidate(value: unknown): CrokiReleaseCandidate {
  if (!isRecord(value)) {
    throw malformed("Croki release candidate must be an object.");
  }
  const version = requiredString(value.version, CROKI_RELEASE_LIMITS.versionChars, "version");
  const baseline = requiredString(value.baseline, CROKI_RELEASE_LIMITS.versionChars, "baseline");
  const goal = requiredString(value.goal, CROKI_RELEASE_LIMITS.goalChars, "goal");
  if (!isReleaseStatus(value.status) || !Array.isArray(value.items)) {
    throw malformed("Croki release candidate is malformed.");
  }
  if (value.items.length > CROKI_RELEASE_LIMITS.items) {
    throw limitExceeded(`Croki release candidate exceeds ${CROKI_RELEASE_LIMITS.items} items.`);
  }

  const items = value.items.map(parseCrokiReleaseItem);
  assertUnique(
    items.map((item) => item.id),
    "release item ids",
  );
  if (
    value.status === "released" &&
    items.some((item) => item.status !== "verified" && item.status !== "deferred")
  ) {
    throw malformed("A released Croki candidate may contain only verified or deferred items.");
  }
  return { version, baseline, goal, status: value.status, items };
}

export function parseCrokiReleaseItem(value: unknown, index: number): CrokiReleaseItem {
  if (!isRecord(value)) throw malformed(`Croki release item ${index} is malformed.`);
  const id = requiredString(value.id, CROKI_RELEASE_LIMITS.itemIdChars, `item ${index} id`);
  const title = requiredString(
    value.title,
    CROKI_RELEASE_LIMITS.itemTitleChars,
    `item ${index} title`,
  );
  const outcome = optionalString(
    value.outcome,
    CROKI_RELEASE_LIMITS.itemOutcomeChars,
    `item ${index} outcome`,
  );
  if (
    !isReleaseItemKind(value.kind) ||
    !isReleaseItemStatus(value.status) ||
    !Array.isArray(value.acceptanceCriteria) ||
    !Array.isArray(value.sourceThreads)
  ) {
    throw malformed(`Croki release item ${index} is malformed.`);
  }
  if (value.acceptanceCriteria.length > CROKI_RELEASE_LIMITS.criteriaPerItem) {
    throw limitExceeded(
      `Croki release item ${index} exceeds ${CROKI_RELEASE_LIMITS.criteriaPerItem} acceptance criteria.`,
    );
  }
  if (value.sourceThreads.length > CROKI_RELEASE_LIMITS.sourceThreadsPerItem) {
    throw limitExceeded(
      `Croki release item ${index} exceeds ${CROKI_RELEASE_LIMITS.sourceThreadsPerItem} source Threads.`,
    );
  }

  const acceptanceCriteria = value.acceptanceCriteria.map((criterion, criterionIndex) =>
    parseCrokiReleaseCriterion(criterion, index, criterionIndex),
  );
  const sourceThreads = value.sourceThreads.map((thread, threadIndex) =>
    parseCrokiReleaseSourceThread(thread, index, threadIndex),
  );
  assertUnique(
    acceptanceCriteria.map((criterion) => criterion.id),
    `release item ${index} acceptance-criterion ids`,
  );
  assertUnique(
    sourceThreads.map((thread) => thread.id),
    `release item ${index} source Thread ids`,
  );
  if (
    value.status === "verified" &&
    (acceptanceCriteria.length === 0 ||
      acceptanceCriteria.some((criterion) => criterion.status !== "passed"))
  ) {
    throw malformed(
      `Croki release item ${index} cannot be verified until every acceptance criterion passes.`,
    );
  }
  return {
    id,
    title,
    kind: value.kind,
    status: value.status,
    outcome,
    acceptanceCriteria,
    sourceThreads,
  };
}

function parseCrokiReleaseCriterion(
  value: unknown,
  itemIndex: number,
  criterionIndex: number,
): CrokiReleaseCriterion {
  if (!isRecord(value) || !isCriterionStatus(value.status)) {
    throw malformed(`Croki release item ${itemIndex} criterion ${criterionIndex} is malformed.`);
  }
  const id = requiredString(
    value.id,
    CROKI_RELEASE_LIMITS.criterionIdChars,
    `item ${itemIndex} criterion ${criterionIndex} id`,
  );
  const text = requiredString(
    value.text,
    CROKI_RELEASE_LIMITS.criterionTextChars,
    `item ${itemIndex} criterion ${criterionIndex} text`,
  );
  if (value.references !== undefined && !Array.isArray(value.references)) {
    throw malformed(
      `Croki release item ${itemIndex} criterion ${criterionIndex} references must be an array.`,
    );
  }
  if (
    Array.isArray(value.references) &&
    value.references.length > CROKI_CONTEXT_LIMITS.referencesPerNode
  ) {
    throw limitExceeded(
      `Croki release item ${itemIndex} criterion ${criterionIndex} exceeds ${CROKI_CONTEXT_LIMITS.referencesPerNode} references.`,
    );
  }
  const references = Array.isArray(value.references)
    ? value.references.map((reference, referenceIndex) =>
        parseCrokiContextReference(
          reference,
          `release item ${itemIndex} criterion ${criterionIndex} reference ${referenceIndex}`,
        ),
      )
    : undefined;
  if (references) {
    assertUnique(
      references.map(referenceKey),
      `release item ${itemIndex} criterion ${criterionIndex} references`,
    );
  }
  return {
    id,
    text,
    status: value.status,
    ...(references ? { references } : {}),
  };
}

function parseCrokiReleaseSourceThread(
  value: unknown,
  itemIndex: number,
  threadIndex: number,
): CrokiReleaseSourceThread {
  if (!isRecord(value)) {
    throw malformed(`Croki release item ${itemIndex} source Thread ${threadIndex} is malformed.`);
  }
  return {
    id: requiredString(
      value.id,
      CROKI_RELEASE_LIMITS.sourceThreadIdChars,
      `item ${itemIndex} source Thread ${threadIndex} id`,
    ),
    title: requiredString(
      value.title,
      CROKI_RELEASE_LIMITS.sourceThreadTitleChars,
      `item ${itemIndex} source Thread ${threadIndex} title`,
    ),
  };
}

function requiredString(value: unknown, limit: number, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw malformed(`Croki release ${label} requires a value.`);
  }
  const normalized = value.trim();
  assertCrokiContextStringLimit(normalized, limit, `release ${label}`);
  return normalized;
}

function optionalString(value: unknown, limit: number, label: string): string {
  if (value === undefined) return "";
  if (typeof value !== "string") throw malformed(`Croki release ${label} must be text.`);
  assertCrokiContextStringLimit(value, limit, `release ${label}`);
  return value;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw malformed(`Croki ${label} must be unique.`);
  }
}

function referenceKey(reference: CrokiContextReference): string {
  return reference.kind === "file"
    ? `file:${reference.path}:${reference.line ?? ""}`
    : `url:${reference.url}`;
}

function isReleaseStatus(value: unknown): value is CrokiReleaseStatus {
  return typeof value === "string" && CROKI_RELEASE_STATUSES.includes(value as CrokiReleaseStatus);
}

function isReleaseItemKind(value: unknown): value is CrokiReleaseItemKind {
  return (
    typeof value === "string" && CROKI_RELEASE_ITEM_KINDS.includes(value as CrokiReleaseItemKind)
  );
}

function isReleaseItemStatus(value: unknown): value is CrokiReleaseItemStatus {
  return (
    typeof value === "string" &&
    CROKI_RELEASE_ITEM_STATUSES.includes(value as CrokiReleaseItemStatus)
  );
}

function isCriterionStatus(value: unknown): value is CrokiReleaseCriterionStatus {
  return (
    typeof value === "string" &&
    CROKI_RELEASE_CRITERION_STATUSES.includes(value as CrokiReleaseCriterionStatus)
  );
}

function malformed(message: string): CrokiContextParseError {
  return new CrokiContextParseError("malformed", message);
}

function limitExceeded(message: string): CrokiContextParseError {
  return new CrokiContextParseError("limit-exceeded", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
