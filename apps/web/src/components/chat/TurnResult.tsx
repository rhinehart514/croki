import { ExternalLinkIcon } from "lucide-react";

import type {
  ThreadEvidenceProvenance,
  TurnResultFact,
  TurnResultProjection,
} from "@croki/client-runtime/state/thread-evidence";

const RESULT_ORDER: ReadonlyArray<TurnResultFact["kind"]> = [
  "changed-files",
  "check",
  "visual-evidence",
  "judgment",
  "failure",
  "git",
  "provider-conclusion",
];

const RESULT_LABELS: Readonly<Record<TurnResultFact["kind"], string>> = {
  "changed-files": "Changed files",
  check: "Checks",
  "visual-evidence": "Visual evidence",
  judgment: "Unresolved judgment",
  failure: "Failure",
  git: "Git",
  "provider-conclusion": "Provider conclusion",
};

export interface TurnResultProps {
  readonly result: TurnResultProjection;
  /** The parent opens the exact existing surface described by the target. */
  readonly onOpenSource: (source: ThreadEvidenceProvenance) => void;
}

/** One factual receipt rendered after a settled provider answer. */
export function TurnResult({ result, onOpenSource }: TurnResultProps) {
  const grouped = groupFacts(result.facts);
  return (
    <section
      aria-labelledby={`turn-result-${result.turnId}`}
      data-turn-result={result.turnId}
      className="mx-auto w-full max-w-3xl border-b border-border/50 px-3 py-3 sm:px-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Croki evidence
          </p>
          <h2
            id={`turn-result-${result.turnId}`}
            className="mt-1 text-sm font-medium text-foreground"
          >
            Turn result
          </h2>
        </div>
        <span data-turn-result-state={result.status} className="text-[11px] text-muted-foreground">
          {statusLabel(result.status)}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {RESULT_ORDER.map((kind) => {
          const facts = grouped.get(kind) ?? [];
          if (facts.length === 0) return null;
          return (
            <section key={kind} aria-labelledby={`turn-result-${result.turnId}-${kind}`}>
              <h3
                id={`turn-result-${result.turnId}-${kind}`}
                className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                {RESULT_LABELS[kind]}
              </h3>
              <div className="divide-y divide-border/40 rounded border border-border/50 bg-muted/10">
                {facts.map((fact) => (
                  <ResultFactRow key={fact.id} fact={fact} onOpenSource={onOpenSource} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function ResultFactRow({
  fact,
  onOpenSource,
}: {
  readonly fact: TurnResultFact;
  readonly onOpenSource: (source: ThreadEvidenceProvenance) => void;
}) {
  return (
    <div
      data-turn-result-fact={fact.id}
      data-turn-result-fact-state={fact.state}
      className="flex items-start gap-3 px-3 py-2.5 first:rounded-t last:rounded-b"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-medium text-foreground">{fact.label}</span>
          {fact.attributedTo === "provider" ? (
            <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              provider-reported
            </span>
          ) : null}
          {fact.state !== "observed" ? (
            <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {factStateLabel(fact.state)}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-foreground/90">
          {fact.value}
        </p>
        {fact.detail ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-4 text-muted-foreground">
            {fact.detail}
          </p>
        ) : null}
        <p className="mt-1 text-[10px] text-muted-foreground/75">
          Source: {fact.source.label}
          {fact.supportingSources && fact.supportingSources.length > 0
            ? ` + ${fact.supportingSources.length} more`
            : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpenSource(fact.source)}
        className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={`Open source: ${fact.source.label}`}
      >
        Open
        <ExternalLinkIcon className="size-3" aria-hidden />
      </button>
    </div>
  );
}

function groupFacts(
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

function statusLabel(status: TurnResultProjection["status"]): string {
  switch (status) {
    case "completed":
      return "settled · completed";
    case "interrupted":
      return "settled · interrupted";
    case "failed":
      return "settled · failed";
  }
}

function factStateLabel(state: TurnResultFact["state"]): string {
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
