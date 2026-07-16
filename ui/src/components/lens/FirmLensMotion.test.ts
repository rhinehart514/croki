import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/firm-lens.css", "utf8");
const workyardCss = readFileSync("src/styles/workyard.css", "utf8");

describe("firm lens motion contract", () => {
  it("keeps motion causal and preserves settled meaning for reduced motion", () => {
    expect(css).not.toMatch(/transition\s*:\s*all/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/\.firm-lens-wall-panel[\s\S]*animation:\s*none/);
    expect(css).not.toContain("firm-lens-focus");
    expect(css).not.toContain("firm-lens-bet-node");
  });

  it("keeps essential active-wall text on an AA ink token", () => {
    const activeBand = css.match(/\.firm-lens-wall-band-active\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(activeBand).toContain("color: var(--ink-2)");
    expect(activeBand).not.toContain("color: var(--gap)");
  });

  it("keeps contextual work legible and avoids universal card entrance motion", () => {
    const contextualNodes = css.match(/\[data-focus-role="context"\][\s\S]*?\{([^}]*)\}/)?.[1] ?? "";
    expect(contextualNodes).toContain("opacity: 1");
    expect(workyardCss).not.toContain("workyard-card-settle");
    expect(workyardCss).not.toMatch(/\.workyard-card\s*\{[^}]*animation:/s);
  });
});
