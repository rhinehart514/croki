import type {
  CurrentRealityFact,
  CurrentRealitySection,
  ThreadEvidenceFactState,
  TurnResultFact,
} from "@croki/client-runtime/state/thread-evidence";

export const EVIDENCE_SECTION_ORDER: ReadonlyArray<CurrentRealitySection> = [
  "outcome",
  "direction",
  "lane",
  "work",
  "judgment",
  "repository",
  "checks",
  "shipping",
];

export const EVIDENCE_SECTION_LABELS: Readonly<Record<CurrentRealitySection, string>> = {
  outcome: "Intended outcome",
  direction: "Latest direction",
  lane: "Canonical lane",
  work: "Active work",
  judgment: "Needs judgment",
  repository: "Repository",
  checks: "Observed evidence",
  shipping: "Shipping state",
};

export const TURN_RESULT_ORDER: ReadonlyArray<TurnResultFact["kind"]> = [
  "changed-files",
  "check",
  "visual-evidence",
  "judgment",
  "failure",
  "git",
  "provider-conclusion",
];

export const TURN_RESULT_LABELS: Readonly<Record<TurnResultFact["kind"], string>> = {
  "changed-files": "Changed files",
  check: "Checks",
  "visual-evidence": "Visual evidence",
  judgment: "Unresolved judgment",
  failure: "Failure",
  git: "Git",
  "provider-conclusion": "Provider conclusion",
};

export function evidenceFactStateLabel(state: ThreadEvidenceFactState): string {
  switch (state) {
    case "active":
      return "active";
    case "pending":
      return "needs you";
    case "failed":
      return "failed";
    case "missing":
      return "not captured";
    case "settled":
      return "observed exit";
    case "observed":
      return "observed";
  }
}

export function turnResultStatusLabel(status: "completed" | "interrupted" | "failed"): string {
  switch (status) {
    case "completed":
      return "Settled · completed";
    case "interrupted":
      return "Settled · interrupted";
    case "failed":
      return "Settled · failed";
  }
}

export function groupTurnResultFacts(
  facts: ReadonlyArray<TurnResultFact>,
): ReadonlyMap<TurnResultFact["kind"], ReadonlyArray<TurnResultFact>> {
  const grouped = new Map<TurnResultFact["kind"], TurnResultFact[]>();
  for (const fact of facts) {
    const entries = grouped.get(fact.kind) ?? [];
    entries.push(fact);
    grouped.set(fact.kind, entries);
  }
  return grouped;
}

export function factStateClassName(fact: CurrentRealityFact | TurnResultFact): string {
  switch (fact.state) {
    case "active":
      return "text-blue-600 dark:text-blue-300";
    case "pending":
      return "text-amber-700 dark:text-amber-300";
    case "failed":
      return "text-red-700 dark:text-red-300";
    case "missing":
      return "text-foreground-muted";
    case "settled":
      return "text-emerald-700 dark:text-emerald-300";
    case "observed":
      return "text-foreground-muted";
  }
}
