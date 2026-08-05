import type { CrokiApplication } from "@croki/shared/crokiApplication";
import { ArrowRight, CircleDot } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import type { CrokiApplicationState } from "./CrokiApplicationPresentation.logic";

export function CrokiApplicationIndicator(props: {
  readonly state: CrokiApplicationState;
  readonly workspaceRoot?: string | null | undefined;
  readonly onSetup?: (() => void) | undefined;
  readonly onExplore?: (() => void) | undefined;
  readonly onInspectSource?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const workspace = props.workspaceRoot ? workspaceLabel(props.workspaceRoot) : null;
  if (props.state.status === "loading") {
    return null;
  }
  if (props.state.status === "absent") {
    return props.onSetup ? (
      <Button size="xs" variant="ghost" onClick={props.onSetup}>
        Set application direction
      </Button>
    ) : null;
  }
  if (props.state.status !== "loaded") {
    const label = applicationProblemLabel(props.state.status);
    return (
      <div
        title={`${label}. Native turns continue without application lineage.`}
        className="flex h-8 min-w-0 max-w-64 shrink-0 items-center gap-1.5 px-2 text-xs text-amber-500"
      >
        <CircleDot className="size-3.5 shrink-0" aria-hidden />
        <span className="whitespace-nowrap">{label}</span>
        {workspace ? (
          <span className="truncate text-muted-foreground/60">· {workspace}</span>
        ) : null}
      </div>
    );
  }

  const { application } = props.state;
  const versionLabel = applicationVersionLabel(application);
  const description = `${application.application.name}: ${versionDescription(application)} The next turn will receive this application lineage.`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${description} Inspect application lineage.`}
            title={description}
            className="flex h-8 min-w-0 max-w-72 shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground/80 hover:text-foreground"
          />
        }
      >
        <CircleDot className="size-3.5 shrink-0" aria-hidden />
        <span className="whitespace-nowrap tabular-nums">{versionLabel}</span>
        {workspace ? (
          <span className="truncate text-muted-foreground/60">· {workspace}</span>
        ) : null}
      </PopoverTrigger>
      <PopoverPopup
        align="start"
        side="bottom"
        className="w-[32rem] max-w-[calc(100vw-1.5rem)] p-0"
        viewportClassName="p-4"
      >
        <ApplicationDetails application={application} />
        {props.onExplore || props.onInspectSource ? (
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
            {props.onExplore ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  props.onExplore?.();
                }}
              >
                Shape in Thread
              </Button>
            ) : (
              <span />
            )}
            {props.onInspectSource ? (
              <Button
                size="sm"
                onClick={() => {
                  setOpen(false);
                  props.onInspectSource?.();
                }}
              >
                Open application
              </Button>
            ) : null}
          </div>
        ) : null}
      </PopoverPopup>
    </Popover>
  );
}

export function ApplicationDetails(props: { readonly application: CrokiApplication }) {
  const { released, building } = props.application;
  const outcomes = (building?.product ?? released?.product ?? []).slice(0, 3);
  const hiddenOutcomeCount = Math.max(
    0,
    (building?.product.length ?? released?.product.length ?? 0) - outcomes.length,
  );
  return (
    <div className="grid gap-6 text-xs">
      <header>
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-blue-300/80">
          {props.application.application.name} · {building?.version ?? released?.version}
        </p>
        <h2 className="mt-3 text-[22px] font-semibold leading-7 tracking-tight text-foreground">
          {releaseCoverHeadline(props.application)}
        </h2>
        {building ? (
          <p className="mt-3 max-w-[46ch] text-[13px] leading-5 text-muted-foreground">
            {building.intent}
          </p>
        ) : null}
        {released && building ? (
          <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground/70">
            <span className="tabular-nums">{released.version}</span>
            <ArrowRight className="size-3" aria-hidden />
            <span className="tabular-nums text-blue-300/80">{building.version}</span>
          </div>
        ) : null}
      </header>

      {outcomes.length ? (
        <section aria-labelledby="application-release-outcomes" className="grid gap-3">
          <h3
            id="application-release-outcomes"
            className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            What changes
          </h3>
          <ol className="grid border-y border-border/60">
            {outcomes.map((outcome, index) => (
              <li
                key={outcome}
                className="grid grid-cols-[1.5rem_1fr] gap-3 border-b border-border/50 py-3 last:border-b-0"
              >
                <span className="text-[10px] tabular-nums text-blue-300/60">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="leading-4 text-foreground">{outcome}</span>
              </li>
            ))}
          </ol>
          {hiddenOutcomeCount ? (
            <p className="text-[11px] text-muted-foreground">
              +{hiddenOutcomeCount} more in the .croki source
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-3 text-[11px] text-muted-foreground/70">
        <span>
          {building?.successSignals.length ?? 0} proof signals · {building?.gtm.length ?? 0} market
          consequences
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <CircleDot className="size-3" aria-hidden /> Project-declared
        </span>
      </div>
    </div>
  );
}

function applicationVersionLabel(application: CrokiApplication): string {
  if (application.released && application.building) {
    return `${application.released.version} → ${application.building.version}`;
  }
  if (application.released) return application.released.version;
  return `Building ${application.building?.version ?? "unknown"}`;
}

function releaseCoverHeadline(application: CrokiApplication): string {
  const marketLead = application.building?.gtm[0];
  if (marketLead) {
    const separator = marketLead.indexOf(":");
    const projected = separator >= 0 ? marketLead.slice(separator + 1).trim() : marketLead;
    if (projected.length >= 20 && projected.length <= 120) {
      return projected.charAt(0).toUpperCase() + projected.slice(1);
    }
  }
  return application.building?.intent ?? application.released?.summary ?? "Application direction";
}

function versionDescription(application: CrokiApplication): string {
  if (application.released && application.building) {
    return `released ${application.released.version}, building ${application.building.version}.`;
  }
  if (application.released) return `released ${application.released.version}.`;
  return `building the first declared version, ${application.building?.version ?? "unknown"}.`;
}

function applicationProblemLabel(
  status: Exclude<CrokiApplicationState["status"], "loaded" | "absent" | "loading">,
): string {
  if (status === "invalid") return "Application invalid";
  if (status === "oversized") return "Application oversized";
  if (status === "truncated") return "Application truncated";
  return "Application unavailable";
}

function workspaceLabel(root: string): string {
  const normalized = root.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || root;
}
