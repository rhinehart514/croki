import { type CrokiApplication, type CrokiApplicationSource } from "@croki/shared/crokiApplication";
import { CircleDot } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";

export function CrokiApplicationVisual(props: {
  readonly application: CrokiApplication;
  readonly concepts?: ReactNode;
  readonly parentScopes?: ReactNode;
  readonly onShapeApplication?: (() => void) | undefined;
}) {
  const { application, released, building } = props.application;
  const releaseLabel = released && building ? `${released.version} → ${building.version}` : null;
  return (
    <ScrollArea className="min-h-0 flex-1 bg-black text-white">
      <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-14">
        <header className="grid gap-8 border-b border-white/10 pb-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>{application.name}</span>
              {releaseLabel ? <span className="tabular-nums">{releaseLabel}</span> : null}
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-4xl">
              {applicationHeadline(props.application)}
            </h1>
            {building ? (
              <p className="mt-5 max-w-3xl text-sm leading-6 text-zinc-400">{building.intent}</p>
            ) : null}
          </div>
          {props.onShapeApplication ? (
            <Button
              className="justify-self-start md:justify-self-end"
              onClick={props.onShapeApplication}
            >
              Shape in Thread
            </Button>
          ) : null}
        </header>

        <section className="grid border-b border-white/10 md:grid-cols-2 md:divide-x md:divide-white/10">
          <ReleaseState
            label="In the world"
            version={released?.version}
            text={released?.summary ?? "No released reality has been declared yet."}
            muted={!released}
          />
          <ReleaseState
            label="In motion"
            version={building?.version}
            text={building?.intent ?? "No release transition is active."}
            muted={!building}
            active
          />
        </section>

        {props.parentScopes ? (
          <section className="border-b border-white/10 py-10">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-medium text-white">Larger story</h2>
              <span className="text-xs text-zinc-600">Release and Venture scopes</span>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">{props.parentScopes}</div>
          </section>
        ) : null}

        <section
          className="border-b border-white/10 py-12"
          aria-labelledby="croki-concepts-heading"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="croki-concepts-heading" className="text-base font-medium text-white">
              Concepts
            </h2>
            <span className="text-xs text-zinc-600">Independent explorations</span>
          </div>
          <div className="mt-8 grid justify-items-center">
            <div className="border border-white/20 px-5 py-3 text-center">
              <p className="text-sm font-medium text-white">{application.name}</p>
              <p className="mt-1 text-[11px] tabular-nums text-zinc-500">
                {building?.version
                  ? `Building ${building.version}`
                  : `Released ${released?.version}`}
              </p>
            </div>
            <div className="h-8 w-px bg-white/15" aria-hidden />
            {props.concepts ? (
              <div className="relative grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div
                  className="absolute left-[16.66%] right-[16.66%] top-0 hidden h-px bg-white/15 lg:block"
                  aria-hidden
                />
                {props.concepts}
              </div>
            ) : (
              <p className="border-t border-white/10 pt-5 text-center text-xs text-zinc-600">
                No Concepts are being explored separately.
              </p>
            )}
          </div>
        </section>

        <div className="grid border-b border-white/10 lg:grid-cols-2 lg:divide-x lg:divide-white/10">
          <ApplicationList
            heading="What people will experience"
            empty="No product change has been declared."
            items={building?.product ?? released?.product ?? []}
          />
          <ApplicationList
            heading="How the market changes"
            empty="No market consequence has been declared."
            items={building?.gtm ?? released?.gtm ?? []}
          />
        </div>

        <section className="grid gap-8 border-b border-white/10 py-10 lg:grid-cols-2">
          <ApplicationList
            compact
            heading="How we will know"
            empty="No success signal has been declared."
            items={building?.successSignals ?? []}
          />
          <div>
            <h2 className="text-sm font-medium text-white">Evidence</h2>
            {released?.sources.length ? (
              <ul className="mt-5 space-y-3 text-xs text-zinc-400">
                {released.sources.map((source) => (
                  <li key={sourceKey(source)} className="flex items-start gap-3">
                    <CircleDot className="mt-0.5 size-3 shrink-0 text-zinc-600" aria-hidden />
                    <span className="break-all">{sourceLabel(source)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-xs text-zinc-600">No supporting source is declared.</p>
            )}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 pt-6 text-[11px] text-zinc-600">
          <span>Project-declared application reality</span>
          <span>Application awareness is active</span>
        </footer>
      </main>
    </ScrollArea>
  );
}

function ReleaseState(props: {
  readonly label: string;
  readonly version?: string | undefined;
  readonly text: string;
  readonly active?: boolean;
  readonly muted?: boolean;
}) {
  return (
    <div className="px-0 py-8 md:px-8 md:first:pl-0 md:last:pr-0">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className={props.active ? "text-blue-300" : "text-zinc-500"}>{props.label}</span>
        {props.version ? <span className="tabular-nums text-zinc-600">{props.version}</span> : null}
      </div>
      <p
        className={cn(
          "mt-4 max-w-xl text-sm leading-6",
          props.muted ? "text-zinc-600" : "text-zinc-300",
        )}
      >
        {props.text}
      </p>
    </div>
  );
}

function ApplicationList(props: {
  readonly heading: string;
  readonly items: readonly string[];
  readonly empty: string;
  readonly compact?: boolean;
}) {
  return (
    <section className={cn(props.compact ? "" : "px-0 py-10 lg:px-8 lg:first:pl-0 lg:last:pr-0")}>
      <h2 className="text-sm font-medium text-white">{props.heading}</h2>
      {props.items.length ? (
        <ol className="mt-5 divide-y divide-white/10 border-t border-white/10">
          {props.items.map((item, index) => (
            <li key={item} className="grid grid-cols-[2rem_1fr] gap-3 py-4 text-sm leading-5">
              <span className="tabular-nums text-zinc-700">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-zinc-300">{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 text-xs text-zinc-600">{props.empty}</p>
      )}
    </section>
  );
}

function applicationHeadline(application: CrokiApplication): string {
  const marketLead = application.building?.gtm[0];
  if (marketLead) {
    const separator = marketLead.indexOf(":");
    const projected = separator >= 0 ? marketLead.slice(separator + 1).trim() : marketLead;
    if (projected.length >= 20 && projected.length <= 120)
      return projected.charAt(0).toUpperCase() + projected.slice(1);
  }
  return application.building?.intent ?? application.released?.summary ?? "Application direction";
}

function sourceKey(source: CrokiApplicationSource): string {
  return source.kind === "git-tag"
    ? `git:${source.ref}`
    : source.kind === "release-url"
      ? `url:${source.url}`
      : `file:${source.path}`;
}

function sourceLabel(source: CrokiApplicationSource): string {
  if (source.kind === "git-tag") return `Git tag ${source.ref}`;
  if (source.kind === "release-url") return source.url;
  return source.path;
}
