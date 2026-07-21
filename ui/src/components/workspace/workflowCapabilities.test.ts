import { describe, expect, it } from "vitest";
import { workflowCapabilities } from "./workflowCapabilities";

describe("workflowCapabilities", () => {
  it("separates Gmail observation from founder-gated sending", () => {
    const result = workflowCapabilities([{ provider: "gmail", label: "Gmail", savedAt: "now", hasToken: true, authType: "oauth", accountAddress: "founder@example.com" }]);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "gmail.read", authority: "read" }),
      expect.objectContaining({ id: "gmail.send", authority: "founder-gate" }),
    ]));
  });

  it("shows connected API credentials and configured agent tools without secrets", () => {
    const result = workflowCapabilities(
      [{ provider: "exa", label: "Exa Search", savedAt: "now", hasToken: true, authType: "token" }],
      [{ ref: "agent:one", name: "One", label: null, perspective: null, activation: "direct", capabilities: { firmTools: true, additional: ["crm.lookup"] }, context: { scope: "venture", instructions: null }, memory: { scope: "venture", instructions: null }, runtime: { provider: null, model: null }, budget: { maxSteps: null, dailySpendUsd: null }, authority: { outwardEffects: "wall" }, evaluation: { signals: [], instructions: null } }],
    );
    expect(result.map((capability) => capability.id)).toEqual(expect.arrayContaining(["exa.api", "crm.lookup"]));
    expect(JSON.stringify(result)).not.toContain("token");
  });
});
