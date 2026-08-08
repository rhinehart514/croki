import {
  USAGE_CONTRACT_VERSION,
  type EnvironmentId,
  type UsageBucket,
  type UsageDay,
  type UsageProviderKind,
  type UsageSourceFingerprint,
  type UsageSourceStatus,
  type UsageSummary,
} from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { mergeUsage, type EnvironmentUsage } from "./usageMerge";

const defaultSourceFingerprint: UsageSourceFingerprint = {
  hostId: "mac",
  provider: "claude",
  resolvedHomePath: "/a/.claude",
  volumeId: "vol-mac",
};

function bucket(overrides: Partial<UsageBucket> = {}): UsageBucket {
  return {
    sourceFingerprint: defaultSourceFingerprint,
    day: "2026-08-07" as UsageDay,
    provider: "claude",
    model: "claude-fable-5",
    totals: {
      uncachedInputTokens: 100,
      cachedInputTokens: 1000,
      cacheCreationTokens: 10,
      outputTokens: 50,
      reasoningTokens: 0,
    },
    costUsd: 10,
    cacheSavingsUsd: 2,
    costSource: "modelPriced",
    records: 5,
    providerReportedRecords: 0,
    modelPricedRecords: 5,
    unpricedRecords: 0,
    sessions: 1,
    ...overrides,
  };
}

function summary(
  buckets: readonly UsageBucket[],
  sources: readonly {
    provider: UsageProviderKind;
    hostId: string;
    homePath: string;
    volumeId?: string;
    distinctSessions?: number;
    status?: UsageSourceStatus;
  }[],
  contractVersion: number = USAGE_CONTRACT_VERSION,
): UsageSummary {
  return {
    contractVersion,
    readAt: "2026-08-07T00:00:00.000Z",
    timeZone: "UTC",
    sinceDay: "2026-08-01" as UsageDay,
    untilDay: "2026-08-31" as UsageDay,
    buckets: buckets.map((usageBucket) => {
      const exactSource = sources.find(
        (source) =>
          source.hostId === usageBucket.sourceFingerprint.hostId &&
          source.provider === usageBucket.sourceFingerprint.provider &&
          source.homePath === usageBucket.sourceFingerprint.resolvedHomePath &&
          (source.volumeId ?? `vol-${source.hostId}`) === usageBucket.sourceFingerprint.volumeId,
      );
      const source =
        exactSource ?? sources.find((candidate) => candidate.provider === usageBucket.provider);
      if (source === undefined) return usageBucket;
      return {
        ...usageBucket,
        sourceFingerprint: {
          hostId: source.hostId,
          provider: source.provider,
          resolvedHomePath: source.homePath,
          volumeId: source.volumeId ?? `vol-${source.hostId}`,
        },
      };
    }),
    sources: sources.map((source) => ({
      fingerprint: {
        hostId: source.hostId,
        provider: source.provider,
        resolvedHomePath: source.homePath,
        volumeId: source.volumeId ?? `vol-${source.hostId}`,
      },
      status: source.status ?? "ok",
      scannedFiles: 1,
      skippedFiles: 0,
      malformedRecords: 0,
      distinctSessions: source.distinctSessions ?? 1,
      message: null,
    })),
    pricing: { status: "fresh", source: "litellm", fetchedAt: null, knownModels: 10 },
    scanDurationMs: 1,
  };
}

function environment(id: string, usageSummary: UsageSummary): EnvironmentUsage {
  return { environmentId: id as EnvironmentId, label: id, summary: usageSummary };
}

describe("mergeUsage", () => {
  it("sums environments that read different transcript directories", () => {
    const merged = mergeUsage(
      [
        environment(
          "env-a",
          summary([bucket()], [{ provider: "claude", hostId: "mac", homePath: "/a/.claude" }]),
        ),
        environment(
          "env-b",
          summary([bucket()], [{ provider: "claude", hostId: "linux", homePath: "/b/.claude" }]),
        ),
      ],
      USAGE_CONTRACT_VERSION,
    );

    expect(merged.costUsd).toBe(20);
    expect(merged.records).toBe(10);
    expect(merged.duplicateSources).toHaveLength(0);
  });

  it("counts a shared transcript directory once", () => {
    // Two worktree servers on one machine resolve the same provider home.
    const shared = { provider: "claude" as const, hostId: "mac", homePath: "/home/theo/.claude" };
    const merged = mergeUsage(
      [
        environment("env-a", summary([bucket()], [shared])),
        environment("env-b", summary([bucket()], [shared])),
      ],
      USAGE_CONTRACT_VERSION,
    );

    expect(merged.costUsd).toBe(10);
    expect(merged.records).toBe(5);
    expect(merged.sessions).toBe(1);
    expect(merged.duplicateSources).toHaveLength(1);
    expect(merged.contributingEnvironments).toEqual(["env-a"]);
  });

  it("keeps buckets scoped to their owned source when root sets overlap", () => {
    const shared = {
      provider: "claude" as const,
      hostId: "mac",
      homePath: "/shared/.claude",
      volumeId: "vol-shared",
    };
    const unique = {
      provider: "claude" as const,
      hostId: "mac",
      homePath: "/work/.claude",
      volumeId: "vol-work",
    };
    const merged = mergeUsage(
      [
        environment("env-a", summary([bucket({ costUsd: 10 })], [shared])),
        environment(
          "env-b",
          summary(
            [
              bucket({
                costUsd: 10,
                sourceFingerprint: {
                  hostId: shared.hostId,
                  provider: shared.provider,
                  resolvedHomePath: shared.homePath,
                  volumeId: shared.volumeId,
                },
              }),
              bucket({
                costUsd: 20,
                sourceFingerprint: {
                  hostId: unique.hostId,
                  provider: unique.provider,
                  resolvedHomePath: unique.homePath,
                  volumeId: unique.volumeId,
                },
              }),
            ],
            [shared, unique],
          ),
        ),
      ],
      USAGE_CONTRACT_VERSION,
    );

    expect(merged.costUsd).toBe(30);
    expect(merged.records).toBe(10);
    expect(merged.contributingEnvironments).toEqual(["env-a", "env-b"]);
  });

  it("prefers a complete duplicate source over the lower environment id", () => {
    const shared = {
      provider: "claude" as const,
      hostId: "mac",
      homePath: "/shared/.claude",
      volumeId: "vol-shared",
    };
    const merged = mergeUsage(
      [
        environment("env-a", summary([bucket({ costUsd: 7 })], [{ ...shared, status: "partial" }])),
        environment("env-b", summary([bucket({ costUsd: 10 })], [shared])),
      ],
      USAGE_CONTRACT_VERSION,
    );

    expect(merged.costUsd).toBe(10);
    expect(merged.contributingEnvironments).toEqual(["env-b"]);
    expect(merged.duplicateSources).toEqual(["env-a: /shared/.claude"]);
  });

  it("drops only the duplicated provider, keeping the environment's other one", () => {
    const sharedClaude = {
      provider: "claude" as const,
      hostId: "mac",
      homePath: "/home/theo/.claude",
    };
    const merged = mergeUsage(
      [
        environment("env-a", summary([bucket()], [sharedClaude])),
        environment(
          "env-b",
          summary(
            [bucket(), bucket({ provider: "codex", model: "gpt-5.6-sol", costUsd: 4 })],
            [sharedClaude, { provider: "codex", hostId: "mac", homePath: "/home/theo/.codex" }],
          ),
        ),
      ],
      USAGE_CONTRACT_VERSION,
    );

    // env-b's claude bucket is dropped, its codex bucket survives.
    expect(merged.costUsd).toBe(14);
    expect(merged.providers.map((provider) => provider.provider).sort()).toEqual([
      "claude",
      "codex",
    ]);
  });

  it("excludes an environment reporting an older contract version", () => {
    const merged = mergeUsage(
      [
        environment(
          "env-a",
          summary([bucket()], [{ provider: "claude", hostId: "mac", homePath: "/a" }]),
        ),
        environment(
          "env-b",
          summary(
            [bucket()],
            [{ provider: "claude", hostId: "linux", homePath: "/b" }],
            USAGE_CONTRACT_VERSION - 1,
          ),
        ),
      ],
      USAGE_CONTRACT_VERSION,
    );

    expect(merged.costUsd).toBe(10);
    expect(merged.staleEnvironments).toEqual(["env-b"]);
  });

  it("derives provider shares and cost quality", () => {
    const merged = mergeUsage(
      [
        environment(
          "env-a",
          summary(
            [
              bucket({ costUsd: 75 }),
              bucket({
                provider: "codex",
                model: "gpt-5.6-sol",
                costUsd: 25,
                modelPricedRecords: 0,
                unpricedRecords: 5,
              }),
            ],
            [
              { provider: "claude", hostId: "mac", homePath: "/a/.claude" },
              { provider: "codex", hostId: "mac", homePath: "/a/.codex" },
            ],
          ),
        ),
      ],
      USAGE_CONTRACT_VERSION,
    );

    expect(merged.providers[0]?.provider).toBe("claude");
    expect(merged.providers[0]?.costShare).toBeCloseTo(0.75, 5);
    expect(merged.costQuality.unpricedShare).toBeCloseTo(0.5, 5);
    expect(merged.costQuality.unpricedRecords).toBe(5);
    expect(merged.costQuality.cacheSavingsUsd).toBe(4);
    expect(merged.providers[1]?.unpricedRecords).toBe(5);
    expect(merged.models[1]?.unpricedRecords).toBe(5);
    expect(merged.daily[0]?.unpricedRecords).toBe(5);
  });

  it("uses explicit per-record cost provenance for mixed buckets", () => {
    const merged = mergeUsage(
      [
        environment(
          "env-a",
          summary(
            [
              bucket({
                records: 5,
                providerReportedRecords: 2,
                modelPricedRecords: 3,
                costSource: "modelPriced",
              }),
            ],
            [{ provider: "claude", hostId: "mac", homePath: "/a/.claude" }],
          ),
        ),
      ],
      USAGE_CONTRACT_VERSION,
    );

    expect(merged.costQuality.providerReportedShare).toBeCloseTo(0.4, 5);
    expect(merged.costQuality.modelPricedShare).toBeCloseTo(0.6, 5);
  });

  it("preserves unavailable rate-table provenance for wholly unpriced usage", () => {
    const unavailableSummary = {
      ...summary(
        [
          bucket({
            costUsd: 0,
            costSource: "unpriced",
            modelPricedRecords: 0,
            unpricedRecords: 5,
          }),
        ],
        [{ provider: "claude", hostId: "mac", homePath: "/a/.claude" }],
      ),
      pricing: {
        status: "unavailable" as const,
        source: "litellm",
        fetchedAt: null,
        knownModels: 0,
      },
    };

    const merged = mergeUsage([environment("env-a", unavailableSummary)], USAGE_CONTRACT_VERSION);

    expect(merged.costUsd).toBe(0);
    expect(merged.totalTokens).toBeGreaterThan(0);
    expect(merged.costQuality.unpricedRecords).toBe(merged.records);
    expect(merged.costQuality.pricingStatuses).toEqual(["unavailable"]);
    expect(merged.providers[0]).toMatchObject({ costUsd: 0, records: 5, unpricedRecords: 5 });
  });

  it("keeps two machines apart when hostname and home path collide", () => {
    // Every Mac resolves /Users/theo/.claude, so a hostname clash used to make
    // one machine's usage vanish. Filesystem identity separates them.
    const shape = { provider: "claude" as const, hostId: "mac", homePath: "/Users/theo/.claude" };
    const merged = mergeUsage(
      [
        environment("env-a", summary([bucket()], [{ ...shape, volumeId: "16777220:1234" }])),
        environment("env-b", summary([bucket()], [{ ...shape, volumeId: "16777221:9999" }])),
      ],
      USAGE_CONTRACT_VERSION,
    );

    expect(merged.costUsd).toBe(20);
    expect(merged.duplicateSources).toHaveLength(0);
  });

  it("still collapses two servers reading the same directory", () => {
    const same = {
      provider: "claude" as const,
      hostId: "mac",
      homePath: "/Users/theo/.claude",
      volumeId: "16777220:1234",
    };
    const merged = mergeUsage(
      [
        environment("env-a", summary([bucket()], [same])),
        environment("env-b", summary([bucket()], [same])),
      ],
      USAGE_CONTRACT_VERSION,
    );

    expect(merged.costUsd).toBe(10);
    expect(merged.duplicateSources).toHaveLength(1);
  });

  it("totals sessions from per-directory distinct counts, not per-bucket sums", () => {
    // One session that spans two days appears in two buckets. Summing bucket
    // sessions would say 2; the source's distinct count says 1.
    const merged = mergeUsage(
      [
        environment(
          "env-a",
          summary(
            [bucket({ day: "2026-08-06" as UsageDay }), bucket({ day: "2026-08-07" as UsageDay })],
            [
              {
                provider: "claude",
                hostId: "mac",
                homePath: "/a/.claude",
                distinctSessions: 1,
              },
            ],
          ),
        ),
      ],
      USAGE_CONTRACT_VERSION,
    );

    expect(merged.sessions).toBe(1);
  });

  it("returns empty totals with no environments", () => {
    const merged = mergeUsage([], USAGE_CONTRACT_VERSION);
    expect(merged.costUsd).toBe(0);
    expect(merged.daily).toHaveLength(0);
  });
});
