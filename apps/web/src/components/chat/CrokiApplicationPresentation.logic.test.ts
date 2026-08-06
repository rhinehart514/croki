import { describe, expect, it } from "vite-plus/test";

import {
  deriveCrokiApplicationState,
  deriveCrokiApplicationStateWithLegacy,
} from "./CrokiApplicationPresentation.logic";

const application = JSON.stringify({
  version: 1,
  application: { name: "Croki" },
  released: {
    version: "0.4.7",
    summary: "Released reality.",
    product: [],
    gtm: [],
    learnings: [],
    sources: [],
  },
  building: {
    version: "0.4.8",
    intent: "Keep application focus inside the ADE.",
    product: [],
    gtm: [],
    successSignals: [],
  },
});

describe("Croki application presentation state", () => {
  it("prefers the application brief and falls back to legacy JSON", () => {
    const absentCurrent = {
      data: null,
      error: "missing",
      failure: {
        operation: "realpath-target",
        relativePath: ".croki/application.croki",
      },
      isPending: false,
    } as const;
    const legacy = {
      data: {
        relativePath: ".croki/application.json",
        contents: application,
        byteLength: application.length,
        truncated: false,
      },
      error: null,
      failure: null,
      isPending: false,
    } as const;

    expect(deriveCrokiApplicationStateWithLegacy(absentCurrent, legacy)).toMatchObject({
      status: "loaded",
      sourcePath: ".croki/application.json",
    });
  });

  it("derives the released and building focus from the repository-owned file", () => {
    expect(
      deriveCrokiApplicationState({
        data: {
          relativePath: ".croki/application.croki",
          contents: application,
          byteLength: application.length,
          truncated: false,
        },
        error: null,
        failure: null,
        isPending: false,
      }),
    ).toMatchObject({
      status: "loaded",
      sourcePath: ".croki/application.croki",
      application: {
        released: { version: "0.4.7" },
        building: { version: "0.4.8" },
      },
    });
  });

  it("keeps the source path when the brief needs repair", () => {
    expect(
      deriveCrokiApplicationState({
        data: {
          relativePath: ".croki/application.croki",
          contents: "{}",
          byteLength: 2,
          truncated: false,
        },
        error: null,
        failure: null,
        isPending: false,
      }),
    ).toEqual({
      status: "invalid",
      errorCode: "unsupported-version",
      sourcePath: ".croki/application.croki",
    });
  });
});
