import { describe, expect, it } from "vite-plus/test";
import type { ServerProvider } from "@croki/contracts";

import {
  deriveOpenClawAgents,
  getOpenClawAgentStatus,
  updateOpenClawAgentId,
} from "./OpenClawAgentPicker";

const provider = {
  openClawAgents: [
    {
      id: "croki",
      name: "Croki",
      model: "openai/gpt-5.6",
      workspace: "/tmp/croki",
      isDefault: false,
    },
    {
      id: "main",
      name: "Main",
      model: "anthropic/claude-sonnet",
      workspace: "/workspace",
      isDefault: true,
    },
    {
      id: "croki",
      name: "Duplicate",
      isDefault: false,
    },
  ],
} as unknown as ServerProvider;

describe("OpenClawAgentPicker helpers", () => {
  it("puts the native default first and removes duplicate agent ids", () => {
    expect(deriveOpenClawAgents(provider).map((agent) => agent.id)).toEqual(["main", "croki"]);
  });

  it("updates only the selected agent while preserving other config", () => {
    expect(updateOpenClawAgentId({ binaryPath: "openclaw", agentId: "croki" }, "main")).toEqual({
      binaryPath: "openclaw",
      agentId: "main",
    });
  });

  it("removes an empty custom id without dropping other settings", () => {
    expect(updateOpenClawAgentId({ binaryPath: "openclaw", agentId: "main" }, " ")).toEqual({
      binaryPath: "openclaw",
    });
  });

  it("treats an explicit remote id as ready when native discovery is unavailable", () => {
    const readyProvider = { status: "ready" } as unknown as ServerProvider;
    expect(getOpenClawAgentStatus(readyProvider, 0, "remote-main")).toMatchObject({
      label: "Custom agent configured",
      className: "text-emerald-500",
    });
  });
});
