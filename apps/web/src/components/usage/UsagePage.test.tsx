import {
  USAGE_CONTRACT_VERSION,
  type EnvironmentId,
  type UsageDay,
  type UsageSourceStatus,
  type UsageSummary,
} from "@croki/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { EnvironmentUsageStatus } from "../../state/usage";
import { UsageCoverageNotice } from "./UsagePage";

function summaryWithSources(
  sources: readonly {
    readonly provider: "claude" | "codex";
    readonly path: string;
    readonly status: UsageSourceStatus;
  }[],
): UsageSummary {
  return {
    contractVersion: USAGE_CONTRACT_VERSION,
    readAt: "2026-08-08T12:00:00.000Z",
    timeZone: "America/New_York",
    sinceDay: "2026-08-01" as UsageDay,
    untilDay: "2026-08-08" as UsageDay,
    buckets: [],
    sources: sources.map((source) => ({
      fingerprint: {
        hostId: "studio-mac",
        provider: source.provider,
        resolvedHomePath: source.path,
        volumeId: `volume:${source.path}`,
      },
      status: source.status,
      scannedFiles: source.status === "partial" ? 2 : 0,
      skippedFiles: source.status === "ok" || source.status === "missing" ? 0 : 1,
      malformedRecords: 0,
      distinctSessions: 0,
      message: null,
    })),
    pricing: { status: "fresh", source: "litellm", fetchedAt: null, knownModels: 1 },
    scanDurationMs: 10,
  };
}

function environment(
  summary: UsageSummary | null,
  overrides: Partial<EnvironmentUsageStatus> = {},
): EnvironmentUsageStatus {
  return {
    environmentId: "env-studio" as EnvironmentId,
    label: "Studio Mac",
    isPending: false,
    error: null,
    summary,
    ...overrides,
  };
}

function renderNotice(
  environments: readonly EnvironmentUsageStatus[],
  staleEnvironments: readonly string[] = [],
): string {
  return renderToStaticMarkup(
    <UsageCoverageNotice
      environments={environments}
      duplicateSources={[]}
      staleEnvironments={staleEnvironments}
      isPartial={false}
    />,
  );
}

describe("UsageCoverageNotice", () => {
  it("names partial and failed sources returned by a successful environment summary", () => {
    const markup = renderNotice([
      environment(
        summaryWithSources([
          { provider: "claude", path: "/Users/jacob/.claude", status: "partial" },
          { provider: "codex", path: "/Users/jacob/.codex", status: "failed" },
        ]),
      ),
    ]);

    expect(markup).toContain(
      "Studio Mac · Claude Code at /Users/jacob/.claude reported partial usage. Totals include readable transcripts only.",
    );
    expect(markup).toContain(
      "Studio Mac · Codex at /Users/jacob/.codex could not report usage. Totals exclude this source.",
    );
  });

  it("does not treat healthy or absent provider directories as incomplete", () => {
    const markup = renderNotice([
      environment(
        summaryWithSources([
          { provider: "claude", path: "/Users/jacob/.claude", status: "ok" },
          { provider: "codex", path: "/Users/jacob/.codex", status: "missing" },
        ]),
      ),
    ]);

    expect(markup).toBe("");
  });

  it("does not repeat stale source provenance beneath the environment-level warning", () => {
    const usage = environment(
      summaryWithSources([{ provider: "claude", path: "/Users/jacob/.claude", status: "partial" }]),
    );
    const markup = renderNotice([usage], [usage.environmentId]);

    expect(markup).toContain(
      "Studio Mac runs an older server version and is excluded from totals.",
    );
    expect(markup).not.toContain("reported partial usage");
  });
});
