import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishReturnDecisionTimer,
  readUxMetrics,
  recordCodingValueMilestones,
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

  it("keeps historical metric keys readable without using them for current value", () => {
    recordUxMetricOnce("first_grounded_value", "venture-legacy", 20);
    expect(readUxMetrics()).toEqual([expect.objectContaining({
      event: "first_grounded_value",
      ventureId: "venture-legacy",
    })]);
  });

  it("records exact reviewable and verified coding milestones once per venture", () => {
    recordCodingValueMilestones("venture-coding", { exactReviewableMaterial: false, verified: true });
    expect(readUxMetrics()).toEqual([]);

    recordCodingValueMilestones("venture-coding", { exactReviewableMaterial: true, verified: false });
    recordCodingValueMilestones("venture-coding", { exactReviewableMaterial: true, verified: true });
    recordCodingValueMilestones("venture-coding", { exactReviewableMaterial: true, verified: true });

    expect(readUxMetrics().map((entry) => entry.event)).toEqual([
      "first_exact_reviewable_material",
      "first_verified_result",
    ]);
    expect(readUxMetrics().every((entry) => entry.durationMs === null)).toBe(true);
  });

  it("records a once-only milestone once per venture", () => {
    recordUxMetricOnce("first_exact_reviewable_material", "venture-once", 20);
    recordUxMetricOnce("first_exact_reviewable_material", "venture-once", 30);
    expect(readUxMetrics()).toHaveLength(1);
  });

  it("does not repeat a first milestone already stored by an earlier session", () => {
    localStorage.setItem("drover:private-ux-metrics:v1", JSON.stringify([{
      event: "first_verified_result",
      ventureId: "venture-returning",
      at: "2026-07-27T12:00:00.000Z",
      durationMs: null,
    }]));
    recordCodingValueMilestones("venture-returning", { exactReviewableMaterial: true, verified: true });
    expect(readUxMetrics().map((entry) => entry.event)).toEqual([
      "first_verified_result",
      "first_exact_reviewable_material",
    ]);
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
