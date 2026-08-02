import { OpenClawSettings } from "@t3tools/contracts";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect } from "vite-plus/test";

import {
  buildInitialOpenClawProviderSnapshot,
  configuredOpenClawAgentModel,
  OPENCLAW_ORCHESTRATION_MODEL,
} from "./OpenClawProvider.ts";

const decodeSettings = Schema.decodeSync(OpenClawSettings);

describe("OpenClaw provider", () => {
  it.effect("advertises one understandable Sol/Luna orchestration profile", () =>
    Effect.gen(function* () {
      const provider = yield* buildInitialOpenClawProviderSnapshot(decodeSettings({}));

      expect(provider.displayName).toBe("OpenClaw");
      expect(provider.models).toMatchObject([
        {
          slug: OPENCLAW_ORCHESTRATION_MODEL,
          name: "Sol Medium + Luna Max",
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
    expect(configuredOpenClawAgentModel("not-json", "croki")).toBeUndefined();
  });
});
