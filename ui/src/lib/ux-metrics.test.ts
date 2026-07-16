import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishReturnDecisionTimer,
  readUxMetrics,
  recordUxMetric,
  recordUxMetricOnce,
  startReturnDecisionTimer,
  startUxTimer,
} from "./ux-metrics";

describe("private UX metrics", () => {
  beforeEach(() => localStorage.clear());

  it("stores only event metadata and duration on this device", () => {
    recordUxMetric("proof_opened", "venture-1", 12.7);
    expect(readUxMetrics()).toEqual([expect.objectContaining({
      event: "proof_opened",
      ventureId: "venture-1",
      durationMs: 13,
    })]);
  });

  it("records a once-only milestone once per venture", () => {
    recordUxMetricOnce("first_grounded_value", "venture-once", 20);
    recordUxMetricOnce("first_grounded_value", "venture-once", 30);
    expect(readUxMetrics()).toHaveLength(1);
  });

  it("measures elapsed time without storing venture content", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(164);
    startUxTimer("return_first_decision", "venture-2")();
    expect(readUxMetrics()[0].durationMs).toBe(64);
    clock.mockRestore();
  });

  it("measures the first wall decision after a return account appears", () => {
    const clock = vi.spyOn(performance, "now").mockReturnValueOnce(20).mockReturnValueOnce(95);
    startReturnDecisionTimer("venture-return");
    finishReturnDecisionTimer("venture-return");
    expect(readUxMetrics()[0]).toMatchObject({ event: "return_first_decision", durationMs: 75 });
    clock.mockRestore();
  });
});
