import { describe, expect, it } from "vite-plus/test";

import { CrokiContextParseError } from "./crokiContext.ts";
import {
  CROKI_RELEASE_LIMITS,
  parseCrokiReleaseCandidate,
  type CrokiReleaseCandidate,
} from "./crokiReleaseCandidate.ts";

const CANDIDATE: CrokiReleaseCandidate = {
  version: "0.4.2",
  baseline: "0.4.1",
  goal: "See the next release taking shape.",
  status: "active",
  items: [
    {
      id: "release-canvas",
      title: "Introduce Release Canvas",
      kind: "feature",
      status: "working",
      outcome: "The next release and its missing proof are legible from the active Thread.",
      acceptanceCriteria: [
        {
          id: "native-entry",
          text: "Canvas opens on the active release candidate.",
          status: "passed",
          references: [{ kind: "file", path: "apps/web/src/components/croki/CrokiCanvas.tsx" }],
        },
      ],
      sourceThreads: [{ id: "thread-1", title: "Build Release Canvas" }],
    },
  ],
};

describe("Croki release candidate", () => {
  it("parses a bounded evidence-backed candidate", () => {
    expect(parseCrokiReleaseCandidate(CANDIDATE)).toEqual(CANDIDATE);
  });

  it("requires passed proof before an item can be verified", () => {
    expect(() =>
      parseCrokiReleaseCandidate({
        ...CANDIDATE,
        items: [{ ...CANDIDATE.items[0], status: "verified" }],
      }),
    ).not.toThrow();
    expect(() =>
      parseCrokiReleaseCandidate({
        ...CANDIDATE,
        items: [
          {
            ...CANDIDATE.items[0],
            status: "verified",
            acceptanceCriteria: [{ id: "native-entry", text: "Canvas opens.", status: "pending" }],
          },
        ],
      }),
    ).toThrow(/cannot be verified/);
  });

  it("requires a released candidate to contain only verified or deferred work", () => {
    expect(() => parseCrokiReleaseCandidate({ ...CANDIDATE, status: "released" })).toThrow(
      /verified or deferred/,
    );
  });

  it("rejects duplicate identities and over-limit candidate content", () => {
    for (const candidate of [
      { ...CANDIDATE, items: [CANDIDATE.items[0], CANDIDATE.items[0]] },
      {
        ...CANDIDATE,
        goal: "x".repeat(CROKI_RELEASE_LIMITS.goalChars + 1),
      },
      {
        ...CANDIDATE,
        items: [
          {
            ...CANDIDATE.items[0],
            sourceThreads: [
              { id: "thread-1", title: "One" },
              { id: "thread-1", title: "Duplicate" },
            ],
          },
        ],
      },
    ]) {
      expect(() => parseCrokiReleaseCandidate(candidate)).toThrow(CrokiContextParseError);
    }
  });
});
