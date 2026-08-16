import { describe, expect, it } from "vite-plus/test";

import { PreviewTabId } from "@croki/contracts";

import { normalizePreviewOpenInput, stripPreviewSnapshotConcept } from "./handlers.ts";

describe("normalizePreviewOpenInput", () => {
  it("opens the inline preview and reuses the current tab by default", () => {
    expect(normalizePreviewOpenInput({})).toEqual({
      open: true,
      reuseExistingTab: true,
      show: true,
    });
  });

  it("preserves an explicit background-only opt-out", () => {
    expect(normalizePreviewOpenInput({ open: false })).toEqual({
      open: false,
      reuseExistingTab: true,
      show: false,
    });
  });

  it("supports show as a legacy alias while preferring open", () => {
    expect(normalizePreviewOpenInput({ show: false })).toEqual({
      open: false,
      reuseExistingTab: true,
      show: false,
    });
    expect(normalizePreviewOpenInput({ open: true, show: false })).toEqual({
      open: true,
      reuseExistingTab: true,
      show: true,
    });
  });
});

describe("stripPreviewSnapshotConcept", () => {
  it("keeps tab targeting while removing concept metadata from broker input", () => {
    expect(
      stripPreviewSnapshotConcept({
        tabId: PreviewTabId.make("tab-concept"),
        concept: {
          id: "direction-a",
          title: "Focused workflow",
          summary: "Keep the founder in the checked result.",
          initialRank: 80,
        },
      }),
    ).toEqual({ tabId: "tab-concept" });
  });

  it("keeps ordinary snapshots compatible", () => {
    expect(stripPreviewSnapshotConcept({})).toEqual({});
  });
});
