import { describe, expect, it } from "vitest";
import { walkthroughStepFor, type ProductGtmWorkflowRegister } from "./productGtmWorkflow";

const play = {
  id: "play-1",
  properties: {
    territory: "gtm",
    workflowGraph: {
      objective: "Turn returned proof into qualified conversations",
      steps: [
        { id: "ready", label: "Proof is ready", type: "trigger" },
        { id: "prepare", label: "Prepare the story", type: "agent-work" },
        { id: "publish", label: "Publish proof", type: "external-action" },
      ],
      edges: [{ from: "ready", to: "prepare" }, { from: "prepare", to: "publish" }],
    },
  },
};
const drafted: ProductGtmWorkflowRegister = "drafted";

describe("walkthroughStepFor", () => {
  it("resolves a focused drafted-play step to its honest reference and position", () => {
    const step = walkthroughStepFor("workflow:play-1:prepare", play, drafted);
    // The ref is the play's id plus the step's stable id from the play's own flow — no minted object id.
    expect(step).toEqual({ ref: "workflow:play-1:prepare", id: "prepare", label: "Prepare the story", position: 2, count: 3 });
  });

  it("returns nothing for an established play — the walkthrough machinery is drafted-only", () => {
    expect(walkthroughStepFor("workflow:play-1:prepare", play, "established")).toBeNull();
  });

  it("returns nothing when the focused step belongs to a different play", () => {
    expect(walkthroughStepFor("workflow:play-2:prepare", play, drafted)).toBeNull();
  });

  it("returns nothing when the selection is the play itself or an unknown step", () => {
    expect(walkthroughStepFor("object:play-1", play, drafted)).toBeNull();
    expect(walkthroughStepFor("workflow:play-1:missing", play, drafted)).toBeNull();
    expect(walkthroughStepFor(null, play, drafted)).toBeNull();
    expect(walkthroughStepFor("workflow:play-1:prepare", null, drafted)).toBeNull();
  });
});
