import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/venture-atlas.css", "utf8");
const proposalCss = readFileSync("src/components/atlas/propose/architecture-proposal.css", "utf8");

describe("venture atlas canvas contract", () => {
  it("keeps the orbit legible and unfolds a selected bet in place", () => {
    expect(css).toContain(".atlas-orbit-ring");
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
    expect(css).toMatch(/\.atlas-wall-arc\s*\{[^}]*var\(--gap\)/);
    expect(css).toMatch(/\.atlas-bet-node\[data-band="approaching-wall"\]\s*\{[^}]*var\(--gap\)/);
    expect(css).toMatch(/\.atlas-bet-workflow li\[data-state="gate"\] > i\s*\{[^}]*var\(--gap\)/);
  });

  it("docks the return band below floating chrome and keeps staged proposals neutral", () => {
    expect(css).toMatch(/\.atlas-return-band\s*\{[^}]*top:\s*88px/);
    expect(proposalCss).not.toMatch(/\.atlas-proposal-objects > li\[data-role="motion"\][^{]*\{[^}]*var\(--ember-soft\)/);
    expect(proposalCss).toMatch(/\.atlas-proposal-objects > li\[data-role="motion"\][^{]*\{[^}]*border-style:\s*dashed/);
  });
});
