import {
  type OrchestrationLatestTurn,
  type OrchestrationMessage,
  type TurnId,
} from "@croki/contracts";

import { deriveCurrentReality } from "./current-reality.ts";
import {
  type CurrentRealityFact,
  type ThreadEvidenceFactState,
  type ThreadEvidenceOpenTarget,
  type ThreadEvidenceProvenance,
  type TurnResultAdditionalFact,
  type TurnResultFact,
  type TurnResultFactKind,
  type TurnResultInput,
  type TurnResultProjection,
  type TurnResultStatus,
} from "./threadEvidence.ts";

function source(input: {
  readonly id: string;
  readonly kind: ThreadEvidenceProvenance["kind"];
  readonly label: string;
  readonly observedAt: string | null;
  readonly target: ThreadEvidenceOpenTarget;
}): ThreadEvidenceProvenance {
  return input;
}

function target(
  threadId: TurnResultInput["thread"]["id"],
  surface: ThreadEvidenceOpenTarget["surface"],
  extra: Record<string, unknown> = {},
): ThreadEvidenceOpenTarget {
  return { threadId, surface, ...extra } as ThreadEvidenceOpenTarget;
}

function resultFact(input: {
  readonly id: string;
  readonly kind: TurnResultFactKind;
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly state: ThreadEvidenceFactState;
  readonly source: ThreadEvidenceProvenance;
  readonly supportingSources?: ReadonlyArray<ThreadEvidenceProvenance>;
  readonly attributedTo?: "provider" | "environment";
}): TurnResultFact {
  return input;
}

function settledTurn(input: TurnResultInput): OrchestrationLatestTurn | null {
  const turn = input.thread.latestTurn;
  if (!turn) return null;
  if (input.turnId !== undefined && input.turnId !== null && turn.turnId !== input.turnId)
    return null;
  if (turn.completedAt === null || turn.state === "running") return null;
  if (
    input.thread.session?.status === "running" &&
    input.thread.session.activeTurnId === turn.turnId
  )
    return null;
  return turn;
}

function statusForTurn(turn: OrchestrationLatestTurn): TurnResultStatus {
  if (turn.state === "error") return "failed";
  if (turn.state === "interrupted") return "interrupted";
  return "completed";
}

function toResultKind(fact: CurrentRealityFact): TurnResultFactKind | null {
  if (
    fact.id.startsWith("reality:files:") ||
    fact.id.startsWith("reality:checkpoint:") ||
    fact.id.startsWith("reality:checkpoint-missing:")
  ) {
    return "changed-files";
  }
  if (
    fact.id.startsWith("reality:ui:") ||
    fact.id.startsWith("reality:ui-missing:") ||
    fact.id.startsWith("reality:ui-unavailable:")
  ) {
    return "visual-evidence";
  }
  if (fact.id === "reality:branch" || fact.id === "reality:worktree") return "git";
  if (fact.section === "checks") return "check";
  if (fact.section === "judgment") return "judgment";
  if (fact.state === "failed" && fact.section === "lane") return "failure";
  return null;
}

function mapRealityFact(fact: CurrentRealityFact): TurnResultFact | null {
  const kind = toResultKind(fact);
  if (kind === null) return null;
  return resultFact({
    id: `result:${fact.id}`,
    kind,
    label: fact.label,
    value: fact.value,
    ...(fact.detail ? { detail: fact.detail } : {}),
    state: fact.state,
    source: fact.source,
    ...(fact.supportingSources ? { supportingSources: fact.supportingSources } : {}),
    ...(kind === "judgment" || kind === "failure" ? {} : { attributedTo: "environment" as const }),
  });
}

function latestAssistantMessage(
  messages: ReadonlyArray<OrchestrationMessage>,
  turnId: TurnId,
): OrchestrationMessage | null {
  return (
    messages
      .filter((message) => message.role === "assistant" && message.turnId === turnId)
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .at(-1) ?? null
  );
}

function providerConclusionFact(
  input: TurnResultInput,
  turn: OrchestrationLatestTurn,
): TurnResultFact {
  const message = latestAssistantMessage(input.thread.messages, turn.turnId);
  if (message && message.text.trim().length > 0) {
    return resultFact({
      id: `result:conclusion:${message.id}`,
      kind: "provider-conclusion",
      label: "Provider conclusion",
      value: message.text,
      state: "observed",
      attributedTo: "provider",
      source: source({
        id: message.id,
        kind: "message",
        label: "provider answer",
        observedAt: message.updatedAt,
        target: target(input.thread.id, "thread", { messageId: message.id, turnId: turn.turnId }),
      }),
    });
  }
  return resultFact({
    id: `result:conclusion-missing:${turn.turnId}`,
    kind: "provider-conclusion",
    label: "Provider conclusion",
    value: "Not captured",
    state: "missing",
    source: source({
      id: turn.turnId,
      kind: "turn",
      label: "settled provider turn",
      observedAt: turn.completedAt,
      target: target(input.thread.id, "thread", { turnId: turn.turnId }),
    }),
  });
}

function noChecksFact(input: TurnResultInput, turn: OrchestrationLatestTurn): TurnResultFact {
  return resultFact({
    id: `result:checks-missing:${turn.turnId}`,
    kind: "check",
    label: "Observed checks",
    value: "Not captured",
    detail: "No command or check receipt was captured for this turn.",
    state: "missing",
    source: source({
      id: `${turn.turnId}:checks`,
      kind: "derived",
      label: "turn evidence",
      observedAt: turn.completedAt,
      target: target(input.thread.id, "terminal", { turnId: turn.turnId }),
    }),
  });
}

function dedupe(facts: ReadonlyArray<TurnResultFact>): TurnResultFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });
}

/**
 * Produces at most one factual receipt for the settled latest turn. It never
 * infers correctness from a stopped provider; missing evidence remains a
 * source-labelled fact that opens the relevant existing surface.
 */
export function deriveTurnResult(input: TurnResultInput): TurnResultProjection | null {
  const turn = settledTurn(input);
  if (!turn || turn.completedAt === null) return null;

  const reality = deriveCurrentReality({ thread: input.thread });
  const facts: TurnResultFact[] = reality.facts.flatMap((entry) => {
    const mapped = mapRealityFact(entry);
    return mapped ? [mapped] : [];
  });
  if (!facts.some((entry) => entry.kind === "check")) facts.push(noChecksFact(input, turn));
  facts.push(providerConclusionFact(input, turn));
  facts.push(...(input.additionalFacts ?? []));

  return {
    id: `turn-result:${input.thread.id}:${turn.turnId}`,
    threadId: input.thread.id,
    turnId: turn.turnId,
    status: statusForTurn(turn),
    settledAt: turn.completedAt,
    facts: dedupe(facts),
  };
}

export type { TurnResultAdditionalFact };
