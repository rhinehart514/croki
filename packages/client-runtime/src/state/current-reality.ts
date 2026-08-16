import {
  deriveCheckFacts,
  deriveFailureFacts,
  deriveJudgmentFacts,
  derivePlanFact,
  deriveRepositoryFacts,
  deriveVisualFacts,
} from "./current-reality-facts.ts";
import {
  type CurrentRealityFact,
  type CurrentRealityInput,
  type CurrentRealityProjection,
  type CurrentRealitySection,
  type CurrentRealityWorkerInput,
} from "./threadEvidence.ts";
import { fact, latestUserMessage, source, target } from "./current-reality-helpers.ts";

const REALITY_SECTIONS: ReadonlyArray<CurrentRealitySection> = [
  "outcome",
  "direction",
  "lane",
  "work",
  "judgment",
  "repository",
  "checks",
  "shipping",
];

function latestChangedAt(input: CurrentRealityInput): string | null {
  const candidates = [
    input.thread.createdAt,
    input.thread.updatedAt,
    input.thread.latestTurn?.completedAt,
    input.thread.latestTurn?.startedAt,
    ...input.thread.messages.map((message) => message.updatedAt),
    ...input.thread.activities.map((activity) => activity.createdAt),
    ...input.thread.checkpoints.map((checkpoint) => checkpoint.completedAt),
    ...(input.workers ?? []).map((worker) => worker.updatedAt),
    ...(input.additionalFacts ?? []).flatMap((entry) => [entry.source.observedAt]),
  ].filter((entry): entry is string => entry !== null && entry !== undefined);
  return candidates.toSorted().at(-1) ?? null;
}

function changedSince(lastVisitedAt: string | null | undefined, changedAt: string | null): boolean {
  if (changedAt === null || lastVisitedAt === undefined || lastVisitedAt === null)
    return changedAt !== null;
  const changed = Date.parse(changedAt);
  const visited = Date.parse(lastVisitedAt);
  return Number.isFinite(changed) && Number.isFinite(visited)
    ? changed > visited
    : changedAt !== lastVisitedAt;
}

function workerFact(
  parentThreadId: CurrentRealityInput["thread"]["id"],
  worker: CurrentRealityWorkerInput,
): CurrentRealityFact {
  const state = /fail|error/i.test(worker.state)
    ? "failed"
    : /run|work|active|pending/i.test(worker.state)
      ? "active"
      : "observed";
  return fact({
    id: `reality:worker:${worker.threadId}`,
    section: "work",
    label:
      worker.attempt === null || worker.attempt === undefined
        ? "Worker Thread"
        : `Worker Thread · Attempt ${worker.attempt}`,
    value: worker.title,
    detail: worker.state,
    state,
    source: source({
      id: worker.threadId,
      kind: "worker-thread",
      label: "worker Thread",
      observedAt: worker.updatedAt,
      target: target(parentThreadId, "thread", { workerThreadId: worker.threadId }),
    }),
  });
}

function deriveFacts(input: CurrentRealityInput): CurrentRealityFact[] {
  const { thread } = input;
  const result: CurrentRealityFact[] = [
    fact({
      id: "reality:outcome",
      section: "outcome",
      label: "Intended outcome",
      value: thread.title,
      source: source({
        id: `${thread.id}:title`,
        kind: "thread",
        label: "Thread title",
        observedAt: thread.updatedAt,
        target: target(thread.id, "thread"),
      }),
    }),
  ];

  const direction = latestUserMessage(thread.messages);
  if (direction) {
    result.push(
      fact({
        id: `reality:direction:${direction.id}`,
        section: "direction",
        label: "Latest human direction",
        value: direction.text,
        source: source({
          id: direction.id,
          kind: "message",
          label: "human message",
          observedAt: direction.updatedAt,
          target: target(thread.id, "thread", {
            messageId: direction.id,
            turnId: direction.turnId ?? undefined,
          }),
        }),
      }),
    );
  }

  if (thread.session) {
    result.push(
      fact({
        id: `reality:session:${thread.session.updatedAt}`,
        section: "lane",
        label: "Provider state",
        value: thread.session.providerName
          ? `${thread.session.providerName}: ${thread.session.status}`
          : thread.session.status,
        ...(thread.session.lastError ? { detail: thread.session.lastError } : {}),
        state:
          thread.session.status === "running" || thread.session.status === "starting"
            ? "active"
            : thread.session.status === "error"
              ? "failed"
              : "observed",
        source: source({
          id: `${thread.id}:session:${thread.session.updatedAt}`,
          kind: "session",
          label: "provider session",
          observedAt: thread.session.updatedAt,
          target: target(thread.id, "thread", { turnId: thread.session.activeTurnId ?? undefined }),
        }),
      }),
    );
  }

  if (thread.latestTurn) {
    result.push(
      fact({
        id: `reality:turn:${thread.latestTurn.turnId}`,
        section: "lane",
        label: "Canonical turn",
        value: thread.latestTurn.state,
        state:
          thread.latestTurn.state === "running"
            ? "active"
            : thread.latestTurn.state === "error"
              ? "failed"
              : "settled",
        source: source({
          id: thread.latestTurn.turnId,
          kind: "turn",
          label: "canonical provider turn",
          observedAt:
            thread.latestTurn.completedAt ??
            thread.latestTurn.startedAt ??
            thread.latestTurn.requestedAt,
          target: target(thread.id, "thread", { turnId: thread.latestTurn.turnId }),
        }),
      }),
    );
    const plan = derivePlanFact(thread.id, thread.activities, thread.latestTurn.turnId);
    if (plan) result.push(plan);
  }

  for (const worker of input.workers ?? []) result.push(workerFact(thread.id, worker));
  result.push(...deriveJudgmentFacts(thread.id, thread.activities));
  result.push(...deriveFailureFacts(input));
  result.push(...deriveRepositoryFacts(input));
  result.push(...deriveCheckFacts(thread.id, thread.activities, thread.latestTurn?.turnId ?? null));
  result.push(...deriveVisualFacts(input));
  result.push(...(input.additionalFacts ?? []));
  return dedupeFacts(result);
}

function dedupeFacts(facts: ReadonlyArray<CurrentRealityFact>): CurrentRealityFact[] {
  const seen = new Set<string>();
  return facts.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function groupFacts(
  facts: ReadonlyArray<CurrentRealityFact>,
): Readonly<Record<CurrentRealitySection, ReadonlyArray<CurrentRealityFact>>> {
  const groups = Object.fromEntries(
    REALITY_SECTIONS.map((section) => [section, [] as CurrentRealityFact[]]),
  ) as Record<CurrentRealitySection, CurrentRealityFact[]>;
  for (const entry of facts) groups[entry.section].push(entry);
  return groups;
}

/** Deterministically projects source data into the compact mid-work entry view. */
export function deriveCurrentReality(input: CurrentRealityInput): CurrentRealityProjection {
  const facts = deriveFacts(input);
  const changedAt = latestChangedAt(input);
  return {
    threadId: input.thread.id,
    changedAt,
    showOnEntry: changedSince(input.lastVisitedAt, changedAt),
    facts,
    sections: groupFacts(facts),
  };
}

/** Selector used by route entry code before mounting the projection. */
export function shouldShowCurrentReality(input: CurrentRealityInput): boolean {
  return deriveCurrentReality(input).showOnEntry;
}
