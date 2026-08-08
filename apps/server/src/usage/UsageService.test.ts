import { describe, expect, it } from "@effect/vitest";

import { classifyTranscriptRead, deriveSourceReadProvenance } from "./UsageService.ts";

describe("UsageService transcript provenance", () => {
  it("keeps an empty readable transcript distinct from a read failure", () => {
    expect(classifyTranscriptRead([])).toEqual({ status: "ok", records: [] });
    expect(classifyTranscriptRead(null)).toEqual({ status: "failed" });
  });

  it("marks a source partial when any transcript fails among readable files", () => {
    expect(
      deriveSourceReadProvenance({
        readableFiles: 2,
        failedFiles: 1,
        walkedDirectories: 1,
        failedDirectories: 0,
      }),
    ).toEqual({
      status: "partial",
      message: "1 transcript file could not be read.",
    });
  });

  it("marks a source failed when none of its transcripts can be read", () => {
    expect(
      deriveSourceReadProvenance({
        readableFiles: 0,
        failedFiles: 2,
        walkedDirectories: 1,
        failedDirectories: 0,
      }),
    ).toEqual({
      status: "failed",
      message: "2 transcript files could not be read.",
    });
  });

  it("keeps a successfully walked empty directory healthy", () => {
    expect(
      deriveSourceReadProvenance({
        readableFiles: 0,
        failedFiles: 0,
        walkedDirectories: 1,
        failedDirectories: 0,
      }),
    ).toEqual({ status: "ok", message: null });
  });

  it("marks an omitted subtree partial even when the readable tree is empty", () => {
    expect(
      deriveSourceReadProvenance({
        readableFiles: 0,
        failedFiles: 0,
        walkedDirectories: 1,
        failedDirectories: 1,
      }),
    ).toEqual({
      status: "partial",
      message: "1 transcript directory could not be listed.",
    });
  });

  it("marks a source failed when its root directory cannot be walked", () => {
    expect(
      deriveSourceReadProvenance({
        readableFiles: 0,
        failedFiles: 0,
        walkedDirectories: 0,
        failedDirectories: 1,
      }),
    ).toEqual({
      status: "failed",
      message: "1 transcript directory could not be listed.",
    });
  });
});
