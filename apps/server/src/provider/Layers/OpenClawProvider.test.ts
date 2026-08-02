import { OpenClawSettings } from "@t3tools/contracts";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect } from "vite-plus/test";

import {
  buildInitialOpenClawProviderSnapshot,
  configuredOpenClawAgentModel,
  hasConfiguredOpenClawAgent,
  OPENCLAW_NATIVE_MODEL,
} from "./OpenClawProvider.ts";

const decodeSettings = Schema.decodeSync(OpenClawSettings);

describe("OpenClaw provider", () => {
  it.effect("advertises the configured agent's native behavior", () =>
    Effect.gen(function* () {
      const provider = yield* buildInitialOpenClawProviderSnapshot(decodeSettings({}));

      expect(provider.displayName).toBe("OpenClaw");
      expect(provider.models).toMatchObject([
        {
          slug: OPENCLAW_NATIVE_MODEL,
          name: "Agent default",
        },
      ]);
      expect(provider.status).toBe("warning");
    }),
  );

  it("reads the configured orchestrator model from OpenClaw's agent list", () => {
    expect(
      configuredOpenClawAgentModel(
        JSON.stringify([
          { id: "main", model: "anthropic/claude-sonnet-5" },
          { id: "croki", model: { primary: "openai/gpt-5.6-sol" } },
        ]),
        "croki",
      ),
    ).toBe("openai/gpt-5.6-sol");
    expect(hasConfiguredOpenClawAgent(JSON.stringify([{ id: "croki" }]), "croki")).toBe(true);
    expect(hasConfiguredOpenClawAgent(JSON.stringify([{ id: "main" }]), "croki")).toBe(false);
    expect(configuredOpenClawAgentModel("not-json", "croki")).toBeUndefined();
  });
});
