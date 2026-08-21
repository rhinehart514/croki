import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { USAGE_CONTRACT_VERSION, UsageBucket } from "./usage.ts";

describe("usage contract", () => {
  it("carries hourly resolution and aggregate cost provenance in v4 buckets", () => {
    const decoded = Schema.decodeUnknownSync(UsageBucket)({
      day: "2026-08-08",
      hourStart: "2026-08-08T14:00:00.000Z",
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
      unpricedRecords: 0,
      sessions: 1,
    });

    expect(USAGE_CONTRACT_VERSION).toBe(4);
    expect(decoded.hourStart).toBe("2026-08-08T14:00:00.000Z");
    expect(decoded.costSource).toBe("modelPriced");
  });
});
