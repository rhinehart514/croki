import * as NodeServices from "@effect/platform-node/NodeServices";
import { ServerSettings } from "@croki/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  classifyTranscriptRead,
  deriveSourceReadProvenance,
  resolveConfiguredTranscriptDirs,
} from "./UsageService.ts";

const decodeServerSettings = Schema.decodeSync(ServerSettings);

describe("UsageService transcript provenance", () => {
  it("keeps an empty readable transcript distinct from a read failure", () => {
    expect(classifyTranscriptRead({ records: [], malformedRecords: 2 })).toEqual({
      status: "ok",
      records: [],
      malformedRecords: 2,
    });
    expect(classifyTranscriptRead(null)).toEqual({ status: "failed" });
  });

  it("marks a source partial when any transcript fails among readable files", () => {
    expect(
      deriveSourceReadProvenance({
        readableFiles: 2,
        failedFiles: 1,
        walkedDirectories: 1,
        failedDirectories: 0,
        malformedRecords: 0,
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
        malformedRecords: 0,
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
        malformedRecords: 0,
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
        malformedRecords: 0,
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
        malformedRecords: 0,
      }),
    ).toEqual({
      status: "failed",
      message: "1 transcript directory could not be listed.",
    });
  });

  it("marks readable sources partial when usage-shaped records are malformed", () => {
    expect(
      deriveSourceReadProvenance({
        readableFiles: 1,
        failedFiles: 0,
        walkedDirectories: 1,
        failedDirectories: 0,
        malformedRecords: 2,
      }),
    ).toEqual({
      status: "partial",
      message: "2 usage records could not be interpreted.",
    });
  });
});

it.layer(NodeServices.layer)("UsageService configured transcript roots", (it) => {
  it.effect("scans every effective Codex and Claude instance and deduplicates shared homes", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const settings = decodeServerSettings({
        providers: {
          codex: { homePath: "/legacy-codex" },
          claudeAgent: { homePath: "/legacy-claude" },
        },
        providerInstances: {
          codex_work: { driver: "codex", config: { homePath: "/shared-codex" } },
          codex_duplicate: { driver: "codex", config: { homePath: "/shared-codex" } },
          claude_work: {
            driver: "claudeAgent",
            config: { homePath: "/claude-work" },
            environment: [{ name: "CLAUDE_CONFIG_DIR", value: "/ignored-by-homePath" }],
          },
          claude_environment: {
            driver: "claudeAgent",
            environment: [{ name: "CLAUDE_CONFIG_DIR", value: "/claude-environment" }],
          },
          claude_environment_duplicate: {
            driver: "claudeAgent",
            environment: [{ name: "CLAUDE_CONFIG_DIR", value: "/claude-environment" }],
          },
          claude_process_environment: { driver: "claudeAgent" },
          ignored: { driver: "opencode", config: {} },
        },
      });

      const roots = yield* resolveConfiguredTranscriptDirs(settings, {
        CLAUDE_CONFIG_DIR: "/process-claude",
      });

      expect(roots).toEqual([
        { provider: "codex", dir: path.join("/shared-codex", "sessions") },
        { provider: "claude", dir: path.join("/claude-work", "projects") },
        { provider: "claude", dir: path.join("/claude-environment", "projects") },
        { provider: "claude", dir: path.join("/process-claude", "projects") },
        { provider: "codex", dir: path.join("/legacy-codex", "sessions") },
        { provider: "claude", dir: path.join("/legacy-claude", "projects") },
      ]);
    }),
  );

  it.effect("lets canonical providerInstances entries replace their legacy mirrors", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const settings = decodeServerSettings({
        providers: {
          codex: { homePath: "/legacy-codex" },
          claudeAgent: { homePath: "/legacy-claude" },
        },
        providerInstances: {
          codex: { driver: "codex", config: { homePath: "/instance-codex" } },
          claudeAgent: {
            driver: "claudeAgent",
            environment: [{ name: "CLAUDE_CONFIG_DIR", value: "/instance-claude" }],
          },
        },
      });

      expect(
        yield* resolveConfiguredTranscriptDirs(settings, {
          CLAUDE_CONFIG_DIR: "/process-claude",
        }),
      ).toEqual([
        { provider: "codex", dir: path.join("/instance-codex", "sessions") },
        { provider: "claude", dir: path.join("/instance-claude", "projects") },
      ]);
    }),
  );
});
