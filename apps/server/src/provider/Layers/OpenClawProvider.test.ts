import { OpenClawSettings } from "@croki/contracts";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect } from "vite-plus/test";

import {
  buildInitialOpenClawProviderSnapshot,
  configuredOpenClawAgentModel,
  hasConfiguredOpenClawAgent,
  OPENCLAW_NATIVE_MODEL,
  parseOpenClawAgents,
  resolveOpenClawAgentId,
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

  it("normalizes native agent inventory and resolves its declared default", () => {
    const agents = parseOpenClawAgents(
      JSON.stringify({
        defaultAgentId: "main",
        agents: [
          {
            id: "main",
            workspace: "/work/main",
            model: "openai/gpt-5.6-sol",
          },
          {
            id: "custom",
            name: "My agent",
            workspace: "/work/custom",
            model: { primary: "anthropic/claude-sonnet-5" },
          },
        ],
      }),
    );

    expect(agents).toEqual([
      {
        id: "main",
        name: "main",
        workspace: "/work/main",
        model: "openai/gpt-5.6-sol",
        isDefault: true,
      },
      {
        id: "custom",
        name: "My agent",
        workspace: "/work/custom",
        model: "anthropic/claude-sonnet-5",
        isDefault: false,
      },
    ]);
    expect(resolveOpenClawAgentId(agents, "")).toBe("main");
    expect(resolveOpenClawAgentId(agents, "custom")).toBe("custom");
  });

  it("uses the first native agent only when OpenClaw omits default metadata", () => {
    expect(parseOpenClawAgents(JSON.stringify([{ id: "first" }, { id: "second" }]))).toEqual([
      { id: "first", name: "first", isDefault: true },
      { id: "second", name: "second", isDefault: false },
    ]);
  });
});
