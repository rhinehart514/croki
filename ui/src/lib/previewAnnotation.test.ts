// A picked preview element must serialize into an exact, readable context block and reach exactly
// the composer that is listening — nothing here may depend on the desktop bridge existing.
import { describe, expect, it } from "vitest";
import {
  appendPreviewAnnotationPrompt,
  buildPreviewAnnotationPrompt,
  publishPreviewAnnotation,
  subscribePreviewAnnotations,
  type PreviewAnnotationPayload,
} from "./previewAnnotation";

const annotation = (overrides: Partial<PreviewAnnotationPayload> = {}): PreviewAnnotationPayload => ({
  id: "pick-1",
  pageUrl: "http://127.0.0.1:5173/settings",
  pageTitle: "Settings",
  comment: "Make this button green",
  elements: [{
    id: "el-1",
    element: {
      pageUrl: "http://127.0.0.1:5173/settings",
      pageTitle: "Settings",
      tagName: "button",
      selector: "#save",
      htmlPreview: "<button id=\"save\">Save</button>",
      componentName: "SaveButton",
      source: { fileName: "src/components/SaveButton.tsx", lineNumber: 12 },
      pickedAt: "2026-07-23T00:00:00.000Z",
    },
    rect: { x: 10, y: 20, width: 80, height: 24 },
  }],
  regions: [],
  strokes: [],
  styleChanges: [],
  createdAt: "2026-07-23T00:00:00.000Z",
  ...overrides,
});

describe("buildPreviewAnnotationPrompt", () => {
  it("carries the page, comment, target count, and exact element context", () => {
    const prompt = buildPreviewAnnotationPrompt(annotation());
    expect(prompt.startsWith("<preview_annotation>")).toBe(true);
    expect(prompt.endsWith("</preview_annotation>")).toBe(true);
    expect(prompt).toContain("Page: Settings");
    expect(prompt).toContain("URL: http://127.0.0.1:5173/settings");
    expect(prompt).toContain("Comment: Make this button green");
    expect(prompt).toContain("Targets: 1 selected element.");
    expect(prompt).toContain("- button in SaveButton:");
    expect(prompt).toContain("Selector: #save");
    expect(prompt).toContain("Source: src/components/SaveButton.tsx:12");
  });

  it("lists requested style changes with their previous values", () => {
    const prompt = buildPreviewAnnotationPrompt(annotation({
      styleChanges: [{ property: "background-color", value: "green", previousValue: "red" }],
    }));
    expect(prompt).toContain("Requested visual changes:");
    expect(prompt).toContain("- background-color: red → green");
  });

  it("falls back to the URL as the page name and omits empty sections", () => {
    const prompt = buildPreviewAnnotationPrompt(annotation({ pageTitle: null, comment: "  ", elements: [] }));
    expect(prompt).toContain("Page: http://127.0.0.1:5173/settings");
    expect(prompt).not.toContain("Comment:");
    expect(prompt).not.toContain("Targets:");
    expect(prompt).not.toContain("<element_context>");
  });
});

describe("appendPreviewAnnotationPrompt", () => {
  it("appends after existing draft text and stands alone in an empty draft", () => {
    const appended = appendPreviewAnnotationPrompt("Fix the save flow", annotation());
    expect(appended.startsWith("Fix the save flow\n\n<preview_annotation>")).toBe(true);
    expect(appendPreviewAnnotationPrompt("   ", annotation()).startsWith("<preview_annotation>")).toBe(true);
  });
});

describe("the delivery seam", () => {
  it("delivers to subscribers, reports whether anyone listened, and honors unsubscribe", () => {
    const delivery = { workspaceId: "workspace-1", annotation: annotation(), screenshot: null };
    expect(publishPreviewAnnotation(delivery)).toBe(false);

    const seen: string[] = [];
    const unsubscribe = subscribePreviewAnnotations((event) => seen.push(event.workspaceId));
    expect(publishPreviewAnnotation(delivery)).toBe(true);
    expect(seen).toEqual(["workspace-1"]);

    unsubscribe();
    expect(publishPreviewAnnotation(delivery)).toBe(false);
    expect(seen).toEqual(["workspace-1"]);
  });
});
