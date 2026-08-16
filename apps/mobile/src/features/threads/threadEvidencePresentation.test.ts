import { describe, expect, it } from "@effect/vitest";

import {
  evidenceFactStateLabel,
  groupTurnResultFacts,
  turnResultStatusLabel,
} from "./threadEvidencePresentation";

describe("mobile Thread evidence presentation", () => {
  it("keeps missing and pending evidence explicit", () => {
    expect(evidenceFactStateLabel("missing")).toBe("not captured");
    expect(evidenceFactStateLabel("pending")).toBe("needs you");
    expect(evidenceFactStateLabel("settled")).toBe("observed exit");
  });

  it("groups one settled receipt without changing fact order", () => {
    const first = { id: "result:a", kind: "check", label: "Checks" } as const;
    const second = { id: "result:b", kind: "check", label: "Files" } as const;
    const third = { id: "result:c", kind: "git", label: "Branch" } as const;

    const grouped = groupTurnResultFacts([first, second, third] as never);

    expect(grouped.get("check")).toEqual([first, second]);
    expect(grouped.get("git")).toEqual([third]);
  });

  it("labels every settled outcome", () => {
    expect(turnResultStatusLabel("completed")).toBe("Settled · completed");
    expect(turnResultStatusLabel("interrupted")).toBe("Settled · interrupted");
    expect(turnResultStatusLabel("failed")).toBe("Settled · failed");
  });
});
