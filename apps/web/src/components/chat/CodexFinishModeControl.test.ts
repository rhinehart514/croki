import type { CodexGoal } from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { codexGoalStatusLabel, codexGoalUsageLabel } from "./CodexFinishModeControl";

const goal: CodexGoal = {
  objective: "Ship the release" as CodexGoal["objective"],
  status: "active",
  tokenBudget: 25_000,
  tokensUsed: 12_345,
  timeUsedSeconds: 754,
  createdAt: 1,
  updatedAt: 2,
};

describe("Codex Finish mode presentation", () => {
  it("keeps every native terminal state legible", () => {
    expect(codexGoalStatusLabel("active")).toBe("Finishing");
    expect(codexGoalStatusLabel("paused")).toBe("Paused");
    expect(codexGoalStatusLabel("blocked")).toBe("Blocked");
    expect(codexGoalStatusLabel("usageLimited")).toBe("Usage limit");
    expect(codexGoalStatusLabel("budgetLimited")).toBe("Budget reached");
    expect(codexGoalStatusLabel("complete")).toBe("Complete");
  });

  it("reports elapsed work and token usage without implying a percent complete", () => {
    expect(codexGoalUsageLabel(goal)).toBe("12m · 12,345 tokens");
  });
});
