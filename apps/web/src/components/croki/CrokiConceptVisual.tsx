import type { CrokiConceptFile } from "@croki/shared/crokiConcepts";
import { CircleDot } from "lucide-react";

import { ScrollArea } from "~/components/ui/scroll-area";

export function CrokiConceptVisual(props: {
  readonly concept: CrokiConceptFile;
  readonly onOpenParent: () => void;
}) {
  const { concept } = props;
  return (
    <ScrollArea className="min-h-0 flex-1 bg-black text-white">
      <main className="mx-auto w-full max-w-5xl px-6 py-10 sm:px-10 sm:py-14">
        <button
          type="button"
          onClick={props.onOpenParent}
          className="text-xs text-zinc-500 hover:text-white"
        >
          {concept.parent.application} /{" "}
          <span className="text-zinc-300">{concept.concept.name}</span>
        </button>
        <header className="mt-8 border-b border-white/10 pb-10">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-blue-300">{conceptStatusLabel(concept)}</span>
            <span className="font-mono text-zinc-600">{concept.scope.branch}</span>
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
            {concept.concept.name}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300">
            {concept.concept.intent}
          </p>
        </header>

        <section className="grid border-b border-white/10 md:grid-cols-2 md:divide-x md:divide-white/10">
          <ConceptStatements
            heading="What it inherits"
            items={concept.inherits}
            empty="No parent assumptions are pinned."
          />
          <ConceptStatements
            heading="What it challenges"
            items={concept.challenges}
            empty="No challenge to parent reality is declared."
          />
        </section>

        {concept.product || concept.gtm ? (
          <section className="grid border-b border-white/10 md:grid-cols-2 md:divide-x md:divide-white/10">
            <ConceptStatements
              heading="Product hypothesis"
              items={
                concept.product
                  ? [
                      concept.product.outcome,
                      ...(concept.product.hypothesis ? [concept.product.hypothesis] : []),
                    ]
                  : []
              }
              empty="No product hypothesis is declared."
            />
            <ConceptStatements
              heading="GTM hypothesis"
              items={concept.gtm ? [concept.gtm.hypothesis] : []}
              empty="No GTM hypothesis is declared."
            />
          </section>
        ) : null}

        <section className="grid gap-10 border-b border-white/10 py-10 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-medium text-white">Relationships</h2>
            {concept.relationships.length ? (
              <ul className="mt-5 divide-y divide-white/10 border-t border-white/10">
                {concept.relationships.map((relationship) => (
                  <li
                    key={`${relationship.kind}:${relationship.target}`}
                    className="flex items-center justify-between gap-4 py-4 text-sm"
                  >
                    <span className="text-zinc-500">{relationshipLabel(relationship.kind)}</span>
                    <span className="text-right text-zinc-300">{relationship.target}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-xs text-zinc-600">No relationship is declared.</p>
            )}
          </div>
          <div>
            <h2 className="text-sm font-medium text-white">Evidence</h2>
            {concept.evidence.length ? (
              <ul className="mt-5 space-y-3 text-xs text-zinc-400">
                {concept.evidence.map((evidence) => (
                  <li key={`${evidence.kind}:${evidence.ref}`} className="flex items-start gap-3">
                    <CircleDot className="mt-0.5 size-3 shrink-0 text-zinc-600" aria-hidden />
                    <span className="break-all">{evidence.ref}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-xs text-zinc-600">No supporting evidence is attached.</p>
            )}
          </div>
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-3 pt-6 text-[11px] text-zinc-600">
          <span>Parent context remains active</span>
          <span>Application truth is unchanged</span>
        </footer>
      </main>
    </ScrollArea>
  );
}

function ConceptStatements(props: {
  readonly heading: string;
  readonly items: readonly string[];
  readonly empty: string;
}) {
  return (
    <div className="px-0 py-10 md:px-8 md:first:pl-0 md:last:pr-0">
      <h2 className="text-sm font-medium text-white">{props.heading}</h2>
      {props.items.length ? (
        <ul className="mt-5 space-y-3 text-sm leading-5 text-zinc-300">
          {props.items.map((item) => (
            <li key={item} className="border-l border-white/15 pl-4">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-xs text-zinc-600">{props.empty}</p>
      )}
    </div>
  );
}

export function conceptStatusLabel(concept: CrokiConceptFile): string {
  if (concept.concept.status === "integration-proposed") return "Integration proposed";
  if (concept.concept.status === "archived") return "Archived";
  return "Exploring separately";
}

function relationshipLabel(kind: CrokiConceptFile["relationships"][number]["kind"]): string {
  if (kind === "depends-on") return "Depends on";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
