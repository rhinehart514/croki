import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ApplicationAwarenessInput, ApplicationAwarenessResult } from "./applicationAwareness.ts";

const decodeApplicationAwarenessInput = Schema.decodeUnknownSync(ApplicationAwarenessInput);
const decodeApplicationAwarenessResult = Schema.decodeUnknownSync(ApplicationAwarenessResult);

describe("application awareness contracts", () => {
  it("accepts a source-backed frame with explicit authority and coverage", () => {
    const decoded = decodeApplicationAwarenessResult({
      version: 1,
      threadId: "thread-1",
      projectId: "project-1",
      generatedAt: "2026-08-05T12:00:00.000Z",
      canonStatus: "loaded",
      canon: {
        authority: "project-declared",
        approval: "unverified",
        path: ".croki/application.croki",
        sha256: "abc123",
        name: "Croki",
        released: null,
        building: {
          version: "0.4.8",
          intent: "Make the application legible to native models.",
          product: [],
          gtm: [],
          successSignals: [],
        },
      },
      change: {
        scope: "invoking-thread",
        sourceThreadId: "thread-1",
        branch: "feature/application-awareness",
        worktreePath: "/workspace",
        baselineVersion: "0.4.7",
        targetVersion: "0.4.8",
        declaredIntent: "Make the application legible to native models.",
        declaredProductChanges: [],
        declaredMarketChanges: [],
        declaredSuccessSignals: [],
        latestCheckpoint: null,
      },
      checkedScreens: [],
      experienceComparison: null,
      projectEvidence: [],
      evidenceRevision: 0,
      coverage: {
        projectEvidenceStatus: "ready",
        projectEvidenceTruncated: false,
        checkedScreensTruncated: false,
        checkedScreenScope: "project",
        limitations: ["No checked screens exist in this Thread."],
      },
    });

    expect(decoded.canon?.authority).toBe("project-declared");
    expect(decoded.coverage.checkedScreenScope).toBe("project");
  });

  it("bounds evidence reads", () => {
    expect(() => decodeApplicationAwarenessInput({ evidenceLimit: 51 })).toThrow();
    expect(() => decodeApplicationAwarenessInput({ checkedScreenLimit: 0 })).toThrow();
  });
});
