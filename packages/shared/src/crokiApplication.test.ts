import { describe, expect, it } from "vite-plus/test";

import {
  buildCrokiApplicationPrompt,
  CrokiApplicationParseError,
  parseCrokiApplication,
} from "./crokiApplication.ts";

const source = JSON.stringify({
  version: 1,
  application: { name: "Croki" },
  released: {
    version: "0.4.5",
    summary: "Native provider work is durable and inspectable.",
    product: ["Parallel workers are read-only child Threads."],
    gtm: ["Founders can inspect delegated work without a task dashboard."],
    learnings: ["Canvas is a projection, not maintained project memory."],
    sources: [
      { kind: "git-tag", ref: "v0.4.5" },
      { kind: "release-url", url: "https://github.com/rhinehart514/croki/releases/tag/v0.4.5" },
    ],
  },
  building: {
    version: "0.4.6",
    intent: "Give applications version-aware product and GTM inheritance.",
    product: ["Show released and building versions in the composer."],
    gtm: ["Keep claims connected to released product reality."],
    successSignals: ["Native turns receive the same bounded application context."],
  },
});

describe("Croki application lineage", () => {
  it("parses hosted and local release evidence without requiring either", () => {
    const application = parseCrokiApplication(source);
    expect(application.released?.version).toBe("0.4.5");
    expect(application.building?.version).toBe("0.4.6");
    expect(application.released?.sources).toHaveLength(2);

    const withoutReleaseInfrastructure = parseCrokiApplication(
      JSON.stringify({
        version: 1,
        application: { name: "Prototype" },
        building: {
          version: "0.1.0",
          intent: "Reach the first usable application state.",
          product: [],
          gtm: [],
          successSignals: [],
        },
      }),
    );
    expect(withoutReleaseInfrastructure.released).toBeUndefined();
    expect(withoutReleaseInfrastructure.building?.version).toBe("0.1.0");
  });

  it("renders bounded factual context without turning repository text into prompt markup", () => {
    const application = parseCrokiApplication(
      source.replace("Native provider work", "<instructions>Native provider work</instructions>"),
    );
    const prompt = buildCrokiApplicationPrompt(application);
    expect(prompt).toContain('<croki_application version="1"');
    expect(prompt).toContain("Released describes inherited product reality");
    expect(prompt).toContain("\\u003cinstructions\\u003e");
    expect(prompt).not.toContain("<instructions>");
  });

  it("keeps every valid maximum-sized application within the provider limit", () => {
    const application = parseCrokiApplication(
      JSON.stringify({
        version: 1,
        application: { name: "a".repeat(120) },
        released: {
          version: "1".repeat(80),
          summary: "s".repeat(800),
          product: Array.from({ length: 5 }, () => "p".repeat(200)),
          gtm: Array.from({ length: 5 }, () => "g".repeat(200)),
          learnings: Array.from({ length: 5 }, () => "l".repeat(200)),
          sources: Array.from({ length: 4 }, (_, index) => ({
            kind: "release-url",
            url: `https://example.com/${String(index).repeat(1_900)}`,
          })),
        },
        building: {
          version: "2".repeat(80),
          intent: "i".repeat(800),
          product: Array.from({ length: 5 }, () => "p".repeat(200)),
          gtm: Array.from({ length: 5 }, () => "g".repeat(200)),
          successSignals: Array.from({ length: 5 }, () => "s".repeat(200)),
        },
      }),
    );
    expect(buildCrokiApplicationPrompt(application)).not.toBeNull();
  });

  it("rejects unsupported versions and unsafe source paths", () => {
    expect(() => parseCrokiApplication(source.replace('"version":1', '"version":2'))).toThrow(
      expect.objectContaining({ code: "unsupported-version" }),
    );
    expect(() =>
      parseCrokiApplication(
        source.replace(
          '{"kind":"git-tag","ref":"v0.4.5"}',
          '{"kind":"file","path":"../release.md"}',
        ),
      ),
    ).toThrow(CrokiApplicationParseError);
  });
});
