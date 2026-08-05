import type { CrokiReleaseFile } from "@croki/shared/crokiScopes";
import { CircleCheck, MoveRight } from "lucide-react";

import { ScrollArea } from "~/components/ui/scroll-area";

export function CrokiReleaseVisual(props: {
  readonly release: CrokiReleaseFile;
  readonly onOpenParent: () => void;
}) {
  const { release } = props;
  return (
    <ScrollArea className="min-h-0 flex-1 bg-black text-white">
      <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-14">
        <button
          type="button"
          onClick={props.onOpenParent}
          className="text-xs text-zinc-500 hover:text-white"
        >
          {release.parent.application} /{" "}
          <span className="text-zinc-300">{release.release.name}</span>
        </button>
        <header className="mt-8 border-b border-white/10 pb-10">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-blue-300">Release story</span>
            <span className="tabular-nums text-zinc-600">{release.release.status}</span>
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            You’re shipping {release.release.name}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300">{release.intent}</p>
        </header>

        <section className="grid items-stretch border-b border-white/10 md:grid-cols-[1fr_auto_1fr]">
          <ReleaseMoment
            label="Before"
            version={release.previous.version}
            items={release.product.before}
            fallback={release.previous.reality}
          />
          <div className="hidden items-center px-5 text-zinc-700 md:flex">
            <MoveRight className="size-4" aria-hidden />
          </div>
          <ReleaseMoment
            label="After"
            version={release.release.version}
            items={release.product.after}
            fallback={release.intent}
            active
          />
        </section>

        <div className="grid border-b border-white/10 lg:grid-cols-2 lg:divide-x lg:divide-white/10">
          <StoryList
            heading="What changes for people"
            items={release.product.changes}
            empty="No user-visible change is declared."
          />
          <StoryList
            heading="How we’ll tell the story"
            items={release.gtm.expression}
            empty="No market expression is declared."
          />
        </div>
        <div className="grid border-b border-white/10 lg:grid-cols-3 lg:divide-x lg:divide-white/10">
          <StoryList
            heading="Demo moments"
            items={release.gtm.demoMoments}
            empty="No demo moment is declared."
            compact
          />
          <StoryList
            heading="Proof required"
            items={release.proof}
            empty="No proof is declared."
            compact
          />
          <StoryList
            heading="How we’ll know"
            items={release.successSignals}
            empty="No success signal is declared."
            compact
          />
        </div>

        {(release.concepts.length > 0 || release.product.removed.length > 0) && (
          <section className="grid gap-8 border-b border-white/10 py-10 md:grid-cols-2">
            <StoryList
              heading="Concepts becoming real"
              items={release.concepts}
              empty=""
              inset={false}
            />
            <StoryList
              heading="What disappears"
              items={release.product.removed}
              empty=""
              inset={false}
            />
          </section>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 pt-6 text-[11px] text-zinc-600">
          <span>
            {release.evidence.length} evidence reference{release.evidence.length === 1 ? "" : "s"}
          </span>
          <span>Application approval remains separate from code integration</span>
        </footer>
      </main>
    </ScrollArea>
  );
}

function ReleaseMoment(props: {
  readonly label: string;
  readonly version: string;
  readonly items: readonly string[];
  readonly fallback: string;
  readonly active?: boolean;
}) {
  return (
    <div className="py-9 md:px-3 md:first:pl-0 md:last:pr-0">
      <div className="flex justify-between text-[11px]">
        <span className={props.active ? "text-blue-300" : "text-zinc-500"}>{props.label}</span>
        <span className="tabular-nums text-zinc-600">{props.version}</span>
      </div>
      <ul className="mt-5 space-y-3 text-sm leading-6 text-zinc-300">
        {(props.items.length ? props.items : [props.fallback]).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function StoryList(props: {
  readonly heading: string;
  readonly items: readonly string[];
  readonly empty: string;
  readonly compact?: boolean;
  readonly inset?: boolean;
}) {
  return (
    <section
      className={`${props.inset === false ? "" : "px-0 lg:px-8 lg:first:pl-0 lg:last:pr-0"} ${props.compact ? "py-8" : "py-10"}`}
    >
      <h2 className="text-sm font-medium">{props.heading}</h2>
      {props.items.length ? (
        <ul className="mt-5 space-y-4 text-sm leading-5 text-zinc-300">
          {props.items.map((item) => (
            <li key={item} className="flex gap-3">
              <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-zinc-600" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-xs text-zinc-600">{props.empty}</p>
      )}
    </section>
  );
}
