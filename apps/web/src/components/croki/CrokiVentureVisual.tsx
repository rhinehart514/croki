import type { CrokiVentureFile } from "@croki/shared/crokiScopes";
import { ArrowRight, CircleDot } from "lucide-react";

import { ScrollArea } from "~/components/ui/scroll-area";

export function CrokiVentureVisual(props: { readonly venture: CrokiVentureFile }) {
  const { venture } = props;
  return (
    <ScrollArea className="min-h-0 flex-1 bg-black text-white">
      <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-14">
        <header className="border-b border-white/10 pb-10">
          <p className="text-xs text-blue-300">Venture</p>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            {venture.venture.name}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300">
            {venture.venture.thesis}
          </p>
        </header>

        <section className="border-b border-white/10 py-12">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-medium">Applications</h2>
            <span className="text-xs text-zinc-600">
              Shared advantages, independent product worlds
            </span>
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {venture.applications.map((application) => (
              <article key={application.id} className="border border-white/10 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-medium">{application.name}</h3>
                  <ArrowRight className="size-3.5 text-zinc-600" aria-hidden />
                </div>
                {application.relationship ? (
                  <p className="mt-3 text-xs leading-5 text-zinc-500">{application.relationship}</p>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <div className="grid border-b border-white/10 lg:grid-cols-3 lg:divide-x lg:divide-white/10">
          <VentureList heading="Shared audience" items={venture.audience} />
          <VentureList heading="Distribution advantages" items={venture.distribution} />
          <VentureList heading="Business model" items={venture.businessModel} />
        </div>
        <div className="grid border-b border-white/10 lg:grid-cols-2 lg:divide-x lg:divide-white/10">
          <VentureList heading="Reusable capabilities" items={venture.capabilities} />
          <VentureList heading="Inherited constraints" items={venture.constraints} />
        </div>
        <div className="grid border-b border-white/10 lg:grid-cols-2 lg:divide-x lg:divide-white/10">
          <VentureList heading="Cross-product opportunities" items={venture.opportunities} />
          <VentureList heading="Conflicts to resolve" items={venture.conflicts} />
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 pt-6 text-[11px] text-zinc-600">
          <span>
            {venture.evidence.length} evidence reference{venture.evidence.length === 1 ? "" : "s"}
          </span>
          <span>Only relevant venture perception flows into each application</span>
        </footer>
      </main>
    </ScrollArea>
  );
}

function VentureList(props: { readonly heading: string; readonly items: readonly string[] }) {
  return (
    <section className="px-0 py-9 lg:px-8 lg:first:pl-0 lg:last:pr-0">
      <h2 className="text-sm font-medium">{props.heading}</h2>
      {props.items.length ? (
        <ul className="mt-5 space-y-3 text-sm leading-5 text-zinc-300">
          {props.items.map((item) => (
            <li key={item} className="flex gap-3">
              <CircleDot className="mt-1 size-3 shrink-0 text-zinc-600" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-xs text-zinc-600">Nothing declared.</p>
      )}
    </section>
  );
}
