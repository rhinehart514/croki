import { TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildCrokiRepositoryBootstrapPrompt,
  buildCrokiTurnUpdatePrompt,
  mergePreparedComposerPrompt,
} from "./CrokiProposalPrompts.logic";

describe("Croki proposal prompts", () => {
  it("ties a turn proposal to changed files and provisional-only authority", () => {
    const prompt = buildCrokiTurnUpdatePrompt({
      turnId: TurnId.make("turn-7"),
      files: [
        { path: "src/product.ts", kind: "modified", additions: 4, deletions: 1 },
        { path: "docs/decision.md", kind: "added", additions: 12, deletions: 0 },
      ],
    });

    expect(prompt).toContain("completed turn turn-7");
    expect(prompt).toContain("- src/product.ts");
    expect(prompt).toContain("- docs/decision.md");
    expect(prompt).toContain("Only create or update provisional Canvas items");
    expect(prompt).toContain("Never promote anything to current");
  });

  it("boots from repository evidence without claiming founder approval", () => {
    const prompt = buildCrokiRepositoryBootstrapPrompt();
    expect(prompt).toContain("Inspect this repository");
    expect(prompt).toContain("Every new item must be provisional");
    expect(prompt).toContain("Never mark an item current");
  });

  it("preserves an existing draft and deduplicates prepared requests", () => {
    expect(mergePreparedComposerPrompt("", "Prepare Canvas")).toBe("Prepare Canvas");
    expect(mergePreparedComposerPrompt("My existing note", "Prepare Canvas")).toBe(
      "My existing note\n\nPrepare Canvas",
    );
    expect(
      mergePreparedComposerPrompt("My existing note\n\nPrepare Canvas", "Prepare Canvas"),
    ).toBe("My existing note\n\nPrepare Canvas");
  });
});
