import type { OrchestrationThreadActivity } from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveUiHistoryEntries, uiHistoryEntryLabel, uiHistoryEntryLocation } from "./uiHistory";

function checkedScreen(id: string, title: string): OrchestrationThreadActivity {
  return {
    id: `activity-${id}` as OrchestrationThreadActivity["id"],
    kind: "preview.snapshot",
    tone: "info",
    summary: `Checked ${title}`,
    payload: {
      version: 1,
      entry: {
        id,
        attachmentId: `thread-1-00000000-0000-4000-8000-00000000000${id}`,
        url: `http://localhost:5173/${id}`,
        title,
        observedAt: "2026-08-05T12:00:00.000Z",
        width: 1_280,
        height: 800,
        interactiveElementCount: 4,
        consoleErrorCount: 0,
        networkFailureCount: 0,
        actionCount: 1,
      },
      frame: {
        kind: "attachment",
        ref: `thread-1-00000000-0000-4000-8000-00000000000${id}`,
        mimeType: "image/png",
        width: 1_280,
        height: 800,
      },
    },
    turnId: null,
    createdAt: "2026-08-05T12:00:00.000Z",
  };
}

describe("UI history", () => {
  it("derives checked screens newest first and ignores unrelated activity", () => {
    const entries = deriveUiHistoryEntries([
      checkedScreen("1", "Home"),
      { ...checkedScreen("ignored", "Ignored"), kind: "tool.completed" },
      checkedScreen("2", "Settings"),
    ]);

    expect(entries.map((entry) => entry.title)).toEqual(["Settings", "Home"]);
  });

  it("uses the page location when the document has no title", () => {
    const [entry] = deriveUiHistoryEntries([checkedScreen("1", "")]);
    expect(entry && uiHistoryEntryLabel(entry)).toBe("localhost:5173/1");
    expect(entry && uiHistoryEntryLocation(entry)).toBe("localhost:5173/1");
  });
});
