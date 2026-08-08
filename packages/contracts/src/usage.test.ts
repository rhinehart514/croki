import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { USAGE_CONTRACT_VERSION, UsageBucket } from "./usage.ts";

describe("usage contract", () => {
  it("carries source scope and mixed per-record cost provenance in v4 buckets", () => {
    const decoded = Schema.decodeUnknownSync(UsageBucket)({
      sourceFingerprint: {
        hostId: "test-host",
        provider: "claude",
        resolvedHomePath: "/test/.claude/projects",
        volumeId: "device:inode",
      },
      day: "2026-08-08",
      provider: "claude",
      model: "claude-fable-5",
      totals: {
        uncachedInputTokens: 1,
        cachedInputTokens: 2,
        cacheCreationTokens: 3,
        outputTokens: 4,
        reasoningTokens: 1,
      },
      costUsd: 0.25,
      cacheSavingsUsd: 0.1,
      costSource: "modelPriced",
      records: 3,
      providerReportedRecords: 1,
      modelPricedRecords: 2,
      unpricedRecords: 0,
      sessions: 1,
    });

    expect(USAGE_CONTRACT_VERSION).toBe(4);
    expect(decoded.sourceFingerprint.resolvedHomePath).toBe("/test/.claude/projects");
    expect(decoded.providerReportedRecords).toBe(1);
    expect(decoded.modelPricedRecords).toBe(2);
  });
});
