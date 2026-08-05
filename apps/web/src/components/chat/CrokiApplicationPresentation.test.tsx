import type { CrokiApplication } from "@croki/shared/crokiApplication";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ApplicationDetails, CrokiApplicationIndicator } from "./CrokiApplicationPresentation";

const application: CrokiApplication = {
  version: 1,
  application: { name: "Croki" },
  released: {
    version: "0.4.5",
    summary: "Native provider work is durable and inspectable.",
    product: ["Native providers remain native."],
    gtm: ["Croki is for founders building real software."],
    learnings: ["Observed evidence must not become founder-approved truth."],
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
    product: ["Models can inspect source-backed application evidence."],
    gtm: ["Describe the application result, not internal perception machinery."],
    successSignals: ["A native model can cite the evidence behind its judgment."],
  },
};

describe("Croki application indicator", () => {
  it("replaces context counts with released to building lineage", () => {
    const markup = renderToStaticMarkup(
      <CrokiApplicationIndicator
        state={{
          status: "loaded",
          application,
          sourcePath: ".croki/application.croki",
        }}
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

  it("offers setup when the active project can create founder-approved lineage", () => {
    const markup = renderToStaticMarkup(
      <CrokiApplicationIndicator
        state={{ status: "absent" }}
        workspaceRoot="/workspace/ide"
        onSetup={() => undefined}
      />,
    );
    expect(markup).toContain("Set application direction");
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

  it("projects dense application truth as a concise release cover", () => {
    const markup = renderToStaticMarkup(<ApplicationDetails application={application} />);

    expect(markup).toContain("Croki · 0.4.6");
    expect(markup).toContain("Describe the application result, not internal perception machinery.");
    expect(markup).toContain("Carry versioned product and GTM reality into native work.");
    expect(markup).toContain("What changes");
    expect(markup).toContain("Models can inspect source-backed application evidence.");
    expect(markup).toContain("1 proof signals · 1 market consequences");
    expect(markup).toContain("Project-declared");
    expect(markup).not.toContain("Native providers remain native.");
    expect(markup).not.toContain("Observed evidence must not become founder-approved truth.");
  });
});
