import {
  UI_HISTORY_ACTIVITY_KIND,
  type OrchestrationCheckpointSummary,
  type OrchestrationThreadActivity,
  type TurnId,
  type UiHistoryEntry,
  UiHistoryActivityPayload,
} from "@croki/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export const UI_CHECK_RECEIPT_KIND = "croki.ui.check" as const;

export interface UiCheckReceipt {
  readonly status: "checked" | "not-checked" | "unavailable";
  readonly turnId: TurnId;
  readonly createdAt: string;
  readonly screens: ReadonlyArray<UiHistoryEntry>;
  readonly visibleFiles: ReadonlyArray<string>;
  readonly issueCount: number;
}

const decodeUiHistoryPayload = Schema.decodeUnknownOption(UiHistoryActivityPayload);

const renderedFileExtensions = new Set([
  "astro",
  "avif",
  "bmp",
  "css",
  "gif",
  "htm",
  "html",
  "ico",
  "jpeg",
  "jpg",
  "jsx",
  "less",
  "mdx",
  "png",
  "sass",
  "scss",
  "storyboard",
  "styl",
  "svelte",
  "svg",
  "tsx",
  "vue",
  "webp",
  "xib",
]);

const testPathPattern =
  /(?:^|\/)(?:__tests__|fixtures|test|tests)(?:\/|$)|\.(?:spec|test)\.[^/]+$|\.stories\.[^/]+$/;

/**
 * This is intentionally a conservative UI-change hint, not a claim that Croki
 * understands every framework. False negatives stay silent; false positives
 * only produce an honest "Not checked" receipt.
 */
export function isLikelyUserVisibleFile(path: string): boolean {
  const normalized = path.trim().replaceAll("\\", "/").toLowerCase();
  if (normalized.length === 0 || testPathPattern.test(normalized)) return false;
  if (/\/(?:res\/layout|res\/drawable)\/[^/]+\.xml$/.test(`/${normalized}`)) return true;
  const fileName = normalized.split("/").at(-1) ?? "";
  if (fileName.endsWith(".swift")) {
    return (
      /\/(?:screens?|ui|views?)\//.test(`/${normalized}`) ||
      /(?:app|scene|screen|view)\.swift$/.test(fileName)
    );
  }
  if (fileName.endsWith(".dart")) {
    return (
      /\/(?:pages?|screens?|ui|views?|widgets?)\//.test(`/${normalized}`) ||
      /^(?:app|main)\.dart$/.test(fileName) ||
      /(?:page|screen|view|widget)\.dart$/.test(fileName)
    );
  }
  const extension = fileName.includes(".") ? (fileName.split(".").at(-1) ?? "") : "";
  return renderedFileExtensions.has(extension);
}

function maxIso(left: string, right: string): string {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (!Number.isFinite(leftMs)) return right;
  if (!Number.isFinite(rightMs)) return left;
  return rightMs > leftMs ? right : left;
}

function screenIssueCount(screen: UiHistoryEntry): number {
  return screen.consoleErrorCount + screen.networkFailureCount;
}

/**
 * Produces one compact, truthful result per turn from evidence Croki already
 * owns. A checked receipt means the model captured at least one screen during
 * that turn; it does not claim complete flow or production coverage.
 */
export function deriveUiCheckReceipts(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>,
): UiCheckReceipt[] {
  const screensByTurn = new Map<TurnId, UiHistoryEntry[]>();
  const seenScreenIds = new Set<string>();

  for (const activity of activities) {
    if (activity.kind !== UI_HISTORY_ACTIVITY_KIND || activity.turnId === null) continue;
    const payload = Option.getOrUndefined(decodeUiHistoryPayload(activity.payload));
    if (!payload || seenScreenIds.has(payload.entry.id)) continue;
    seenScreenIds.add(payload.entry.id);
    const screens = screensByTurn.get(activity.turnId) ?? [];
    screens.push(payload.entry);
    screensByTurn.set(activity.turnId, screens);
  }

  const checkpointByTurn = new Map<TurnId, OrchestrationCheckpointSummary>();
  for (const checkpoint of checkpoints) {
    checkpointByTurn.set(checkpoint.turnId, checkpoint);
  }

  const turnIds = new Set<TurnId>([...screensByTurn.keys(), ...checkpointByTurn.keys()]);
  const receipts: UiCheckReceipt[] = [];
  for (const turnId of turnIds) {
    const screens = (screensByTurn.get(turnId) ?? []).toSorted((left, right) =>
      left.observedAt.localeCompare(right.observedAt),
    );
    const checkpoint = checkpointByTurn.get(turnId);
    const visibleFiles = (checkpoint?.files ?? [])
      .map((file) => file.path)
      .filter(isLikelyUserVisibleFile);

    if (screens.length === 0 && visibleFiles.length === 0) continue;

    const latestScreenAt = screens.reduce(
      (latest, screen) => maxIso(latest, screen.observedAt),
      screens[0]?.observedAt ?? checkpoint?.completedAt ?? "",
    );
    const createdAt = checkpoint ? maxIso(checkpoint.completedAt, latestScreenAt) : latestScreenAt;
    const status =
      screens.length > 0
        ? "checked"
        : checkpoint?.status === "ready"
          ? "not-checked"
          : "unavailable";

    receipts.push({
      status,
      turnId,
      createdAt,
      screens,
      visibleFiles,
      issueCount: screens.reduce((count, screen) => count + screenIssueCount(screen), 0),
    });
  }

  return receipts.toSorted(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.turnId.localeCompare(right.turnId),
  );
}
