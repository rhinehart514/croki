import { describe, expect, it } from "vite-plus/test";

import { buildOpenClawAcpSpawnInput } from "./OpenClawAcpSupport.ts";

describe("buildOpenClawAcpSpawnInput", () => {
  it("starts the OpenClaw ACP bridge and scopes it to the Croki thread", () => {
    expect(
      buildOpenClawAcpSpawnInput(undefined, "/repo", undefined, "agent:croki:croki:thread-1"),
    ).toEqual({
      command: "openclaw",
      args: ["acp", "--session", "agent:croki:croki:thread-1"],
      cwd: "/repo",
    });
  });

  it("preserves remote Gateway arguments and an explicit session override", () => {
    expect(
      buildOpenClawAcpSpawnInput(
        {
          binaryPath: "/opt/openclaw",
          launchArgs: '--url "wss://gateway.example" --session agent:custom:main',
        },
        "/repo",
        { OPENCLAW_TOKEN: "secret" },
        "agent:croki:croki:thread-1",
      ),
    ).toEqual({
      command: "/opt/openclaw",
      args: ["acp", "--url", "wss://gateway.example", "--session", "agent:custom:main"],
      cwd: "/repo",
      env: { OPENCLAW_TOKEN: "secret" },
    });
  });
});
