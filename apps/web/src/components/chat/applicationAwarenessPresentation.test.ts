import { describe, expect, it } from "vite-plus/test";

import { applicationAwarenessToolPreview } from "./applicationAwarenessPresentation";

describe("application awareness tool presentation", () => {
  it("compresses a completed observation into an auditable receipt", () => {
    expect(
      applicationAwarenessToolPreview({
        tool: "application_observe",
        result: {
          structuredContent: {
            version: 1,
            canon: { name: "Croki" },
            change: { baselineVersion: "0.4.5", targetVersion: "0.4.8" },
            checkedScreens: [{}, {}],
            projectEvidence: [{}, {}, {}],
            coverage: { projectEvidenceStatus: "stale" },
          },
        },
      }),
    ).toBe("Croki · 0.4.5 → 0.4.8 · 2 checked screens · 3 observed sources · evidence stale");
  });

  it("does not relabel unrelated MCP calls", () => {
    expect(applicationAwarenessToolPreview({ tool: "preview_status", result: {} })).toBeNull();
  });
});
