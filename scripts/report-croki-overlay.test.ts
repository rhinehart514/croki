import { describe, expect, it } from "vite-plus/test";

import {
  classifyCrokiOverlayChanges,
  formatCrokiOverlayReport,
  parseNameStatusZ,
} from "./report-croki-overlay.ts";

describe("report-croki-overlay", () => {
  it("parses modified, deleted, and renamed name-status records", () => {
    expect(
      parseNameStatusZ(
        [
          "M",
          "apps/web/src/branding.ts",
          "D",
          "docs/croki-old.md",
          "R100",
          "old.ts",
          "apps/web/src/components/croki/new.ts",
          "",
        ].join("\0"),
      ),
    ).toEqual([
      { status: "M", oldPath: null, path: "apps/web/src/branding.ts" },
      { status: "D", oldPath: "docs/croki-old.md", path: "docs/croki-old.md" },
      {
        status: "R100",
        oldPath: "old.ts",
        path: "apps/web/src/components/croki/new.ts",
      },
    ]);
  });

  it("separates upstream overlap from Croki-owned additions and removals", () => {
    const report = classifyCrokiOverlayChanges({
      base: "abc123",
      basePaths: new Set(["AGENTS.md", "apps/web/src/branding.ts", "docs/croki-old.md", "old.ts"]),
      changes: [
        { status: "M", oldPath: null, path: "apps/web/src/branding.ts" },
        { status: "D", oldPath: "AGENTS.md", path: "AGENTS.md" },
        { status: "D", oldPath: "docs/croki-old.md", path: "docs/croki-old.md" },
        {
          status: "R100",
          oldPath: "old.ts",
          path: "apps/web/src/components/croki/Renamed.ts",
        },
      ],
      untrackedPaths: ["apps/web/src/components/croki/NewCanvas.tsx", "notes/unrelated.txt"],
    });

    expect(report.overlappingUpstreamFiles.map((change) => change.path)).toEqual([
      "AGENTS.md",
      "apps/web/src/branding.ts",
      "apps/web/src/components/croki/Renamed.ts",
      "docs/croki-old.md",
    ]);
    expect(report.crokiOwnedAdditions.map((change) => change.path)).toEqual([
      "apps/web/src/components/croki/NewCanvas.tsx",
      "apps/web/src/components/croki/Renamed.ts",
    ]);
    expect(report.crokiOwnedRemovals.map((change) => change.path)).toEqual(["docs/croki-old.md"]);
  });

  it("formats a deterministic read-only report", () => {
    expect(
      formatCrokiOverlayReport({
        base: "abc123",
        overlappingUpstreamFiles: [
          { status: "M", oldPath: null, path: "apps/web/src/branding.ts" },
        ],
        crokiOwnedAdditions: [
          { status: "?", oldPath: null, path: "scripts/check-croki-overlay.ts" },
        ],
        crokiOwnedRemovals: [],
      }),
    ).toBe(`Croki overlay report
Base: abc123

Overlapping modified upstream files (1)
  M    apps/web/src/branding.ts

Croki-owned additions (1)
  ?    scripts/check-croki-overlay.ts

Croki-owned removals (0)
  (none)
`);
  });
});
