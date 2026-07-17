import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSourceFrame, createViewPresentation, createViewSpec, resolveSourceFrame, updateViewPresentation } from "../../src/firm/view-semantics.mjs";

describe("view semantics", () => {
  it("distinguishes disposable, live, and immutable snapshot sources", () => {
    assert.equal(createViewSpec({ id: "temporary", name: "Temporary" }).kind, "disposable");
    assert.equal(createViewSpec({ id: "live", name: "Live", kind: "live" }).kind, "live");
    const frame = createSourceFrame({ viewId: "snapshot", kind: "snapshot", sources: [{ ref: "object:one", revision: 3 }] });
    assert.throws(() => { frame.sources.push({ ref: "object:two" }); }, TypeError);
    assert.equal(resolveSourceFrame(frame, { load: () => ({ id: "one", revision: 3 }) })[0].state, "resolved");
    assert.equal(resolveSourceFrame(frame, { load: () => ({ id: "one", revision: 4 }) })[0].state, "stale");
    assert.equal(resolveSourceFrame(frame, { load: () => null })[0].state, "unresolved");
  });

  it("keeps presentation independently replaceable", () => {
    const presentation = createViewPresentation({ viewId: "live", placementRef: "placement:canvas", camera: { x: 1, y: 2, zoom: 1 }, selectionRefs: ["object:one"] });
    const next = updateViewPresentation(presentation, { camera: { x: 3, y: 4, zoom: 0.8 } });
    assert.equal(next.viewRef, presentation.viewRef);
    assert.equal(next.camera.x, 3);
    assert.deepEqual(next.selectionRefs, ["object:one"]);
  });
});
