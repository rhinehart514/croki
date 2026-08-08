// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";

import { listTranscriptFiles, readTranscriptRecords } from "./usageTranscriptReader.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readdir: vi.fn(actual.readdir), stat: vi.fn(actual.stat) };
});

afterEach(() => {
  vi.mocked(NodeFSP.readdir).mockClear();
  vi.mocked(NodeFSP.stat).mockClear();
});

describe("listTranscriptFiles", () => {
  it("distinguishes an empty directory from a failed root walk", async () => {
    const emptyDir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "croki-usage-reader-"));

    try {
      await expect(listTranscriptFiles(emptyDir, 0)).resolves.toEqual({
        files: [],
        walkedDirectories: 1,
        failedDirectories: 0,
        failedFiles: 0,
      });

      vi.mocked(NodeFSP.readdir).mockRejectedValueOnce(new Error("permission denied"));
      await expect(listTranscriptFiles(emptyDir, 0)).resolves.toEqual({
        files: [],
        walkedDirectories: 0,
        failedDirectories: 1,
        failedFiles: 0,
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
        failedFiles: 0,
      });
    } finally {
      await NodeFSP.rm(root, { recursive: true });
    }
  });

  it("reports metadata failures but tolerates a transcript rotated during the walk", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "croki-usage-reader-"));
    const transcript = NodePath.join(root, "session.jsonl");
    await NodeFSP.writeFile(transcript, "{}\n");

    try {
      vi.mocked(NodeFSP.stat).mockRejectedValueOnce(
        Object.assign(new Error("permission denied"), { code: "EACCES" }),
      );
      await expect(listTranscriptFiles(root, 0)).resolves.toEqual({
        files: [],
        walkedDirectories: 1,
        failedDirectories: 0,
        failedFiles: 1,
      });

      vi.mocked(NodeFSP.stat).mockRejectedValueOnce(
        Object.assign(new Error("rotated"), { code: "ENOENT" }),
      );
      await expect(listTranscriptFiles(root, 0)).resolves.toEqual({
        files: [],
        walkedDirectories: 1,
        failedDirectories: 0,
        failedFiles: 0,
      });
    } finally {
      await NodeFSP.rm(root, { recursive: true });
    }
  });
});

describe("readTranscriptRecords", () => {
  it("counts malformed Claude usage candidates without counting ordinary lines", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "croki-usage-reader-"));
    const transcript = NodePath.join(root, "claude.jsonl");
    const valid = {
      type: "assistant",
      timestamp: "2026-08-07T04:05:13.944Z",
      sessionId: "session-a",
      message: {
        id: "message-a",
        model: "claude-fable-5",
        usage: { input_tokens: 2, output_tokens: 3 },
      },
    };
    const missingModel = {
      ...valid,
      message: { id: "message-b", usage: { input_tokens: 4, output_tokens: 5 } },
    };

    await NodeFSP.writeFile(
      transcript,
      [
        JSON.stringify({ type: "user", message: { content: "ordinary transcript noise" } }),
        JSON.stringify(valid),
        JSON.stringify(missingModel),
        '{"usage":',
      ].join("\n"),
    );

    try {
      const result = await readTranscriptRecords(transcript, "claude");
      expect(result?.records).toHaveLength(1);
      expect(result?.malformedRecords).toBe(2);
    } finally {
      await NodeFSP.rm(root, { recursive: true });
    }
  });

  it("does not count Codex context or duplicate usage events as malformed", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "croki-usage-reader-"));
    const transcript = NodePath.join(root, "codex.jsonl");
    const turnContext = {
      type: "turn_context",
      timestamp: "2026-08-07T04:05:13.944Z",
      payload: { type: "turn_context", model: "gpt-5.6-sol" },
    };
    const tokenCount = {
      type: "event_msg",
      timestamp: "2026-08-07T04:05:14.944Z",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: 10,
            cached_input_tokens: 2,
            output_tokens: 3,
            reasoning_output_tokens: 1,
          },
        },
      },
    };
    const malformedTokenCount = {
      type: "event_msg",
      timestamp: "2026-08-07T04:05:15.944Z",
      payload: { type: "token_count", info: {} },
    };

    await NodeFSP.writeFile(
      transcript,
      [
        JSON.stringify({ type: "response_item", payload: { type: "message" } }),
        JSON.stringify(turnContext),
        JSON.stringify(tokenCount),
        JSON.stringify(tokenCount),
        JSON.stringify(malformedTokenCount),
      ].join("\n"),
    );

    try {
      const result = await readTranscriptRecords(transcript, "codex");
      expect(result?.records).toHaveLength(1);
      expect(result?.malformedRecords).toBe(1);
    } finally {
      await NodeFSP.rm(root, { recursive: true });
    }
  });
});
