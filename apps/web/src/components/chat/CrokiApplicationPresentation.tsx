import type { CrokiApplication, CrokiApplicationSource } from "@croki/shared/crokiApplication";
import { CircleDot } from "lucide-react";

import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import type { CrokiApplicationState } from "./CrokiApplicationPresentation.logic";

export function CrokiApplicationIndicator(props: {
  readonly state: CrokiApplicationState;
  readonly workspaceRoot?: string | null | undefined;
}) {
  const workspace = props.workspaceRoot ? workspaceLabel(props.workspaceRoot) : null;
  if (props.state.status === "absent" || props.state.status === "loading") {
    return null;
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
    <Popover>
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
      <PopoverPopup align="start" side="bottom" className="w-80 p-0" viewportClassName="p-3">
        <ApplicationDetails application={application} />
      </PopoverPopup>
    </Popover>
  );
}

function ApplicationDetails(props: { readonly application: CrokiApplication }) {
  const { released, building } = props.application;
  return (
    <div className="grid gap-3 text-xs">
      <p className="font-medium text-foreground">{props.application.application.name}</p>
      <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1.5 text-muted-foreground">
        {released ? (
          <>
            <dt>Released</dt>
            <dd className="text-foreground tabular-nums">{released.version}</dd>
          </>
        ) : null}
        {building ? (
          <>
            <dt>Building</dt>
            <dd className="text-foreground tabular-nums">{building.version}</dd>
            <dt>Intent</dt>
            <dd className="text-foreground">{building.intent}</dd>
          </>
        ) : null}
        <dt>Sources</dt>
        <dd className="text-foreground">
          {released?.sources.length
            ? released.sources.map(applicationSourceLabel).join(" · ")
            : "Project file"}
        </dd>
      </dl>
      {released ? <p className="leading-4 text-muted-foreground">{released.summary}</p> : null}
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

function versionDescription(application: CrokiApplication): string {
  if (application.released && application.building) {
    return `released ${application.released.version}, building ${application.building.version}.`;
  }
  if (application.released) return `released ${application.released.version}.`;
  return `building the first declared version, ${application.building?.version ?? "unknown"}.`;
}

function applicationSourceLabel(source: CrokiApplicationSource): string {
  if (source.kind === "git-tag") return `Git tag ${source.ref}`;
  if (source.kind === "file") return source.path;
  try {
    const host = new URL(source.url).hostname;
    return host === "github.com" ? "GitHub release" : `${host} release`;
  } catch {
    return "Release link";
  }
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
