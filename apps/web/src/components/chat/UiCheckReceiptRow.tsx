import type { EnvironmentId, UiHistoryEntry } from "@croki/contracts";
import { CheckIcon, CircleAlertIcon, ImageIcon, MinusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { uiHistoryEntryLabel, uiHistoryEntryLocation } from "~/components/preview/uiHistory";
import { cn } from "~/lib/utils";
import type { UiCheckReceipt } from "../../uiCheckReceipt";
import { ConceptSetRow, type ConceptSetAction, rankConceptScreens } from "./ConceptSetRow";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";

const MAX_VISIBLE_SCREEN_THUMBNAILS = 4;

export interface UiCheckReceiptRowProps {
  readonly environmentId: EnvironmentId;
  readonly receipt: UiCheckReceipt;
  readonly onImageExpand: (preview: ExpandedImagePreview) => void;
  readonly onContinueWithSelected?: ConceptSetAction;
  readonly onRemixKept?: ConceptSetAction;
}

/**
 * Builds the same gallery shape used by user attachments, while excluding
 * attachment URLs that have not resolved. A gallery opened from one checked
 * screen can therefore include every other screen that is currently usable.
 */
export function buildUiCheckExpandedImagePreview(
  screens: ReadonlyArray<UiHistoryEntry>,
  resolvedUrls: ReadonlyMap<string, string>,
  selectedScreenId: string,
): ExpandedImagePreview | null {
  const images = screens.flatMap((screen) => {
    const src = resolvedUrls.get(screen.id);
    return src
      ? [
          {
            id: screen.id,
            src,
            name: checkedScreenImageName(screen),
          },
        ]
      : [];
  });
  const selectedIndex = images.findIndex((image) => image.id === selectedScreenId);
  if (selectedIndex < 0) return null;

  return {
    images: images.map(({ src, name }) => ({ src, name })),
    index: selectedIndex,
  };
}

function checkedScreenImageName(entry: UiHistoryEntry): string {
  const label = uiHistoryEntryLabel(entry);
  const location = uiHistoryEntryLocation(entry);
  return location && location !== label ? `${label} · ${location}` : label;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function receiptLabel(receipt: UiCheckReceipt): string {
  if (receipt.status === "checked") {
    return `Checked ${pluralize(receipt.screens.length, "screen")}`;
  }
  return receipt.status === "not-checked" ? "Not checked" : "Check unavailable";
}

function receiptDescription(receipt: UiCheckReceipt): string {
  if (receipt.status === "checked") {
    if (receipt.screens.length === 0) return "No captured screen image was retained.";
    return receipt.issueCount > 0
      ? `${pluralize(receipt.issueCount, "issue")} recorded across checked screens.`
      : "Captured screen evidence from this turn.";
  }

  const visibleFileCount = receipt.visibleFiles.length;
  const visibleFiles =
    visibleFileCount > 0 ? `${pluralize(visibleFileCount, "visible file")} changed · ` : "";
  return receipt.status === "not-checked"
    ? `${visibleFiles}no screen was captured.`
    : `${visibleFiles}screen evidence is unavailable.`;
}

function issueSummary(entry: UiHistoryEntry): string {
  const parts: string[] = [];
  if (entry.consoleErrorCount > 0) {
    parts.push(pluralize(entry.consoleErrorCount, "console error"));
  }
  if (entry.networkFailureCount > 0) {
    parts.push(pluralize(entry.networkFailureCount, "network failure"));
  }
  return parts.length > 0 ? parts.join(" · ") : "No console or network issues";
}

function screenIssueCount(entry: UiHistoryEntry): number {
  return entry.consoleErrorCount + entry.networkFailureCount;
}

function statusIcon(status: UiCheckReceipt["status"]) {
  if (status === "checked") return <CheckIcon className="size-3.5" aria-hidden />;
  if (status === "not-checked") return <MinusIcon className="size-3.5" aria-hidden />;
  return <CircleAlertIcon className="size-3.5" aria-hidden />;
}

/** A compact evidence receipt that stays inline with the canonical Thread. */
export function UiCheckReceiptRow({
  environmentId,
  receipt,
  onImageExpand,
  onContinueWithSelected,
  onRemixKept,
}: UiCheckReceiptRowProps) {
  const resolvedUrlsRef = useRef(new Map<string, string>());
  const registerAssetUrl = useCallback((screenId: string, url: string | null) => {
    if (url === null) {
      resolvedUrlsRef.current.delete(screenId);
    } else {
      resolvedUrlsRef.current.set(screenId, url);
    }
  }, []);
  const openScreen = useCallback(
    (screen: UiHistoryEntry, url: string) => {
      // The click can happen before the registration effect runs on a newly
      // resolved image, so register the selected image synchronously too.
      resolvedUrlsRef.current.set(screen.id, url);
      const preview = buildUiCheckExpandedImagePreview(
        receipt.screens,
        resolvedUrlsRef.current,
        screen.id,
      );
      if (preview) onImageExpand(preview);
    },
    [onImageExpand, receipt.screens],
  );

  const visibleScreens = receipt.screens.slice(0, MAX_VISIBLE_SCREEN_THUMBNAILS);
  const hiddenScreenCount = Math.max(0, receipt.screens.length - visibleScreens.length);
  const conceptScreens = useMemo(() => rankConceptScreens(receipt.screens), [receipt.screens]);
  const hasConceptSet = receipt.status === "checked" && conceptScreens.length >= 2;

  return (
    <section
      data-ui-check-receipt="true"
      data-ui-check-status={receipt.status}
      className="-mx-1 rounded-md px-1 py-1"
      aria-label={receiptLabel(receipt)}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center",
            receipt.status === "checked"
              ? "text-success"
              : receipt.status === "unavailable"
                ? "text-warning"
                : "text-muted-foreground",
          )}
        >
          {statusIcon(receipt.status)}
        </span>
        <span className="min-w-0 truncate font-medium text-[12px] leading-5 text-foreground">
          {receiptLabel(receipt)}
        </span>
        {receipt.status === "checked" && receipt.issueCount > 0 ? (
          <span className="ml-auto shrink-0 text-[11px] text-destructive">
            {pluralize(receipt.issueCount, "issue")}
          </span>
        ) : null}
      </div>

      <p className="ms-7 mt-0.5 text-[11px] leading-4 text-muted-foreground">
        {receiptDescription(receipt)}
      </p>

      {hasConceptSet ? (
        <ConceptSetRow
          environmentId={environmentId}
          screens={conceptScreens}
          onImageExpand={onImageExpand}
          {...(onContinueWithSelected ? { onContinueWithSelected } : {})}
          {...(onRemixKept ? { onRemixKept } : {})}
        />
      ) : receipt.status === "checked" && visibleScreens.length > 0 ? (
        <div
          className="ms-7 mt-2 flex max-w-full gap-2 overflow-x-auto pb-0.5"
          data-ui-check-filmstrip="true"
          role="group"
          aria-label="Checked screen evidence"
        >
          {visibleScreens.map((screen) => (
            <UiCheckScreenThumbnail
              key={screen.id}
              environmentId={environmentId}
              screen={screen}
              onAssetUrlChange={registerAssetUrl}
              onOpen={openScreen}
            />
          ))}
          {hiddenScreenCount > 0 ? (
            <div className="flex min-w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border/70 px-2 text-center text-[11px] text-muted-foreground">
              {pluralize(hiddenScreenCount, "more screen")}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function UiCheckScreenThumbnail(props: {
  readonly environmentId: EnvironmentId;
  readonly screen: UiHistoryEntry;
  readonly onAssetUrlChange: (screenId: string, url: string | null) => void;
  readonly onOpen: (screen: UiHistoryEntry, url: string) => void;
}) {
  const { environmentId, screen, onAssetUrlChange, onOpen } = props;
  const asset = useAssetUrlState(environmentId, {
    _tag: "attachment",
    attachmentId: screen.attachmentId,
  });
  const assetUrl = asset._tag === "Success" ? asset.url : null;

  useEffect(() => {
    onAssetUrlChange(screen.id, assetUrl);
    return () => onAssetUrlChange(screen.id, null);
  }, [assetUrl, onAssetUrlChange, screen.id]);

  const label = uiHistoryEntryLabel(screen);
  const location = uiHistoryEntryLocation(screen);
  const issues = issueSummary(screen);
  const issueCount = screenIssueCount(screen);

  return (
    <article
      data-ui-check-screen={screen.id}
      className="w-40 shrink-0 overflow-hidden rounded-md border border-border/70 bg-card/45"
    >
      {asset._tag === "Success" ? (
        <button
          type="button"
          className="block h-24 w-full cursor-zoom-in overflow-hidden border-b border-border/60 bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={`Open ${label} checked screen in gallery`}
          onClick={() => onOpen(screen, asset.url)}
        >
          <img
            src={asset.url}
            alt={`Checked screen: ${label}`}
            className="size-full object-cover object-top"
            draggable={false}
            referrerPolicy="no-referrer"
          />
        </button>
      ) : (
        <div
          data-ui-check-image-state={asset._tag === "Loading" ? "loading" : "failure"}
          className="flex h-24 items-center justify-center gap-1.5 border-b border-border/60 bg-black/40 px-2 text-center text-[10px] text-muted-foreground"
          {...(asset._tag === "Loading" ? { role: "status" } : {})}
          aria-label={
            asset._tag === "Loading"
              ? "Loading checked screen image"
              : "Checked screen image unavailable"
          }
        >
          <ImageIcon className="size-3.5 shrink-0" aria-hidden />
          <span>{asset._tag === "Loading" ? "Loading image…" : "Image unavailable"}</span>
        </div>
      )}
      <div className="min-w-0 px-2 py-1.5">
        <p
          className="truncate text-[11px] font-medium leading-4 text-foreground"
          title={screen.title || screen.url}
        >
          {label}
        </p>
        <p className="truncate text-[10px] leading-4 text-muted-foreground" title={screen.url}>
          {location}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] leading-4 text-muted-foreground/80">
          <span className="shrink-0 tabular-nums">
            {screen.width}×{screen.height}
          </span>
          <span aria-hidden>·</span>
          <span
            className={cn("min-w-0 truncate", issueCount > 0 && "text-destructive")}
            title={issues}
          >
            {issueCount > 0 ? pluralize(issueCount, "issue") : "No issues"}
          </span>
        </div>
      </div>
    </article>
  );
}
