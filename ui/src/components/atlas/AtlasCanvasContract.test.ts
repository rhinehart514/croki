import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/venture-atlas.css", "utf8");
const proposalCss = readFileSync("src/components/atlas/propose/architecture-proposal.css", "utf8");

describe("venture atlas canvas contract", () => {
  // Placement is engine-owned (atlasLayoutEngine). The effort card is the composite .effort: a warm
  // raised card that keeps its RESTING size when selected — its detail opens in the docked inspector,
  // never by ballooning inline (which was the left-edge clip bug). So the card must NOT grow to 566px.
  it("renders the effort as a warm raised card and never balloons inline on selection", () => {
    expect(css).toContain(".atlas-effort-card");
    expect(css).toMatch(/\.atlas-effort-card\s*\{[^}]*background:\s*var\(--card-raised\)/);
    expect(css).toMatch(/\.atlas-effort-card\s*\{[^}]*box-shadow:\s*var\(--sh-rest\)/);
    // The instrument footer with attribution faces is the composite signature.
    expect(css).toContain(".atlas-effort .e-faces");
    // No inline expansion: the selected card stays at its resting width; detail lives in the inspector.
    expect(css).not.toContain("width: 566px");
  });

  it("keeps causal labels readable and motion settled", () => {
    expect(css).not.toMatch(/transition\s*:\s*all/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/\.react-flow__edge-text\s*\{[^}]*font-size:\s*var\(--text-meta\)/);
    expect(css).not.toMatch(/\[data-atlas-altitude="venture"\] \.react-flow__edge-text[^}]*opacity:\s*0/);
  });

  it("reserves amber for the wall and needs-you effort state", () => {
    // Amber is the one "needs you" hue. On the effort card it carries the needs tone (border, kicker,
    // dot, and the need banner naming what's wanted); the wall marks the outward boundary in the same
    // token. Never decorative — green carries living/connected, ink carries hierarchy.
    expect(css).toMatch(/\.atlas-effort\[data-tone="needs"\] \.atlas-effort-card\s*\{[^}]*var\(--amber-line\)/);
    expect(css).toMatch(/\.atlas-effort \.e-need\s*\{[^}]*var\(--amber-soft\)/);
  });

  it("docks the return band to the stage-cell top and keeps staged proposals neutral", () => {
    // The ADE grid docks the rail in its own cell, so the return band pins to the stage-cell
    // top inset rather than clearing a floating conversation bubble.
    expect(css).toMatch(/\.atlas-return-band\s*\{[^}]*top:\s*var\(--space-3\)/);
    expect(proposalCss).not.toMatch(/\.atlas-proposal-objects > li\[data-role="motion"\][^{]*\{[^}]*var\(--ember-soft\)/);
    expect(proposalCss).toMatch(/\.atlas-proposal-objects > li\[data-role="motion"\][^{]*\{[^}]*border-style:\s*dashed/);
  });
});
