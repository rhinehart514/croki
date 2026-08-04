import type { CrokiApplication } from "@croki/shared/crokiApplication";
import type { CrokiApplicationProgress } from "@croki/shared/crokiApplicationProgress";
import { ProjectId, ThreadId } from "@croki/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { CrokiApplicationDetails, CrokiApplicationIndicator } from "./CrokiApplicationPresentation";

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
    successSignals: ["The release transition is legible without opening project files."],
  },
};

const progress: CrokiApplicationProgress = {
  applicationName: "Croki",
  releasedVersion: "0.4.5",
  buildingVersion: "0.4.6",
  projectId: ProjectId.make("project-1"),
  sourceRevision: 7,
  latestActivityAt: "2026-08-04T12:00:00.000Z",
  observations: [
    {
      id: "checkpoint-1",
      type: "checkpoint",
      title: "Checkpoint 1",
      summary: "Streaming response behavior changed in two files",
      state: "verified",
      revision: 7,
      source: {
        kind: "checkpoint",
        id: "checkpoint-1",
        sourceThreadId: ThreadId.make("thread-1"),
        turnId: "turn-1",
        observedAt: "2026-08-04T12:00:00.000Z",
      },
    },
  ],
  truncated: false,
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

  it("shows derived evidence and exposes native release preparation", () => {
    const indicatorMarkup = renderToStaticMarkup(
      <CrokiApplicationIndicator
        state={{ status: "loaded", application }}
        progress={progress}
        workspaceRoot="/workspace/ide"
        onPrepareRelease={() => undefined}
      />,
    );
    expect(indicatorMarkup).toContain("1 verified");

    const detailsMarkup = renderToStaticMarkup(
      <CrokiApplicationDetails
        application={application}
        progress={progress}
        onPrepareRelease={() => undefined}
        onOpenObservation={() => undefined}
      />,
    );
    expect(detailsMarkup).toContain("Streaming response behavior changed in two files");
    expect(detailsMarkup).toContain("unproven");
    expect(detailsMarkup).toContain("The release transition is legible");
    expect(detailsMarkup).toContain("Prepare 0.4.6 release lineage");
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
