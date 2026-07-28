import { describe, expect, it } from "vitest";
import { resolveStagedArtifact } from "./reviewArtifact";

describe("staged artifact review contract", () => {
  it("preserves explicit documents, diffs, and images", () => {
    expect(resolveStagedArtifact({ kind: "document", format: "markdown", content: "## Repository map" })).toEqual({
      kind: "preview",
      artifact: { kind: "markdown", content: "## Repository map" },
    });
    expect(resolveStagedArtifact({ kind: "diff", diff: "diff --git a/a.ts b/a.ts" })).toEqual({
      kind: "diff",
      diff: "diff --git a/a.ts b/a.ts",
      stat: null,
    });
    expect(resolveStagedArtifact({ kind: "image", src: "map.png", caption: "Project map" })).toEqual({
      kind: "preview",
      artifact: { kind: "image", src: "map.png", caption: "Project map" },
    });
  });

  it("returns an honest unsupported state instead of serializing arbitrary objects", () => {
    const content = { kind: "unknown-structure", secretMachineField: "do not render me" };
    const resolved = resolveStagedArtifact(content);
    expect(resolved).toEqual({ kind: "unsupported", sourceKind: "unknown-structure" });
    expect(JSON.stringify(resolved)).not.toContain("secretMachineField");
  });
});
