import { EnvironmentId, TurnId, type UiHistoryEntry } from "@croki/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const assetState = vi.hoisted(() => ({ mode: "success" as "success" | "loading" | "failure" }));

vi.mock("~/assets/assetUrls", () => ({
  useAssetUrlState: (
    _environmentId: unknown,
    resource: { _tag: "attachment"; attachmentId: string },
  ) => {
    if (assetState.mode === "loading") return { _tag: "Loading" as const };
    if (assetState.mode === "failure") return { _tag: "Failure" as const };
    return {
      _tag: "Success" as const,
      url: `https://environment.example/assets/${resource.attachmentId}.png`,
    };
  },
}));

import { buildUiCheckExpandedImagePreview, UiCheckReceiptRow } from "./UiCheckReceiptRow";

const environmentId = EnvironmentId.make("environment-1");
const turnId = TurnId.make("turn-1");

const screens: UiHistoryEntry[] = [
  {
    id: "screen-settings",
    attachmentId: "attachment-settings",
    url: "http://localhost:5173/settings?tab=general",
    title: "Settings",
    observedAt: "2026-08-05T12:00:00.000Z",
    width: 1_280,
    height: 800,
    interactiveElementCount: 4,
    consoleErrorCount: 1,
    networkFailureCount: 0,
    actionCount: 2,
  },
  {
    id: "screen-home",
    attachmentId: "attachment-home",
    url: "http://localhost:5173/",
    title: "Home",
    observedAt: "2026-08-05T12:00:02.000Z",
    width: 390,
    height: 844,
    interactiveElementCount: 2,
    consoleErrorCount: 0,
    networkFailureCount: 2,
    actionCount: 1,
  },
];

function receipt(
  status: "checked" | "not-checked" | "unavailable",
): Parameters<typeof UiCheckReceiptRow>[0]["receipt"] {
  return {
    status,
    turnId,
    createdAt: "2026-08-05T12:00:03.000Z",
    screens: status === "checked" ? screens : [],
    visibleFiles: ["apps/web/src/Settings.tsx"],
    issueCount: status === "checked" ? 3 : 0,
  };
}

describe("UiCheckReceiptRow", () => {
  beforeEach(() => {
    assetState.mode = "success";
  });

  it("shows bounded checked-screen evidence and truthful screen metadata", () => {
    const markup = renderToStaticMarkup(
      <UiCheckReceiptRow
        environmentId={environmentId}
        receipt={receipt("checked")}
        onImageExpand={() => {}}
      />,
    );

    expect(markup).toContain('data-ui-check-receipt="true"');
    expect(markup).toContain('data-ui-check-status="checked"');
    expect(markup).toContain("Checked 2 screens");
    expect(markup).toContain('data-ui-check-filmstrip="true"');
    expect(markup).toContain("Settings");
    expect(markup).toContain("localhost:5173/settings");
    expect(markup).toContain("http://localhost:5173/settings?tab=general");
    expect(markup).toContain("1280×800");
    expect(markup).toContain("1 issue");
    expect(markup).toContain("390×844");
    expect(markup).toContain("2 issues");
    expect(markup).toContain("https://environment.example/assets/attachment-settings.png");
    expect(markup).toContain('aria-label="Open Settings checked screen in gallery"');
    expect(markup).not.toContain("Work Log");
  });

  it.each([
    ["not-checked", "no screen was captured."],
    ["unavailable", "screen evidence is unavailable."],
  ] as const)("does not pretend %s has visual evidence", (status, description) => {
    const markup = renderToStaticMarkup(
      <UiCheckReceiptRow
        environmentId={environmentId}
        receipt={receipt(status)}
        onImageExpand={() => {}}
      />,
    );

    expect(markup).toContain(`data-ui-check-status="${status}"`);
    expect(markup).toContain(status === "not-checked" ? "Not checked" : "Check unavailable");
    expect(markup).toContain(description);
    expect(markup).not.toContain("data-ui-check-filmstrip");
    expect(markup).not.toContain("<img");
  });

  it.each([
    ["loading", "Loading image…"],
    ["failure", "Image unavailable"],
  ] as const)("keeps the checked image %s state honest", (mode, label) => {
    assetState.mode = mode;
    const markup = renderToStaticMarkup(
      <UiCheckReceiptRow
        environmentId={environmentId}
        receipt={receipt("checked")}
        onImageExpand={() => {}}
      />,
    );

    expect(markup).toContain(`data-ui-check-image-state="${mode}"`);
    expect(markup).toContain(label);
    expect(markup).not.toContain("<img");
  });

  it("builds a multi-image gallery in screen order and skips unavailable images", () => {
    const preview = buildUiCheckExpandedImagePreview(
      screens,
      new Map([[screens[0]!.id, "https://environment.example/settings.png"]]),
      screens[0]!.id,
    );

    expect(preview).toEqual({
      images: [
        {
          src: "https://environment.example/settings.png",
          name: "Settings · localhost:5173/settings",
        },
      ],
      index: 0,
    });
  });
});
