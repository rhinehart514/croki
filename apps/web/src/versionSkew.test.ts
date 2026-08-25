import { EnvironmentId } from "@croki/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// Pinned so the direction cases below read as fixed versions instead of
// arithmetic on whatever version this checkout happens to be at.
const branding = vi.hoisted(() => ({ APP_VERSION: "0.0.34" }));
vi.mock("./branding", () => branding);

import { APP_VERSION } from "./branding";
import {
  appendVersionMismatchHint,
  buildVersionMismatchDismissalKey,
  dismissVersionMismatch,
  isVersionMismatchDismissed,
  resolveServerConfigVersionMismatch,
  resolveServerPackageUpdatesAvailable,
  resolveServerSelfUpdateCapability,
  resolveVersionMismatch,
  serverUpdateGuidance,
  serverUpdatePathAvailable,
} from "./versionSkew";

describe("versionSkew", () => {
  beforeEach(() => {
    branding.APP_VERSION = "0.0.34";
  });

  it("does not warn when versions match", () => {
    expect(resolveVersionMismatch(APP_VERSION)).toBeNull();
    expect(resolveVersionMismatch(`v${APP_VERSION}`)).toBeNull();
  });

  it("directs newer clients to update an older server", () => {
    expect(resolveVersionMismatch("0.0.0-alpha.1")).toEqual({
      clientVersion: APP_VERSION,
      serverVersion: "0.0.0-alpha.1",
      updateTarget: "server",
      hint: "This server is older than this Croki client. Update the server to match it.",
    });
  });

  it("directs older clients to update themselves instead of rolling back a newer server", () => {
    expect(resolveVersionMismatch("9.9.9")).toEqual({
      clientVersion: APP_VERSION,
      serverVersion: "9.9.9",
      updateTarget: "client",
      hint: "This server is newer than this Croki client. Update Croki on this device to match it.",
    });
  });

  it("does not choose an update target for versions it cannot compare safely", () => {
    expect(resolveVersionMismatch("development")).toEqual({
      clientVersion: APP_VERSION,
      serverVersion: "development",
      updateTarget: null,
      hint: "Version mismatch. Sync this Croki client and server to the same version.",
    });
  });

  it("directs a client behind by one release to update itself", () => {
    expect(resolveVersionMismatch("0.0.35")).toMatchObject({ updateTarget: "client" });
  });

  it("does not warn when a nightly and a stable build share a core version", () => {
    expect(resolveVersionMismatch("0.0.34-nightly.20260818.1124")).toBeNull();

    branding.APP_VERSION = "0.0.34-nightly.20260818.1124";
    expect(resolveVersionMismatch("0.0.34")).toBeNull();
  });

  it.each(["0.0.34-nightly.20260823.1124", "0.0.34-nightly.20260824.1124"])(
    "warns when nightly server %s is behind a nightly client on the same release",
    (serverVersion) => {
      branding.APP_VERSION = "0.0.34-nightly.20260824.1125";

      expect(resolveVersionMismatch(serverVersion)).toEqual({
        clientVersion: "0.0.34-nightly.20260824.1125",
        serverVersion,
        updateTarget: "server",
        hint: "This server is older than this Croki client. Update the server to match it.",
      });
    },
  );

  it("directs an older nightly client to update itself", () => {
    branding.APP_VERSION = "0.0.34-nightly.20260824.1125";

    expect(resolveVersionMismatch("0.0.34-nightly.20260824.1126")).toMatchObject({
      updateTarget: "client",
    });
  });

  it("directs a stable client behind a nightly server release to update itself", () => {
    expect(resolveVersionMismatch("0.0.35-nightly.20260818.1124")).toMatchObject({
      updateTarget: "client",
    });
  });

  it("still warns when a nightly client outruns the server by a release", () => {
    branding.APP_VERSION = "0.0.35-nightly.20260818.1124";

    expect(resolveVersionMismatch("0.0.34")).toEqual({
      clientVersion: "0.0.35-nightly.20260818.1124",
      serverVersion: "0.0.34",
      updateTarget: "server",
      hint: "This server is older than this Croki client. Update the server to match it.",
    });
  });

  it("falls back to string inequality when a version is not semver", () => {
    expect(resolveVersionMismatch("dev")).toEqual({
      clientVersion: "0.0.34",
      serverVersion: "dev",
      updateTarget: null,
      hint: "Version mismatch. Sync this Croki client and server to the same version.",
    });

    branding.APP_VERSION = "dev";
    expect(resolveVersionMismatch("dev")).toBeNull();
    expect(resolveVersionMismatch("0.0.34")).toMatchObject({ serverVersion: "0.0.34" });
  });

  it("reads the server version from config descriptors", () => {
    expect(
      resolveServerConfigVersionMismatch({
        environment: {
          environmentId: EnvironmentId.make("environment-1"),
          label: "Remote",
          platform: {
            os: "darwin",
            arch: "arm64",
          },
          serverVersion: "0.0.33",
          capabilities: {
            repositoryIdentity: true,
          },
        },
      }),
    ).toMatchObject({
      serverVersion: "0.0.33",
    });
  });

  it("keys dismissals by environment, client version, and server version", () => {
    const environmentId = EnvironmentId.make("environment-dismissal");
    const key = buildVersionMismatchDismissalKey(environmentId, {
      clientVersion: APP_VERSION,
      serverVersion: "9.9.9",
    });

    expect(key).toBe(`${environmentId}:${APP_VERSION}:9.9.9`);
    expect(isVersionMismatchDismissed(key)).toBe(false);

    dismissVersionMismatch(key);

    expect(isVersionMismatchDismissed(key)).toBe(true);
    expect(
      isVersionMismatchDismissed(
        buildVersionMismatchDismissalKey(environmentId, {
          clientVersion: APP_VERSION,
          serverVersion: "9.9.10",
        }),
      ),
    ).toBe(false);
  });

  it("appends a hint to connection errors when the server is behind", () => {
    const mismatch = resolveVersionMismatch("0.0.33");

    expect(appendVersionMismatchHint("Socket closed.", mismatch)).toBe(
      "Socket closed. Hint: This server is older than this Croki client. Update the server to match it.",
    );
  });

  it("reads desktop-managed update capabilities from config descriptors", () => {
    expect(
      resolveServerSelfUpdateCapability({
        environment: {
          environmentId: EnvironmentId.make("environment-desktop"),
          label: "Desktop",
          platform: { os: "darwin", arch: "arm64" },
          serverVersion: "9.9.9",
          capabilities: {
            repositoryIdentity: true,
            serverSelfUpdate: "desktop-managed",
          },
        },
      }),
    ).toBe("desktop-managed");
    expect(resolveServerSelfUpdateCapability(null)).toBeNull();
  });

  it("only offers package-backed server updates when that release destination exists", () => {
    expect(resolveServerPackageUpdatesAvailable(undefined, true)).toBe(true);
    expect(resolveServerPackageUpdatesAvailable("false", true)).toBe(false);
    expect(resolveServerPackageUpdatesAvailable("true", false)).toBe(true);
    expect(resolveServerPackageUpdatesAvailable(undefined, false)).toBe(false);
    expect(serverUpdatePathAvailable("boot-service", false)).toBe(false);
    expect(serverUpdatePathAvailable("respawn", false)).toBe(false);
    expect(serverUpdatePathAvailable(null, false)).toBe(false);
    expect(serverUpdatePathAvailable("boot-service", true)).toBe(true);
    expect(serverUpdatePathAvailable("desktop-managed", false)).toBe(true);
  });

  it("matches version-drift guidance to the advertised update path", () => {
    expect(serverUpdateGuidance("respawn", "Remote server")).toBe(
      "Update the Remote server so they stay in sync.",
    );
    expect(serverUpdateGuidance("desktop-managed", "Desktop server")).toBe(
      "Update the desktop app that runs the Desktop server.",
    );
    expect(serverUpdateGuidance(null, "Local server")).toBe(
      "Relaunch the Local server with the copied command to sync them.",
    );
  });
});
