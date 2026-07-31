import { describe, expect, it } from "vite-plus/test";

import { crokiNewNodeTitle, crokiNodeKindLabel } from "./crokiCanvasLanguage";

describe("crokiCanvasLanguage", () => {
  it("names new items with the current founder mental model", () => {
    expect(crokiNodeKindLabel("decision", "product")).toBe("Decision");
    expect(crokiNewNodeTitle("decision", "gtm")).toBe("New claim");
    expect(crokiNewNodeTitle("work", "workflow")).toBe("New assignment");
  });
});
