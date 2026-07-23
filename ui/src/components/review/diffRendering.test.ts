import { describe, expect, it } from "vitest";
import {
  buildPatchCacheKey,
  fileDiffStats,
  getRenderablePatch,
  resolveFileDiffPath,
} from "./diffRendering";

const DIFF = `diff --git a/src/hello.ts b/src/hello.ts
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1,2 +1,3 @@
 keep
-old line
+new line
+another new
`;

describe("getRenderablePatch", () => {
  it("returns null for empty or whitespace input", () => {
    expect(getRenderablePatch(undefined)).toBeNull();
    expect(getRenderablePatch("")).toBeNull();
    expect(getRenderablePatch("   \n  ")).toBeNull();
  });

  it("parses a git patch into Pierre file metadata", () => {
    const renderable = getRenderablePatch(DIFF);
    expect(renderable?.kind).toBe("files");
    if (renderable?.kind !== "files") throw new Error("expected files");
    expect(renderable.files).toHaveLength(1);
    expect(resolveFileDiffPath(renderable.files[0])).toBe("src/hello.ts");
    expect(fileDiffStats(renderable.files[0])).toEqual({ additions: 2, deletions: 1 });
  });

  it("parses a bare diff without ---/+++ header lines", () => {
    const renderable = getRenderablePatch("diff --git a/ui/src/App.tsx b/ui/src/App.tsx\n@@ -1 +1 @@\n-old\n+new");
    expect(renderable?.kind).toBe("files");
    if (renderable?.kind !== "files") throw new Error("expected files");
    expect(resolveFileDiffPath(renderable.files[0])).toBe("ui/src/App.tsx");
  });

  it("falls back to the exact raw text for non-diff prose", () => {
    const renderable = getRenderablePatch("not a diff at all");
    expect(renderable?.kind).toBe("raw");
    if (renderable?.kind !== "raw") throw new Error("expected raw");
    expect(renderable.text).toBe("not a diff at all");
    expect(renderable.reason.length).toBeGreaterThan(0);
  });
});

describe("buildPatchCacheKey", () => {
  it("is stable for identical content and distinct across content and scope", () => {
    expect(buildPatchCacheKey(DIFF)).toBe(buildPatchCacheKey(DIFF));
    expect(buildPatchCacheKey(DIFF)).not.toBe(buildPatchCacheKey(`${DIFF}+more`));
    expect(buildPatchCacheKey(DIFF, "a")).not.toBe(buildPatchCacheKey(DIFF, "b"));
  });
});
