import { describe, expect, it } from "vite-plus/test";

import {
  buildPreviewIdeaPrompt,
  buildPreviewDecisionPrompt,
  buildPreviewOptionsPrompt,
  isPreviewableComponentSource,
  selectPreviewRequestContext,
} from "./previewIdeationPrompts";

describe("Preview ideation prompts", () => {
  it("asks the native provider for a real repository-backed interactive preview", () => {
    const prompt = buildPreviewIdeaPrompt("/workspace/product", { idea: "A visual query builder" });

    expect(prompt).toContain('current project at "/workspace/product"');
    expect(prompt).toContain("real framework, dependencies, styles, and development server");
    expect(prompt).toContain("Do not return generated HTML");
    expect(prompt).toContain("Open the working result in the existing Croki Preview");
    expect(prompt).toContain("Direction: A visual query builder");
  });

  it("targets component source without inventing a static renderer", () => {
    const prompt = buildPreviewIdeaPrompt("/workspace/product", {
      sourcePath: "src/Composer.tsx",
    });

    expect(prompt).toContain('Open "src/Composer.tsx" as a real interactive component');
    expect(prompt).toContain("Create or reuse only the development state needed");
    expect(prompt).not.toMatch(/Direction:\s*$/);
  });

  it.each(["Button.tsx", "card.jsx", "Panel.vue", "Result.svelte"])(
    "recognizes %s as component source",
    (path) => expect(isPreviewableComponentSource(path)).toBe(true),
  );

  it("keeps generated options interactive, materially different, and provisional", () => {
    const prompt = buildPreviewOptionsPrompt("/workspace/product");

    expect(prompt).toContain("attached preview annotation");
    expect(prompt).toContain("three code-backed options");
    expect(prompt).toContain("differ in product or interaction consequence");
    expect(prompt).toContain("Keep the original intact");
    expect(prompt).toContain("Do not integrate an option into the production path yet");
    expect(prompt).toContain("new Croki Preview tab (reuseExistingTab=false)");
  });

  it("turns a Preview decision into an integration or cleanup instruction", () => {
    expect(
      buildPreviewDecisionPrompt("/workspace/product", "keep", "http://localhost:5173/b"),
    ).toContain("integrate its product and interaction decisions");
    expect(
      buildPreviewDecisionPrompt(
        "/workspace/product",
        "combine",
        "http://localhost:5173/b",
        "Use the original navigation",
      ),
    ).toContain("Direction: Use the original navigation");
    expect(
      buildPreviewDecisionPrompt("/workspace/product", "discard", "http://localhost:5173/b"),
    ).toContain("Do not change the original product code");
  });

  it("isolates picked Preview evidence from an unrelated composer draft", () => {
    const selected = selectPreviewRequestContext(
      [{ id: "user-image" }, { id: "picked-element" }],
      [{ id: "picked-element" }],
      ["picked-element"],
    );
    expect(selected).toEqual({
      annotations: [{ id: "picked-element" }],
      images: [{ id: "picked-element" }],
    });
    expect(
      selectPreviewRequestContext([{ id: "user-image" }], [{ id: "picked-element" }], []),
    ).toEqual({ images: [], annotations: [] });
  });
});
