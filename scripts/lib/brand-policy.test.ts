import { describe, expect, it } from "vite-plus/test";

import {
  CROKI_BRAND_CHANNELS,
  CROKI_BRAND_ASSET_PATHS,
  CROKI_DESKTOP_PLATFORMS,
  CROKI_VISIBLE_BRAND,
  RETAINED_T3_IDENTIFIER_ALLOWLIST,
  resolveCrokiDesktopBrandChannel,
  resolveCrokiDesktopBrandMetadata,
} from "./brand-policy.ts";

describe("Croki brand policy", () => {
  const displayNameByChannel = {
    development: "Croki (Dev)",
    alpha: "Croki (Alpha)",
    stable: "Croki",
    nightly: "Croki (Nightly)",
  } as const;

  for (const platform of CROKI_DESKTOP_PLATFORMS) {
    for (const channel of CROKI_BRAND_CHANNELS) {
      it(`uses Croki-visible ${channel} metadata on ${platform}`, () => {
        expect(resolveCrokiDesktopBrandMetadata({ platform, channel })).toEqual({
          platform,
          channel,
          baseName: "Croki",
          displayName: displayNameByChannel[channel],
          stageLabel:
            channel === "development"
              ? "Dev"
              : channel === "alpha"
                ? "Alpha"
                : channel === "nightly"
                  ? "Nightly"
                  : null,
          artifactName: "Croki-${version}-${arch}.${ext}",
          description: "Croki desktop build",
          author: "Croki",
          protocolDisplayName: "Croki",
          icons: {
            application: CROKI_BRAND_ASSET_PATHS.crokiIconPng,
            windows: CROKI_BRAND_ASSET_PATHS.crokiWindowsIconIco,
          },
        });
      });
    }
  }

  it("derives packaged channels without treating alpha as an internal identifier", () => {
    expect(
      resolveCrokiDesktopBrandChannel({
        version: "1.0.0",
        fallbackProductName: "Croki (Alpha)",
      }),
    ).toBe("alpha");
    expect(
      resolveCrokiDesktopBrandChannel({
        version: "1.0.0",
        fallbackProductName: "Croki",
      }),
    ).toBe("stable");
    expect(
      resolveCrokiDesktopBrandChannel({
        version: "1.0.0-nightly.20260730.1",
        fallbackProductName: "Croki (Alpha)",
      }),
    ).toBe("nightly");
  });

  it("keeps visible values Croki-only", () => {
    expect(Object.values(CROKI_VISIBLE_BRAND).join(" ")).not.toMatch(/\bT3(?: Code)?\b/u);
  });

  it("publishes a unique compatibility allowlist for later gates", () => {
    const keys = RETAINED_T3_IDENTIFIER_ALLOWLIST.map(
      (entry) => `${entry.category}:${entry.match}:${entry.value}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(RETAINED_T3_IDENTIFIER_ALLOWLIST).toContainEqual({
      category: "app-id",
      match: "prefix",
      value: "com.t3tools.t3code",
      reason: "Desktop and mobile installed-app identity",
    });
    expect(RETAINED_T3_IDENTIFIER_ALLOWLIST).toContainEqual({
      category: "environment",
      match: "prefix",
      value: "T3CODE_",
      reason: "Existing CLI and deployment configuration",
    });
  });
});
