import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/atlas-dive.css", "utf8");

describe("atlas dive CSS contract", () => {
  it("uses semantic tokens, keeps serif at the gate, and honors reduced motion", () => {
    expect(css).not.toMatch(/#[\da-f]{3,8}/i);
    expect(css).not.toMatch(/transition\s*:\s*all/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css.match(/font-family:\s*var\(--font-orbital-serif\)/g)).toHaveLength(2);
    expect(css).toMatch(/\.atlas-dive-node-gate \.atlas-dive-node-heading strong/);
    expect(css).toMatch(/\.atlas-dive-inspector h2/);
    expect(css).not.toMatch(/\.atlas-dive-node-gate:hover[^}]*transform/);
  });

  it("keeps workflow titles intact instead of breaking words to fit badges", () => {
    expect(css).toMatch(/\.atlas-dive-node-heading strong\s*\{[^}]*overflow-wrap:\s*normal/);
    expect(css).toMatch(/\.atlas-dive-node-heading strong\s*\{[^}]*hyphens:\s*none/);
    expect(css).toMatch(/\.atlas-dive-node-copy > span/);
  });
});
