import { describe, expect, it } from "vite-plus/test";

import { deriveCrokiApplicationState } from "./CrokiApplicationPresentation.logic";

const application = JSON.stringify({
  version: 1,
  application: { name: "Croki" },
  released: {
    version: "0.4.5",
    summary: "Released reality.",
    product: [],
    gtm: [],
    learnings: [],
    sources: [],
  },
  building: {
    version: "0.4.6",
    intent: "Build version-aware application context.",
    product: [],
    gtm: [],
    successSignals: [],
  },
});

describe("Croki application presentation state", () => {
  it("derives released and building versions from the project-owned file", () => {
    const state = deriveCrokiApplicationState({
      data: {
        relativePath: ".croki/application.json",
        contents: application,
        byteLength: application.length,
        truncated: false,
      },
      error: null,
      failure: null,
      isPending: false,
    });
    expect(state).toMatchObject({
      status: "loaded",
      application: {
        released: { version: "0.4.5" },
        building: { version: "0.4.6" },
      },
    });
  });

  it("treats a missing file as normal absence and preserves invalid state", () => {
    expect(
      deriveCrokiApplicationState({
        data: null,
        error: "missing",
        failure: { operation: "realpath-target", relativePath: ".croki/application.json" },
        isPending: false,
      }),
    ).toEqual({ status: "absent" });
    expect(
      deriveCrokiApplicationState({
        data: {
          relativePath: ".croki/application.json",
          contents: "{}",
          byteLength: 2,
          truncated: false,
        },
        error: null,
        failure: null,
        isPending: false,
      }),
    ).toEqual({ status: "invalid", errorCode: "unsupported-version" });
  });

  it("matches the server when escaped application data exceeds the provider bound", () => {
    const escaped = JSON.stringify({
      version: 1,
      application: { name: "<".repeat(120) },
      released: {
        version: "0.4.5",
        summary: "<".repeat(800),
        product: Array.from({ length: 5 }, () => "<".repeat(200)),
        gtm: Array.from({ length: 5 }, () => "<".repeat(200)),
        learnings: Array.from({ length: 5 }, () => "<".repeat(200)),
        sources: [],
      },
      building: {
        version: "0.4.6",
        intent: "<".repeat(800),
        product: Array.from({ length: 5 }, () => "<".repeat(200)),
        gtm: Array.from({ length: 5 }, () => "<".repeat(200)),
        successSignals: Array.from({ length: 5 }, () => "<".repeat(200)),
      },
    });
    expect(
      deriveCrokiApplicationState({
        data: {
          relativePath: ".croki/application.json",
          contents: escaped,
          byteLength: escaped.length,
          truncated: false,
        },
        error: null,
        failure: null,
        isPending: false,
      }),
    ).toEqual({ status: "oversized" });
  });
});
