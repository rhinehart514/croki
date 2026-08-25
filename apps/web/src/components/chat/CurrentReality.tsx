import { ExternalLinkIcon, XIcon } from "lucide-react";

import type {
  CurrentRealityFact,
  CurrentRealityProjection,
  CurrentRealitySection,
  ThreadEvidenceProvenance,
} from "@croki/client-runtime/state/thread-evidence";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const SECTION_ORDER: ReadonlyArray<CurrentRealitySection> = [
  "outcome",
  "direction",
  "lane",
  "work",
  "judgment",
  "repository",
  "checks",
  "shipping",
];

const SECTION_LABELS: Readonly<Record<CurrentRealitySection, string>> = {
  outcome: "Intended outcome",
  direction: "Latest direction",
  lane: "Canonical lane",
  work: "Active work",
  judgment: "Needs judgment",
  repository: "Repository",
  checks: "Observed evidence",
  shipping: "Shipping state",
};

export interface CurrentRealityProps {
  readonly reality: CurrentRealityProjection;
  /** The parent maps this target to an existing Diff, Files, Preview, or Thread surface. */
  readonly onOpenSource: (source: ThreadEvidenceProvenance) => void;
  readonly onDismiss?: (() => void) | undefined;
}

export function CurrentReality({ reality, onOpenSource, onDismiss }: CurrentRealityProps) {
  return (
    <section
      aria-labelledby="current-reality-heading"
      data-current-reality="true"
      className="mx-auto w-full max-w-3xl border-b border-border/50 px-3 py-3 sm:px-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Mid-work entry
          </p>
          <h2 id="current-reality-heading" className="mt-1 text-sm font-medium text-foreground">
            Current reality
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Source-grounded facts from this Thread and its existing evidence.
          </p>
        </div>
        {onDismiss ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Dismiss current reality"
                  onClick={onDismiss}
                  className="rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <XIcon className="size-4" aria-hidden />
                </button>
              }
            />
            <TooltipPopup>Dismiss current reality</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {SECTION_ORDER.map((section) => {
          const facts = reality.sections[section];
          if (facts.length === 0) return null;
          return (
            <section key={section} aria-labelledby={`current-reality-${section}`}>
              <h3
                id={`current-reality-${section}`}
                className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                {SECTION_LABELS[section]}
              </h3>
              <div className="divide-y divide-border/40 rounded border border-border/50 bg-muted/10">
                {facts.map((fact) => (
                  <RealityFactRow key={fact.id} fact={fact} onOpenSource={onOpenSource} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function RealityFactRow({
  fact,
  onOpenSource,
}: {
  readonly fact: CurrentRealityFact;
  readonly onOpenSource: (source: ThreadEvidenceProvenance) => void;
}) {
  return (
    <div
      data-reality-fact={fact.id}
      data-reality-state={fact.state}
      className="flex items-start gap-3 px-3 py-2.5 first:rounded-t last:rounded-b"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-medium text-foreground">{fact.label}</span>
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
          <p className="mt-0.5 line-clamp-2 break-words text-[11px] leading-4 text-muted-foreground">
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

function factStateLabel(state: CurrentRealityFact["state"]): string {
  switch (state) {
    case "active":
      return "active";
    case "pending":
      return "needs you";
    case "failed":
      return "failed";
    case "missing":
      return "not observed";
    case "settled":
      return "settled";
    case "observed":
      return "observed";
  }
}
