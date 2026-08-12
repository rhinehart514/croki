import { describe, expect, it } from "vite-plus/test";

import {
  costCompleteness,
  describeCostCoverage,
  formatCoveredCost,
  formatPricingStatuses,
} from "./usageCostPresentation.ts";

describe("usage cost presentation", () => {
  it("does not present wholly unpriced usage as zero cost", () => {
    const coverage = { records: 4, unpricedRecords: 4 };

    expect(costCompleteness(coverage)).toBe("unavailable");
    expect(formatCoveredCost(0, coverage)).toBe("Unavailable");
    expect(describeCostCoverage(coverage)).toContain("Token totals are still complete");
  });

  it("marks a priced subtotal as a lower bound when some records are unpriced", () => {
    const coverage = { records: 4, unpricedRecords: 1 };

    expect(costCompleteness(coverage)).toBe("partial");
    expect(formatCoveredCost(12.5, coverage)).toBe("$12.50+");
    expect(describeCostCoverage(coverage)).toContain("25.0%");
  });

  it("keeps zero cost honest when there was no usage", () => {
    const coverage = { records: 0, unpricedRecords: 0 };

    expect(costCompleteness(coverage)).toBe("complete");
    expect(formatCoveredCost(0, coverage)).toBe("$0.00");
    expect(formatPricingStatuses([])).toBe("Not needed");
  });

  it("summarizes rate-table provenance across environments", () => {
    expect(formatPricingStatuses(["cached"])).toBe("Cached");
    expect(formatPricingStatuses(["fresh", "unavailable"])).toBe("Mixed");
  });
});
