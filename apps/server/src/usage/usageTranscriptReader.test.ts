// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";

import { listTranscriptFiles } from "./usageTranscriptReader.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});

afterEach(() => {
  vi.mocked(NodeFSP.readdir).mockClear();
});

describe("listTranscriptFiles", () => {
  it("distinguishes an empty directory from a failed root walk", async () => {
    const emptyDir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "croki-usage-reader-"));

    try {
      await expect(listTranscriptFiles(emptyDir, 0)).resolves.toEqual({
        files: [],
        walkedDirectories: 1,
        failedDirectories: 0,
      });

      vi.mocked(NodeFSP.readdir).mockRejectedValueOnce(new Error("permission denied"));
      await expect(listTranscriptFiles(emptyDir, 0)).resolves.toEqual({
        files: [],
        walkedDirectories: 0,
        failedDirectories: 1,
      });
    } finally {
      await NodeFSP.rm(emptyDir, { recursive: true });
    }
  });

  it("preserves an omitted subtree in an otherwise successful walk", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "croki-usage-reader-"));
    const child = NodePath.join(root, "sessions");
    await NodeFSP.mkdir(child);

    try {
      const readdir = vi.mocked(NodeFSP.readdir);
      const implementation = readdir.getMockImplementation();
      if (implementation === undefined) throw new Error("readdir mock has no implementation");
      readdir.mockImplementationOnce(implementation).mockRejectedValueOnce(new Error("gone"));

      await expect(listTranscriptFiles(root, 0)).resolves.toEqual({
        files: [],
        walkedDirectories: 1,
        failedDirectories: 1,
      });
    } finally {
      await NodeFSP.rm(root, { recursive: true });
    }
  });
});
