import { describe, expect, it } from "vite-plus/test";

import { rightPanelUsesSheet, rightPanelUsesWorkspaceLayout } from "./rightPanelLayout";

describe("rightPanelUsesWorkspaceLayout", () => {
  it("gives Canvas the workspace without a separate maximize action", () => {
    expect(rightPanelUsesWorkspaceLayout("canvas", false)).toBe(true);
  });

  it("keeps utility surfaces split unless the person maximizes them", () => {
    expect(rightPanelUsesWorkspaceLayout("preview", false)).toBe(false);
    expect(rightPanelUsesWorkspaceLayout("preview", true)).toBe(true);
  });

  it("keeps Canvas a workspace instead of demoting it to a narrow sheet", () => {
    expect(rightPanelUsesSheet(true, "canvas")).toBe(false);
    expect(rightPanelUsesSheet(true, "preview")).toBe(true);
  });
});
