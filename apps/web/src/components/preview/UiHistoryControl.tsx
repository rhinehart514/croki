"use client";

import type { EnvironmentId, UiHistoryEntry } from "@croki/contracts";
import { History, ImageIcon } from "lucide-react";
import { useState } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { ExpandedImageDialog } from "~/components/chat/ExpandedImageDialog";
import type { ExpandedImagePreview } from "~/components/chat/ExpandedImagePreview";
import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";

import { uiHistoryEntryLabel, uiHistoryEntryLocation } from "./uiHistory";

interface Props {
  environmentId: EnvironmentId;
  entries: ReadonlyArray<UiHistoryEntry>;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function observedAtLabel(observedAt: string): string {
  const timestamp = Date.parse(observedAt);
  return Number.isFinite(timestamp) ? dateFormatter.format(timestamp) : "Time unavailable";
}

export function UiHistoryControl({ environmentId, entries }: Props) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ExpandedImagePreview | null>(null);
  const visibleEntries = entries.slice(0, 12);

  if (entries.length === 0) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="xs"
              aria-label={`UI history, ${entries.length} recent checked screen${entries.length === 1 ? "" : "s"}`}
              type="button"
            />
          }
        >
          <History aria-hidden />
          <span className="tabular-nums">{entries.length}</span>
        </PopoverTrigger>
        <PopoverPopup
          side="bottom"
          align="end"
          className="w-[22rem] max-w-[calc(100vw-1rem)] p-0"
          viewportClassName="p-0"
        >
          <div className="border-b border-border/70 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">UI history</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Recent screens checked in this Thread
            </p>
          </div>
          <div className="max-h-[28rem] overflow-y-auto p-1.5">
            {visibleEntries.map((entry) => (
              <UiHistoryItem
                key={entry.id}
                environmentId={environmentId}
                entry={entry}
                onOpen={(url) => {
                  setOpen(false);
                  setPreview({
                    images: [
                      {
                        src: url,
                        name: `${uiHistoryEntryLabel(entry)} · ${observedAtLabel(entry.observedAt)}`,
                      },
                    ],
                    index: 0,
                  });
                }}
              />
            ))}
          </div>
          {entries.length > visibleEntries.length ? (
            <p className="border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
              Showing {visibleEntries.length} most recent
            </p>
          ) : null}
        </PopoverPopup>
      </Popover>
      {preview ? <ExpandedImageDialog preview={preview} onClose={() => setPreview(null)} /> : null}
    </>
  );
}

function UiHistoryItem(props: {
  environmentId: EnvironmentId;
  entry: UiHistoryEntry;
  onOpen: (url: string) => void;
}) {
  const asset = useAssetUrlState(props.environmentId, {
    _tag: "attachment",
    attachmentId: props.entry.attachmentId,
  });
  const url = asset._tag === "Success" ? asset.url : null;
  const issueCount = props.entry.consoleErrorCount + props.entry.networkFailureCount;
  const imageStatus = asset._tag === "Loading" ? "Loading image" : "Image unavailable";
  const entryLabel = uiHistoryEntryLabel(props.entry);
  const observedLabel = observedAtLabel(props.entry.observedAt);
  return (
    <button
      type="button"
      className="grid w-full grid-cols-[5rem_minmax(0,1fr)] gap-2 rounded-md p-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-64"
      aria-label={
        url
          ? `Open ${entryLabel} checked ${observedLabel}`
          : `${entryLabel} checked ${observedLabel}, ${imageStatus.toLowerCase()}`
      }
      disabled={!url}
      onClick={() => url && props.onOpen(url)}
    >
      <span className="flex aspect-[5/3] items-center justify-center overflow-hidden border border-border/70 bg-black">
        {url ? (
          <img src={url} alt="" className="size-full object-cover object-top" draggable={false} />
        ) : (
          <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
        )}
      </span>
      <span className="min-w-0 self-center">
        <span className="block truncate text-xs font-medium text-foreground">{entryLabel}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {uiHistoryEntryLocation(props.entry)}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <time dateTime={props.entry.observedAt}>{observedLabel}</time>
          <span aria-hidden>·</span>
          <span className="tabular-nums">
            {props.entry.width}×{props.entry.height}
          </span>
          {issueCount > 0 ? (
            <span className="text-destructive">
              {issueCount} issue{issueCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </span>
        {!url ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{imageStatus}</span>
        ) : null}
      </span>
    </button>
  );
}
