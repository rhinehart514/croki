import type { CrokiContextReceipt } from "@croki/shared/crokiContext";
import { CircleDot } from "lucide-react";

import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

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
  if (receipt.harnessId === "venture-v1") return "Venture";
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
