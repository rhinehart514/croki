import { describe, expect, it } from "vite-plus/test";

import { buildOpenClawTurnPrompt } from "./OpenClawMultiAgentPolicy.ts";

describe("buildOpenClawTurnPrompt", () => {
  it("makes Sol Medium orchestration and Luna Max delegation explicit", () => {
    const prompt = buildOpenClawTurnPrompt("Implement the feature");

    expect(prompt).toContain("GPT-5.6 Sol with medium thinking");
    expect(prompt).toContain('model "openai/gpt-5.6-luna"');
    expect(prompt).toContain('thinking "max"');
    expect(prompt).toContain("sessions_spawn");
    expect(prompt).toContain("do not silently substitute");
    expect(prompt).toMatch(/Implement the feature$/);
  });
});
