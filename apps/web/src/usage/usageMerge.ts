/**
 * Merges per-environment usage summaries into the single view the page renders.
 *
 * Pure, so the de-duplication and derivation rules can be tested without a
 * connected environment.
 *
 * @module usageMerge
 */
import type {
  EnvironmentId,
  UsageBucket,
  UsagePricingStatus,
  UsageProviderKind,
  UsageSource,
  UsageSourceFingerprint,
  UsageSummary,
} from "@croki/contracts";

export interface EnvironmentUsage {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly summary: UsageSummary;
}

export interface ProviderTotals {
  readonly provider: UsageProviderKind;
  readonly costUsd: number;
  readonly totalTokens: number;
  readonly records: number;
  readonly unpricedRecords: number;
  readonly costShare: number;
  readonly tokenShare: number;
}

export interface ModelTotals {
  readonly model: string;
  readonly provider: UsageProviderKind;
  readonly costUsd: number;
  readonly totalTokens: number;
  readonly records: number;
  readonly unpricedRecords: number;
  readonly costShare: number;
}

export interface DailyTotals {
  readonly day: string;
  readonly costUsd: number;
  readonly totalTokens: number;
  readonly records: number;
  readonly unpricedRecords: number;
  readonly byProvider: ReadonlyMap<
    UsageProviderKind,
    { costUsd: number; totalTokens: number; records: number; unpricedRecords: number }
  >;
}

export interface CostQuality {
  readonly providerReportedShare: number;
  readonly modelPricedShare: number;
  readonly unpricedShare: number;
  readonly unpricedRecords: number;
  readonly cacheSavingsUsd: number;
  /** Rate-table states reported by environments that contributed usage. */
  readonly pricingStatuses: readonly UsagePricingStatus[];
}

export interface MergedUsage {
  readonly costUsd: number;
  readonly uncachedInputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheCreationTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly records: number;
  readonly sessions: number;
  readonly providers: readonly ProviderTotals[];
  readonly models: readonly ModelTotals[];
  readonly daily: readonly DailyTotals[];
  readonly costQuality: CostQuality;
  /** Environments whose data was dropped as a duplicate of another's. */
  readonly duplicateSources: readonly string[];
  readonly contributingEnvironments: readonly EnvironmentId[];
  readonly staleEnvironments: readonly EnvironmentId[];
}

/**
 * Two sources are the same physical transcript directory only when host,
 * provider, path and filesystem identity all agree.
 *
 * `volumeId` is what stops two machines that happen to share a hostname and a
 * home path, which is every Mac in a fleet, from collapsing into one source and
 * having one of them silently dropped.
 */
function fingerprintKey(fingerprint: UsageSourceFingerprint): string {
  return [
    fingerprint.hostId,
    fingerprint.provider,
    fingerprint.resolvedHomePath,
    fingerprint.volumeId,
  ].join(" ");
}

/**
 * Decides which environment owns each physical transcript directory.
 *
 * Several environments on one machine (worktree servers, for instance) resolve
 * the same provider home and would otherwise double count every token. The
 * most complete readable source claims a fingerprint; status ties break by
 * environment id so the winner does not change between renders.
 */
function claimSources(environments: readonly EnvironmentUsage[]): {
  readonly ownerByFingerprint: ReadonlyMap<string, EnvironmentId>;
  readonly duplicates: readonly string[];
} {
  const ownerByFingerprint = new Map<string, EnvironmentId>();
  const duplicates: string[] = [];
  const candidatesByFingerprint = new Map<
    string,
    Array<{ readonly environment: EnvironmentUsage; readonly source: UsageSource }>
  >();

  for (const environment of environments) {
    for (const source of environment.summary.sources) {
      if (source.status === "missing") continue;
      const key = fingerprintKey(source.fingerprint);
      const candidates = candidatesByFingerprint.get(key) ?? [];
      candidates.push({ environment, source });
      candidatesByFingerprint.set(key, candidates);
    }
  }

  for (const [key, candidates] of candidatesByFingerprint) {
    candidates.sort(
      (a, b) =>
        sourceStatusRank(b.source.status) - sourceStatusRank(a.source.status) ||
        a.environment.environmentId.localeCompare(b.environment.environmentId),
    );
    const winner = candidates[0];
    if (winner === undefined) continue;
    ownerByFingerprint.set(key, winner.environment.environmentId);
    for (const duplicate of candidates.slice(1)) {
      duplicates.push(
        `${duplicate.environment.label}: ${duplicate.source.fingerprint.resolvedHomePath}`,
      );
    }
  }

  return { ownerByFingerprint, duplicates: duplicates.sort() };
}

function sourceStatusRank(status: UsageSource["status"]): number {
  switch (status) {
    case "ok":
      return 3;
    case "partial":
      return 2;
    case "failed":
      return 1;
    case "missing":
      return 0;
  }
}

/** Sources this environment owns after fingerprint claims, plus their buckets. */
function ownedContribution(
  environment: EnvironmentUsage,
  ownerByFingerprint: ReadonlyMap<string, EnvironmentId>,
): { readonly buckets: readonly UsageBucket[]; readonly sessions: number } {
  const ownedFingerprints = new Set<string>();
  let sessions = 0;
  for (const source of environment.summary.sources) {
    if (source.status === "missing") continue;
    const key = fingerprintKey(source.fingerprint);
    if (ownerByFingerprint.get(key) === environment.environmentId) {
      ownedFingerprints.add(key);
      // Distinct within a directory. Summing per-bucket session counts instead
      // would count a session once per day and model it spans.
      sessions += source.distinctSessions;
    }
  }
  return {
    buckets: environment.summary.buckets.filter((bucket) =>
      ownedFingerprints.has(fingerprintKey(bucket.sourceFingerprint)),
    ),
    sessions,
  };
}

function bucketTokens(bucket: UsageBucket): number {
  // reasoningTokens is a subset of outputTokens and must not be added again.
  return (
    bucket.totals.uncachedInputTokens +
    bucket.totals.cachedInputTokens +
    bucket.totals.cacheCreationTokens +
    bucket.totals.outputTokens
  );
}

const EMPTY_MERGED: MergedUsage = {
  costUsd: 0,
  uncachedInputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  records: 0,
  sessions: 0,
  providers: [],
  models: [],
  daily: [],
  costQuality: {
    providerReportedShare: 0,
    modelPricedShare: 0,
    unpricedShare: 0,
    unpricedRecords: 0,
    cacheSavingsUsd: 0,
    pricingStatuses: [],
  },
  duplicateSources: [],
  contributingEnvironments: [],
  staleEnvironments: [],
};

/**
 * Merges every connected environment's summary.
 *
 * `expectedContractVersion` guards against an environment running older server
 * code: rather than blocking the page, its data is excluded and its id is
 * reported so the UI can say coverage is partial.
 */
export function mergeUsage(
  environments: readonly EnvironmentUsage[],
  expectedContractVersion: number,
): MergedUsage {
  if (environments.length === 0) return EMPTY_MERGED;

  const current: EnvironmentUsage[] = [];
  const staleEnvironments: EnvironmentId[] = [];
  for (const environment of environments) {
    if (environment.summary.contractVersion === expectedContractVersion) {
      current.push(environment);
    } else {
      staleEnvironments.push(environment.environmentId);
    }
  }

  const { ownerByFingerprint, duplicates } = claimSources(current);

  let costUsd = 0;
  let uncachedInputTokens = 0;
  let cachedInputTokens = 0;
  let cacheCreationTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let records = 0;
  let sessions = 0;
  let cacheSavingsUsd = 0;
  let providerReportedRecords = 0;
  let modelPricedRecords = 0;
  let unpricedRecords = 0;
  const pricingStatuses = new Set<UsagePricingStatus>();

  const providerAccumulator = new Map<
    UsageProviderKind,
    { costUsd: number; totalTokens: number; records: number; unpricedRecords: number }
  >();
  const modelAccumulator = new Map<
    string,
    {
      provider: UsageProviderKind;
      costUsd: number;
      totalTokens: number;
      records: number;
      unpricedRecords: number;
    }
  >();
  const dailyAccumulator = new Map<
    string,
    {
      costUsd: number;
      totalTokens: number;
      records: number;
      unpricedRecords: number;
      byProvider: Map<
        UsageProviderKind,
        { costUsd: number; totalTokens: number; records: number; unpricedRecords: number }
      >;
    }
  >();
  const contributingEnvironments: EnvironmentId[] = [];

  for (const environment of current) {
    const { buckets, sessions: environmentSessions } = ownedContribution(
      environment,
      ownerByFingerprint,
    );
    if (buckets.length > 0) {
      contributingEnvironments.push(environment.environmentId);
      pricingStatuses.add(environment.summary.pricing.status);
    }
    sessions += environmentSessions;

    for (const bucket of buckets) {
      const tokens = bucketTokens(bucket);

      costUsd += bucket.costUsd;
      cacheSavingsUsd += bucket.cacheSavingsUsd;
      uncachedInputTokens += bucket.totals.uncachedInputTokens;
      cachedInputTokens += bucket.totals.cachedInputTokens;
      cacheCreationTokens += bucket.totals.cacheCreationTokens;
      outputTokens += bucket.totals.outputTokens;
      reasoningTokens += bucket.totals.reasoningTokens;
      records += bucket.records;
      unpricedRecords += bucket.unpricedRecords;
      providerReportedRecords += bucket.providerReportedRecords;
      modelPricedRecords += bucket.modelPricedRecords;

      const provider = providerAccumulator.get(bucket.provider) ?? {
        costUsd: 0,
        totalTokens: 0,
        records: 0,
        unpricedRecords: 0,
      };
      provider.costUsd += bucket.costUsd;
      provider.totalTokens += tokens;
      provider.records += bucket.records;
      provider.unpricedRecords += bucket.unpricedRecords;
      providerAccumulator.set(bucket.provider, provider);

      const modelKey = `${bucket.provider} ${bucket.model}`;
      const model = modelAccumulator.get(modelKey) ?? {
        provider: bucket.provider,
        costUsd: 0,
        totalTokens: 0,
        records: 0,
        unpricedRecords: 0,
      };
      model.costUsd += bucket.costUsd;
      model.totalTokens += tokens;
      model.records += bucket.records;
      model.unpricedRecords += bucket.unpricedRecords;
      modelAccumulator.set(modelKey, model);

      const day = dailyAccumulator.get(bucket.day) ?? {
        costUsd: 0,
        totalTokens: 0,
        records: 0,
        unpricedRecords: 0,
        byProvider: new Map<
          UsageProviderKind,
          { costUsd: number; totalTokens: number; records: number; unpricedRecords: number }
        >(),
      };
      day.costUsd += bucket.costUsd;
      day.totalTokens += tokens;
      day.records += bucket.records;
      day.unpricedRecords += bucket.unpricedRecords;
      const dayProvider = day.byProvider.get(bucket.provider) ?? {
        costUsd: 0,
        totalTokens: 0,
        records: 0,
        unpricedRecords: 0,
      };
      dayProvider.costUsd += bucket.costUsd;
      dayProvider.totalTokens += tokens;
      dayProvider.records += bucket.records;
      dayProvider.unpricedRecords += bucket.unpricedRecords;
      day.byProvider.set(bucket.provider, dayProvider);
      dailyAccumulator.set(bucket.day, day);
    }
  }

  const totalTokens = uncachedInputTokens + cachedInputTokens + cacheCreationTokens + outputTokens;

  const providers: ProviderTotals[] = [...providerAccumulator.entries()]
    .map(([provider, totals]) => ({
      provider,
      costUsd: totals.costUsd,
      totalTokens: totals.totalTokens,
      records: totals.records,
      unpricedRecords: totals.unpricedRecords,
      costShare: costUsd === 0 ? 0 : totals.costUsd / costUsd,
      tokenShare: totalTokens === 0 ? 0 : totals.totalTokens / totalTokens,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const models: ModelTotals[] = [...modelAccumulator.entries()]
    .map(([key, totals]) => ({
      model: key.slice(key.indexOf(" ") + 1),
      provider: totals.provider,
      costUsd: totals.costUsd,
      totalTokens: totals.totalTokens,
      records: totals.records,
      unpricedRecords: totals.unpricedRecords,
      costShare: costUsd === 0 ? 0 : totals.costUsd / costUsd,
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens);

  const daily: DailyTotals[] = [...dailyAccumulator.entries()]
    .map(([day, totals]) => ({
      day,
      costUsd: totals.costUsd,
      totalTokens: totals.totalTokens,
      records: totals.records,
      unpricedRecords: totals.unpricedRecords,
      byProvider: totals.byProvider,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    costUsd,
    uncachedInputTokens,
    cachedInputTokens,
    cacheCreationTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    records,
    sessions,
    providers,
    models,
    daily,
    costQuality: {
      providerReportedShare: records === 0 ? 0 : providerReportedRecords / records,
      unpricedShare: records === 0 ? 0 : unpricedRecords / records,
      unpricedRecords,
      modelPricedShare: records === 0 ? 0 : modelPricedRecords / records,
      cacheSavingsUsd,
      pricingStatuses: [...pricingStatuses].sort(),
    },
    duplicateSources: duplicates,
    contributingEnvironments,
    staleEnvironments,
  };
}
