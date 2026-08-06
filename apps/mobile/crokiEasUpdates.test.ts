import { describe, expect, it } from "vite-plus/test";

import { INHERITED_T3_EAS_PROJECT_ID, resolveCrokiEasUpdates } from "./crokiEasUpdates";

describe("resolveCrokiEasUpdates", () => {
  it("disables OTA without a verified Croki EAS project", () => {
    expect(resolveCrokiEasUpdates(undefined)).toEqual({
      projectId: null,
      updates: {
        enabled: false,
        checkAutomatically: "NEVER",
        fallbackToCacheTimeout: 0,
      },
    });
  });

  it("targets the configured Croki-owned EAS project", () => {
    const projectId = "11111111-2222-4333-8444-555555555555";
    expect(resolveCrokiEasUpdates(projectId)).toEqual({
      projectId,
      updates: {
        enabled: true,
        url: `https://u.expo.dev/${projectId}`,
        checkAutomatically: "ON_LOAD",
        fallbackToCacheTimeout: 0,
      },
    });
  });

  it("rejects inherited and malformed destinations", () => {
    expect(() => resolveCrokiEasUpdates(INHERITED_T3_EAS_PROJECT_ID)).toThrow(/inherited T3/);
    expect(() => resolveCrokiEasUpdates("not-a-project")).toThrow(/valid EAS project UUID/);
  });
});
