import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/venture-atlas.css", "utf8");
const proposalCss = readFileSync("src/components/atlas/propose/architecture-proposal.css", "utf8");

describe("venture atlas canvas contract", () => {
  // Placement is engine-owned now (atlasLayoutEngine); the retired orbit layout's decorative ring is
  // gone. What remains load-bearing for legibility is the in-place unfold of a selected effort.
  it("keeps the effort legible and unfolds a selected bet in place", () => {
    expect(css).toContain('.atlas-bet-node[data-expanded="true"]');
    expect(css).toContain("width: 566px");
    expect(css).toContain(".atlas-bet-workflow");
  });

  it("keeps causal labels readable and motion settled", () => {
    expect(css).not.toMatch(/transition\s*:\s*all/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/\.react-flow__edge-text\s*\{[^}]*font-size:\s*var\(--text-meta\)/);
    expect(css).not.toMatch(/\[data-atlas-altitude="venture"\] \.react-flow__edge-text[^}]*opacity:\s*0/);
  });

  it("reserves amber for the wall and gate state", () => {
    // The wall (outward boundary) and a gated workflow step read in amber; the effort card's
    // approaching-wall accent shares the token. The retired orbit ring's wall arc is gone.
    expect(css).toMatch(/\.atlas-bet-node\[data-band="approaching-wall"\]\s*\{[^}]*var\(--gap\)/);
    expect(css).toMatch(/\.atlas-bet-workflow li\[data-state="gate"\] > i\s*\{[^}]*var\(--gap\)/);
  });

  it("docks the return band to the stage-cell top and keeps staged proposals neutral", () => {
    // The ADE grid docks the rail in its own cell, so the return band pins to the stage-cell
    // top inset rather than clearing a floating conversation bubble.
    expect(css).toMatch(/\.atlas-return-band\s*\{[^}]*top:\s*var\(--space-3\)/);
    expect(proposalCss).not.toMatch(/\.atlas-proposal-objects > li\[data-role="motion"\][^{]*\{[^}]*var\(--ember-soft\)/);
    expect(proposalCss).toMatch(/\.atlas-proposal-objects > li\[data-role="motion"\][^{]*\{[^}]*border-style:\s*dashed/);
  });
});
