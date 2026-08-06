import { describe, expect, it } from "vite-plus/test";

import { resolveMobileServerUpdate } from "./mobileServerUpdates.logic";

describe("resolveMobileServerUpdate", () => {
  it("offers the server-advertised automatic path for version drift", () => {
    expect(
      resolveMobileServerUpdate({
        clientVersion: "0.4.8",
        serverVersion: "0.4.7",
        selfUpdate: "boot-service",
      }),
    ).toEqual({
      command: "npx croki-server@0.4.8 serve",
      serverVersion: "0.4.7",
      selfUpdate: "boot-service",
      targetVersion: "0.4.8",
    });
  });

  it("falls back to an exact Croki-owned command", () => {
    expect(
      resolveMobileServerUpdate({
        clientVersion: "0.4.8",
        serverVersion: "0.4.7",
        selfUpdate: undefined,
      })?.command,
    ).toBe("npx croki-server@0.4.8 serve");
  });

  it("stays absent when either version is unknown or already aligned", () => {
    expect(
      resolveMobileServerUpdate({
        clientVersion: "0.4.8",
        serverVersion: "0.4.8",
        selfUpdate: "boot-service",
      }),
    ).toBeNull();
    expect(
      resolveMobileServerUpdate({
        clientVersion: null,
        serverVersion: "0.4.7",
        selfUpdate: "boot-service",
      }),
    ).toBeNull();
  });
});
