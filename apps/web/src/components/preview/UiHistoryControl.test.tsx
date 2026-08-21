import { EnvironmentId, type UiHistoryEntry } from "@croki/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/assets/assetUrls", () => ({
  useAssetUrlState: () => ({
    _tag: "Success",
    url: "https://environment.example/checked-screen.png",
  }),
}));

import { UiHistoryControl } from "./UiHistoryControl";

const entry: UiHistoryEntry = {
  id: "screen-1",
  attachmentId: "thread-1-00000000-0000-4000-8000-000000000001",
  url: "http://localhost:5173/settings",
  title: "Settings",
  observedAt: "2026-08-05T12:00:00.000Z",
  width: 1_280,
  height: 800,
  interactiveElementCount: 12,
  consoleErrorCount: 1,
  networkFailureCount: 0,
  actionCount: 4,
};

describe("UI history control", () => {
  it("keeps empty history out of Preview chrome", () => {
    expect(
      renderToStaticMarkup(
        <UiHistoryControl environmentId={EnvironmentId.make("environment-1")} entries={[]} />,
      ),
    ).toBe("");
  });

  it("names the number of checked screens without exposing storage machinery", () => {
    const markup = renderToStaticMarkup(
      <UiHistoryControl environmentId={EnvironmentId.make("environment-1")} entries={[entry]} />,
    );

    expect(markup).toContain("UI history, 1 recent checked screen");
    expect(markup).not.toContain("attachmentId");
    expect(markup).not.toContain("perception");
  });
});
