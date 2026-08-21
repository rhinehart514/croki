import { describe, expect, it } from "vite-plus/test";

import { crokiCanvasEdgeId } from "./CrokiCanvasFieldChrome";

describe("crokiCanvasEdgeId", () => {
  it("keeps colon-bearing edge tuples and edge kinds distinct", () => {
    const first = crokiCanvasEdgeId({ from: "a:b", relation: "c", to: "d" }, "semantic");
    const second = crokiCanvasEdgeId({ from: "a", relation: "b", to: "c:d" }, "semantic");
    const native = crokiCanvasEdgeId({ from: "a:b", relation: "c", to: "d" }, "reference");

    expect(first).not.toBe(second);
    expect(first).not.toBe(native);
  });
});
