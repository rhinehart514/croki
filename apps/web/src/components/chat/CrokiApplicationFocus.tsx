import type { CrokiApplication } from "@croki/shared/crokiApplication";
import { ArrowRight, CircleDot } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import {
  applicationFocusLabel,
  type CrokiApplicationState,
} from "./CrokiApplicationPresentation.logic";

export function CrokiApplicationFocus(props: {
  readonly state: CrokiApplicationState | null;
  readonly onOpenSource: (relativePath: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const state = props.state;

  if (!state || state.status === "loading" || state.status === "absent") {
    return null;
  }

  if (state.status !== "loaded") {
    const problem = applicationProblemLabel(state.status);
    if ("sourcePath" in state) {
      const { sourcePath } = state;
      return (
        <button
          type="button"
          aria-label={`${problem}. Open ${sourcePath} to repair it.`}
          className="shrink-0 rounded-sm text-xs text-amber-500 transition-colors hover:text-amber-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => props.onOpenSource(sourcePath)}
        >
          {problem}
        </button>
      );
    }
    return (
      <span
        className="shrink-0 text-xs text-amber-500"
        title={`${problem}. Development continues without application direction.`}
      >
        {problem}
      </span>
    );
  }

  const { application, sourcePath } = state;
  const label = applicationFocusLabel(application);
  const description = applicationFocusDescription(application);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${description} Open application focus.`}
            className="inline-flex h-7 max-w-56 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <CircleDot className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate tabular-nums">{label}</span>
      </PopoverTrigger>
      <PopoverPopup
        align="start"
        side="bottom"
        className="w-[28rem] max-w-[calc(100vw-1.5rem)] p-0"
        viewportClassName="p-4"
      >
        <ApplicationFocusDetails application={application} />
        <div className="mt-4 flex justify-end border-t border-border/70 pt-3">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setOpen(false);
              props.onOpenSource(sourcePath);
            }}
          >
            Open .croki
          </Button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export function ApplicationFocusDetails(props: { readonly application: CrokiApplication }) {
  const { application, building, released } = props.application;
  const focusItems = (building?.product ?? []).slice(0, 3);

  return (
    <div className="grid gap-4 text-xs">
      <header className="grid gap-1.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Application direction
        </p>
        <h2 className="text-base font-semibold text-foreground">{application.name}</h2>
        {application.promise ? (
          <p className="max-w-[48ch] leading-5 text-muted-foreground">{application.promise}</p>
        ) : null}
      </header>

      {building ? (
        <section aria-labelledby="croki-building-focus" className="grid gap-2">
          <div className="flex items-center gap-2">
            <h3 id="croki-building-focus" className="font-medium text-foreground">
              Building {building.version}
            </h3>
            {released ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                from {released.version}
                <ArrowRight className="size-3" aria-hidden />
              </span>
            ) : null}
          </div>
          <p className="leading-5 text-foreground/90">{building.intent}</p>
          {focusItems.length ? (
            <ul className="grid gap-1.5 text-muted-foreground">
              {focusItems.map((item) => (
                <li key={item} className="grid grid-cols-[0.5rem_1fr] gap-1.5 leading-4">
                  <span aria-hidden>·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : released ? (
        <section aria-labelledby="croki-released-focus" className="grid gap-1.5">
          <h3 id="croki-released-focus" className="font-medium text-foreground">
            Released {released.version}
          </h3>
          <p className="leading-5 text-muted-foreground">{released.summary}</p>
        </section>
      ) : null}

      <p className="text-[11px] leading-4 text-muted-foreground/70">
        Project-declared in .croki/application.croki and carried into project Threads.
      </p>
    </div>
  );
}

function applicationFocusDescription(application: CrokiApplication): string {
  const label = applicationFocusLabel(application);
  const intent = application.building?.intent ?? application.released?.summary;
  return `${application.application.name} ${label}.${intent ? ` ${intent}` : ""}`;
}

function applicationProblemLabel(
  status: Exclude<CrokiApplicationState["status"], "loaded" | "loading" | "absent">,
): string {
  switch (status) {
    case "invalid":
      return ".croki invalid";
    case "oversized":
      return ".croki too large";
    case "truncated":
      return ".croki truncated";
    case "unavailable":
      return ".croki unavailable";
  }
}
