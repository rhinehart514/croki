import type { CrokiContextReceipt } from "@croki/shared/crokiContext";
import { CircleDot } from "lucide-react";

import { cn } from "~/lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import type { CrokiComposerContextState } from "./CrokiContextPresentation.logic";

export function CrokiComposerContextIndicator(props: {
  readonly compact: boolean;
  readonly state: CrokiComposerContextState;
  readonly workspaceKind?: "project" | "worktree" | undefined;
  readonly workspaceRoot?: string | null | undefined;
}) {
  const presentation = composerPresentation(props.state, props.compact);
  const workspaceDescription = props.workspaceRoot
    ? ` Context source: active ${props.workspaceKind ?? "project"} ${props.workspaceRoot}.`
    : "";
  const description = `${presentation.description}${workspaceDescription}`;
  return (
    <div
      aria-label={description}
      title={description}
      data-croki-workspace-root={props.workspaceRoot ?? undefined}
      className={cn(
        "flex h-8 min-w-0 max-w-64 shrink-0 items-center gap-1.5 px-2 text-xs",
        presentation.problem ? "text-amber-500" : "text-muted-foreground/80",
      )}
    >
      <CircleDot className="size-3.5 shrink-0" aria-hidden />
      <span className="whitespace-nowrap">{presentation.label}</span>
      {props.workspaceRoot ? (
        <span className="truncate text-muted-foreground/60">
          · {props.workspaceKind === "worktree" ? "worktree " : ""}
          {workspaceLabel(props.workspaceRoot)}
        </span>
      ) : null}
    </div>
  );
}

export function CrokiAppliedContextReceipt(props: {
  readonly receipt: CrokiContextReceipt | null;
}) {
  if (!props.receipt) return null;
  const { receipt } = props;
  const parts = [harnessLabel(receipt), appliedStatusLabel(receipt)];
  if (receipt.status === "loaded" || receipt.status === "partial") {
    if (receipt.releaseVersion) parts.push(`Release ${receipt.releaseVersion}`);
    parts.push(`${receipt.includedCount ?? receipt.currentCount} approved`);
    if (receipt.truncated) parts.push("partial");
    if (receipt.selectionMode === "focused") parts.push("turn-focused");
  }
  if (receipt.sha256) parts.push(receipt.sha256.slice(0, 8));
  if (receipt.updatedAt) parts.push(formatUpdatedAt(receipt.updatedAt));
  const label = parts.join(" · ");
  const detail = [
    `Project context status: ${receipt.status}`,
    `Current: ${receipt.currentCount}`,
    `Proposals excluded: ${receipt.provisionalCount}`,
    `Truncated: ${receipt.truncated ? "yes" : "no"}`,
    receipt.releaseVersion
      ? `Release: ${receipt.releaseVersion} (${receipt.releaseItemCount ?? 0} active items)`
      : null,
    receipt.issueCount !== undefined ? `Omitted invalid entries: ${receipt.issueCount}` : null,
    receipt.includedCount !== undefined ? `Included: ${receipt.includedCount}` : null,
    receipt.omittedCount !== undefined ? `Context omitted: ${receipt.omittedCount}` : null,
    receipt.sha256 ? `SHA-256: ${receipt.sha256}` : null,
    receipt.updatedAt ? `Updated: ${receipt.updatedAt}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(". ");

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-croki-context-receipt={receipt.status}
            aria-label={`${detail}. Inspect turn setup.`}
            className="flex max-w-[80%] items-center gap-1 pe-1 text-[11px] text-muted-foreground/70 hover:text-foreground"
          />
        }
      >
        <CircleDot className="size-3 shrink-0" aria-hidden />
        <span className="truncate tabular-nums">{label}</span>
      </PopoverTrigger>
      <PopoverPopup align="start" side="bottom" className="w-72 p-0" viewportClassName="p-3">
        <div className="grid gap-2 text-xs">
          <p className="font-medium text-foreground">Turn setup</p>
          <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5 text-muted-foreground">
            <dt>Behavior</dt>
            <dd className="text-foreground">{harnessLabel(receipt)}</dd>
            <dt>Context</dt>
            <dd className="text-foreground">{appliedStatusLabel(receipt)}</dd>
            <dt>Approved</dt>
            <dd className="text-foreground tabular-nums">
              {receipt.includedCount ?? receipt.currentCount} included
            </dd>
            <dt>Proposals</dt>
            <dd className="text-foreground tabular-nums">{receipt.provisionalCount} excluded</dd>
            <dt>Capability</dt>
            <dd className="text-foreground">{capabilityLabel(receipt)}</dd>
            {receipt.releaseVersion ? (
              <>
                <dt>Release</dt>
                <dd className="text-foreground">
                  {receipt.releaseVersion} · {receipt.releaseItemCount ?? 0} active
                </dd>
              </>
            ) : null}
            {receipt.sha256 ? (
              <>
                <dt>Snapshot</dt>
                <dd className="truncate font-mono text-foreground">
                  {receipt.sha256.slice(0, 12)}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function composerPresentation(
  state: CrokiComposerContextState,
  compact: boolean,
): { readonly description: string; readonly label: string; readonly problem: boolean } {
  switch (state.status) {
    case "partial": {
      const counts = compact ? state.currentCount : `${state.currentCount} approved`;
      return {
        label: `Context ${counts} · ${state.issueCount} invalid`,
        description: `The next turn will use valid approved project-context entries. Proposals stay excluded. ${state.issueCount} invalid entr${
          state.issueCount === 1 ? "y was" : "ies were"
        } omitted.`,
        problem: true,
      };
    }
    case "loaded": {
      if (!state.included) {
        return {
          label: "Context empty",
          description: "Project context has no approved entries for the next turn.",
          problem: false,
        };
      }
      const counts = compact ? state.currentCount : `${state.currentCount} approved`;
      const suffix = state.promptTruncated ? " · partial" : "";
      if (state.releaseVersion) {
        return {
          label: `Release ${state.releaseVersion}${suffix}`,
          description: `The next turn will include the active ${state.releaseVersion} release candidate and ${state.currentCount} approved project-context item${state.currentCount === 1 ? "" : "s"}. ${state.provisionalCount} proposal${state.provisionalCount === 1 ? " is" : "s are"} excluded${state.promptTruncated ? ", and approved context is truncated to the provider limit" : ""}.`,
          problem: false,
        };
      }
      return {
        label: `Context ${counts}${suffix}`,
        description: `The next turn will include ${state.currentCount} approved project-context item${state.currentCount === 1 ? "" : "s"}. ${state.provisionalCount} proposal${state.provisionalCount === 1 ? " is" : "s are"} excluded${state.promptTruncated ? ", and approved context is truncated to the provider limit" : ""}.`,
        problem: false,
      };
    }
    case "loading":
      return {
        label: "Context checking",
        description: "Checking project context for the next turn.",
        problem: false,
      };
    case "absent":
      return {
        label: "No context",
        description: "No project context will be included in the next turn.",
        problem: false,
      };
    case "invalid":
      return {
        label: "Context invalid",
        description: `Project context will not be included in the next turn because it is invalid (${state.errorCode}).`,
        problem: true,
      };
    case "oversized":
      return {
        label: "Context oversized",
        description: "Project context exceeds its source limit and will not be included.",
        problem: true,
      };
    case "truncated":
      return {
        label: "Context truncated",
        description:
          "The workspace returned only part of project context, so it will not be included.",
        problem: true,
      };
    case "unavailable":
      return {
        label: "Context unavailable",
        description: "Project context could not be read. The next turn can continue without it.",
        problem: true,
      };
  }
}

function appliedStatusLabel(receipt: CrokiContextReceipt): string {
  switch (receipt.status) {
    case "loaded":
      return "Context applied";
    case "partial":
      return `Context applied with ${receipt.issueCount ?? 0} omitted issue${
        receipt.issueCount === 1 ? "" : "s"
      }`;
    case "absent":
      return "No context applied";
    case "invalid":
      return `Context invalid${receipt.errorCode ? ` (${receipt.errorCode})` : ""}`;
    case "oversized":
      return "Context oversized";
  }
}

function harnessLabel(receipt: CrokiContextReceipt): string {
  if (receipt.harnessId === "product-v1") return "Product";
  if (receipt.harnessId === "gtm-v1") return "GTM";
  return "Native";
}

function capabilityLabel(receipt: CrokiContextReceipt): string {
  return receipt.harnessId === "product-v1" || receipt.harnessId === "gtm-v1"
    ? "Native provider tools + Canvas"
    : "Native provider tools";
}

function formatUpdatedAt(value: string): string {
  return value.slice(0, 16).replace("T", " ");
}

function workspaceLabel(root: string): string {
  const normalized = root.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || root;
}
