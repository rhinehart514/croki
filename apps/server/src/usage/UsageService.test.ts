import { describe, expect, it } from "@effect/vitest";

import { classifyTranscriptRead, deriveSourceReadProvenance } from "./UsageService.ts";

describe("UsageService transcript provenance", () => {
  it("keeps an empty readable transcript distinct from a read failure", () => {
    expect(classifyTranscriptRead([])).toEqual({ status: "ok", records: [] });
    expect(classifyTranscriptRead(null)).toEqual({ status: "failed" });
  });

  it("marks a source partial when any transcript fails among readable files", () => {
    expect(deriveSourceReadProvenance({ readableFiles: 2, failedFiles: 1 })).toEqual({
      status: "partial",
      message: "1 transcript file could not be read.",
    });
  });

  it("marks a source failed when none of its transcripts can be read", () => {
    expect(deriveSourceReadProvenance({ readableFiles: 0, failedFiles: 2 })).toEqual({
      status: "failed",
      message: "2 transcript files could not be read.",
    });
  });
});
