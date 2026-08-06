import { describe, expect, it } from "vite-plus/test";

import { selectPreviewRequestContext } from "./previewRequestContext";

describe("selectPreviewRequestContext", () => {
  it("keeps only images and annotations selected for a request", () => {
    expect(
      selectPreviewRequestContext(
        [{ id: "picked" }, { id: "unrelated" }],
        [{ id: "picked" }, { id: "other" }],
        ["picked"],
      ),
    ).toEqual({
      images: [{ id: "picked" }],
      annotations: [{ id: "picked" }],
    });
  });
});
