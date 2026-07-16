import { beforeEach, describe, expect, it, vi } from "vitest";
import { readUxMetrics, recordUxMetric } from "./ux-metrics";

describe("private UX metrics boundary", () => {
  beforeEach(() => localStorage.clear());

  it("persists metadata only and never sends a network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network must stay unused"));
    recordUxMetric("correction_sent", "venture-private", 248);

    const [stored] = readUxMetrics();
    expect(Object.keys(stored).sort()).toEqual(["at", "durationMs", "event", "ventureId"]);
    expect(JSON.stringify(stored)).not.toContain("venture copy");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps a bounded local history", () => {
    for (let index = 0; index < 240; index += 1) {
      recordUxMetric("stale_incident", `venture-${index}`);
    }
    const stored = readUxMetrics();
    expect(stored).toHaveLength(200);
    expect(stored[0].ventureId).toBe("venture-40");
    expect(stored.at(-1)?.ventureId).toBe("venture-239");
  });

  it("fails quiet when local data is unreadable", () => {
    localStorage.setItem("drover:private-ux-metrics:v1", "not-json");
    expect(readUxMetrics()).toEqual([]);
    expect(() => recordUxMetric("wall_left_pending", "venture-1")).not.toThrow();
    expect(readUxMetrics()).toHaveLength(1);
  });
});
