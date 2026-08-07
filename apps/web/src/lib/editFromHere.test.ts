import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { editFromHereDraftFromMessageText, restoreEditFromHereImages } from "./editFromHere";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("editFromHereDraftFromMessageText", () => {
  it("recovers authored text without runtime-only context blocks", () => {
    const result = editFromHereDraftFromMessageText(
      [
        "Change the checkout headline",
        "",
        "<terminal_context>",
        "- dev server line 12:",
        "  12 | ready",
        "</terminal_context>",
        "",
        "<element_context>",
        "- <Checkout>:",
        "  source: src/Checkout.tsx:4",
        "</element_context>",
        "",
        "<preview_annotation>",
        "Preview annotation:",
        "Id: note-1",
        "Page: Checkout",
        "Targets: 1 selected element.",
        "</preview_annotation>",
      ].join("\n"),
    );

    expect(result).toEqual({
      prompt: "Change the checkout headline",
      reviewComments: [],
    });
  });

  it("restores review comments as composer-owned objects", () => {
    const result = editFromHereDraftFromMessageText(
      [
        "Please address this",
        "",
        '<review_comment sectionId="working" sectionTitle="Working tree" filePath="src/a.ts" startIndex="2" endIndex="2" rangeLabel="line 3">',
        "Handle the empty case",
        "```diff",
        "+const value = input ?? fallback;",
        "```",
        "</review_comment>",
      ].join("\n"),
    );

    expect(result.prompt).toBe("Please address this");
    expect(result.reviewComments).toMatchObject([
      {
        sectionId: "working",
        filePath: "src/a.ts",
        startIndex: 2,
        endIndex: 2,
        text: "Handle the empty case",
      },
    ]);
  });
});

describe("restoreEditFromHereImages", () => {
  it("restores available images and reports mixed failures", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("available")
        ? new Response(new Blob(["image-bytes"], { type: "image/png" }))
        : new Response("missing", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:restored-image");

    const result = await restoreEditFromHereImages([
      {
        type: "image",
        id: "image-1",
        name: "available.png",
        mimeType: "image/png",
        sizeBytes: 11,
        previewUrl: "https://assets.test/available",
      },
      {
        type: "image",
        id: "image-2",
        name: "missing.png",
        mimeType: "image/png",
        sizeBytes: 7,
        previewUrl: "https://assets.test/missing",
      },
      {
        type: "image",
        id: "image-3",
        name: "expired.png",
        mimeType: "image/png",
        sizeBytes: 7,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.failedCount).toBe(2);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      id: "image-1",
      name: "available.png",
      mimeType: "image/png",
      sizeBytes: 11,
      previewUrl: "blob:restored-image",
    });
    expect(result.images[0]?.file).toBeInstanceOf(File);
  });
});
