import type { UsagePricingStatus } from "@croki/contracts";

import { formatPercent, formatUsd } from "./usageFormat";

export type CostCompleteness = "complete" | "partial" | "unavailable";

export interface CostCoverage {
  readonly records: number;
  readonly unpricedRecords: number;
}

/**
 * Turns record-level pricing coverage into the promise a dollar figure may
 * honestly make. A partial value is a known lower bound, never a total.
 */
export function costCompleteness({ records, unpricedRecords }: CostCoverage): CostCompleteness {
  if (records === 0 || unpricedRecords === 0) return "complete";
  return unpricedRecords === records ? "unavailable" : "partial";
}

export function formatCoveredCost(costUsd: number, coverage: CostCoverage): string {
  switch (costCompleteness(coverage)) {
    case "unavailable":
      return "Unavailable";
    case "partial":
      return `${formatUsd(costUsd)}+`;
    case "complete":
      return formatUsd(costUsd);
  }
}

export function describeCostCoverage(coverage: CostCoverage): string {
  const completeness = costCompleteness(coverage);
  if (completeness === "unavailable") {
    return "Pricing is unavailable for this usage. Token totals are still complete.";
  }
  if (completeness === "partial") {
    return `Partial estimate · ${formatPercent(coverage.unpricedRecords / coverage.records)} of records could not be priced.`;
  }
  return "If billed at full API rate.";
}

export function formatPricingStatuses(statuses: readonly UsagePricingStatus[]): string {
  const status = statuses[0];
  if (status === undefined) return "Not needed";
  if (statuses.length > 1) return "Mixed";
  switch (status) {
    case "fresh":
      return "Fresh";
    case "cached":
      return "Cached";
    case "unavailable":
      return "Unavailable";
  }
}
