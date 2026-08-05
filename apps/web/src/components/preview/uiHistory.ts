import {
  UI_HISTORY_ACTIVITY_KIND,
  UiHistoryActivityPayload,
  type OrchestrationThreadActivity,
  type UiHistoryEntry,
} from "@croki/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const decodePayload = Schema.decodeUnknownOption(UiHistoryActivityPayload);

/** Newest-first checked screens derived from durable Thread activity. */
export function deriveUiHistoryEntries(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  limit = 25,
): UiHistoryEntry[] {
  const entries: UiHistoryEntry[] = [];
  const seen = new Set<string>();
  for (let index = activities.length - 1; index >= 0 && entries.length < limit; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== UI_HISTORY_ACTIVITY_KIND) continue;
    const payload = Option.getOrUndefined(decodePayload(activity.payload));
    if (!payload || seen.has(payload.entry.id)) continue;
    seen.add(payload.entry.id);
    entries.push(payload.entry);
  }
  return entries;
}

export function uiHistoryEntryLabel(entry: UiHistoryEntry): string {
  if (entry.title.trim().length > 0) return entry.title.trim();
  try {
    const url = new URL(entry.url);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return entry.url || "Checked screen";
  }
}

export function uiHistoryEntryLocation(entry: UiHistoryEntry): string {
  try {
    const url = new URL(entry.url);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return entry.url;
  }
}
