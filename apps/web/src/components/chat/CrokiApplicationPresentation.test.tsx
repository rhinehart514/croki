import type { CrokiApplication } from "@croki/shared/crokiApplication";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { CrokiApplicationIndicator } from "./CrokiApplicationPresentation";

const application: CrokiApplication = {
  version: 1,
  application: { name: "Croki" },
  released: {
    version: "0.4.5",
    summary: "Native provider work is durable and inspectable.",
    product: [],
    gtm: [],
    learnings: [],
    sources: [
      { kind: "git-tag", ref: "v0.4.5" },
      {
        kind: "release-url",
        url: "https://github.com/rhinehart514/croki/releases/tag/v0.4.5",
      },
    ],
  },
  building: {
    version: "0.4.6",
    intent: "Carry versioned product and GTM reality into native work.",
    product: [],
    gtm: [],
    successSignals: [],
  },
};

describe("Croki application indicator", () => {
  it("replaces context counts with released to building lineage", () => {
    const markup = renderToStaticMarkup(
      <CrokiApplicationIndicator
        state={{ status: "loaded", application }}
        workspaceRoot="/workspace/ide"
      />,
    );
    expect(markup).toContain("0.4.5 → 0.4.6");
    expect(markup).toContain("released 0.4.5, building 0.4.6");
    expect(markup).toContain("· ide");
    expect(markup).not.toContain("No context");
  });

  it("keeps absence silent instead of presenting missing context as a problem", () => {
    const markup = renderToStaticMarkup(
      <CrokiApplicationIndicator state={{ status: "absent" }} workspaceRoot="/workspace/ide" />,
    );
    expect(markup).toBe("");
    expect(markup).not.toContain("No context");
  });

  it("surfaces a declared but unusable application file without blocking work", () => {
    const markup = renderToStaticMarkup(
      <CrokiApplicationIndicator
        state={{ status: "invalid", errorCode: "malformed" }}
        workspaceRoot="/workspace/ide"
      />,
    );
    expect(markup).toContain("Application invalid");
    expect(markup).toContain("Native turns continue without application lineage");
  });
});
