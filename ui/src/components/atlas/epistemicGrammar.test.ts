import { describe, expect, it } from "vitest";
import {
  EPISTEMIC_PRESENTATION,
  EPISTEMIC_EDGE_PRESENTATION,
  edgeTreatmentForBasis,
  epistemicPresentation,
} from "./epistemicGrammar";
import type { EpistemicState } from "./deriveEpistemicState";

const ALL_STATES: EpistemicState[] = [
  "contested", "stale", "unsupported", "historical",
  "measured", "repository-backed", "founder-established", "drovers-read",
];

describe("epistemic presentation table — four redundant non-colour channels", () => {
  it("carries a distinct label, icon shape, and node-shape for every state", () => {
    const labels = new Set<string>();
    const icons = new Set<string>();
    const shapes = new Set<string>();
    for (const state of ALL_STATES) {
      const presentation = epistemicPresentation(state);
      labels.add(presentation.label);
      icons.add(presentation.iconId);
      shapes.add(presentation.nodeShape);
    }
    // Each of the three shape-channels distinguishes all eight — so greyscale never collapses two states.
    expect(labels.size).toBe(8);
    expect(icons.size).toBe(8);
    expect(shapes.size).toBe(8);
  });

  it("only the two absence-states render hollow (absence is a visible claim)", () => {
    const hollow = ALL_STATES.filter((state) => EPISTEMIC_PRESENTATION[state].hollow);
    expect(new Set(hollow)).toEqual(new Set<EpistemicState>(["unsupported", "drovers-read"]));
  });

  it("rations colour: proven tone only for measured, gap/founder never green", () => {
    expect(EPISTEMIC_PRESENTATION.measured.tone).toBe("proven");
    // No other state claims the proven (returned-reality) tone.
    const proven = ALL_STATES.filter((state) => EPISTEMIC_PRESENTATION[state].tone === "proven");
    expect(proven).toEqual(["measured"]);
  });
});

describe("epistemic edge treatments — join truth on the line (Law 10)", () => {
  it("only the unsupported treatment draws no line", () => {
    const noLine = Object.values(EPISTEMIC_EDGE_PRESENTATION).filter((entry) => !entry.draws);
    expect(noLine.map((entry) => entry.treatment)).toEqual(["unsupported"]);
  });

  it("join strength is a discrete four-rung ladder (never a gradient)", () => {
    const rungs = new Set(Object.values(EPISTEMIC_EDGE_PRESENTATION).map((entry) => entry.rung));
    expect(rungs).toEqual(new Set([0, 1, 2, 3]));
    expect(EPISTEMIC_EDGE_PRESENTATION["exact-receipt"].rung).toBe(3);
    expect(EPISTEMIC_EDGE_PRESENTATION.inferred.rung).toBe(1);
    expect(EPISTEMIC_EDGE_PRESENTATION.unattributed.rung).toBe(0);
  });

  it("maps basis to the exact spec treatments", () => {
    expect(edgeTreatmentForBasis("exact")).toBe("exact-receipt");
    expect(edgeTreatmentForBasis("contextual")).toBe("contextual");
    expect(edgeTreatmentForBasis("founder-applied")).toBe("founder-applied");
    expect(edgeTreatmentForBasis("inferred")).toBe("inferred");
    expect(edgeTreatmentForBasis("unattributed")).toBe("unattributed");
  });

  it("an unknown/absent basis is an inference line, never a clean receipt", () => {
    expect(edgeTreatmentForBasis(null)).toBe("inferred");
    expect(edgeTreatmentForBasis("working-theory-anchor")).toBe("inferred");
    // causal:false with no basis reads joined-not-caused.
    expect(edgeTreatmentForBasis(undefined, { causalFalse: true })).toBe("unattributed");
  });

  it("stale and unsupported options win over basis", () => {
    expect(edgeTreatmentForBasis("exact", { stale: true })).toBe("stale");
    expect(edgeTreatmentForBasis("exact", { unsupported: true })).toBe("unsupported");
  });

  it("the inferred treatment carries the unconfirmed disclosure tag and a hollow glyph", () => {
    expect(EPISTEMIC_EDGE_PRESENTATION.inferred.tag).toBe("unconfirmed");
    expect(EPISTEMIC_EDGE_PRESENTATION.inferred.glyph).toBe("hollow");
    expect(EPISTEMIC_EDGE_PRESENTATION["exact-receipt"].glyph).toBe("receipt");
  });
});
