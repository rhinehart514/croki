import { TurnId } from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildCrokiGtmExplorationPrompt,
  buildCrokiRepositoryBootstrapPrompt,
  buildCrokiReleaseLineagePrompt,
  buildCrokiTurnUpdatePrompt,
  buildCrokiWorkflowCompositionPrompt,
  mergePreparedComposerPrompt,
} from "./CrokiProposalPrompts.logic";

describe("Croki proposal prompts", () => {
  const workspaceRoot = "/projects/croki";

  it("ties a turn proposal to changed files and provisional-only authority", () => {
    const prompt = buildCrokiTurnUpdatePrompt(
      {
        turnId: TurnId.make("turn-7"),
        files: [
          { path: "src/product.ts", kind: "modified", additions: 4, deletions: 1 },
          { path: "docs/decision.md", kind: "added", additions: 12, deletions: 0 },
        ],
      },
      workspaceRoot,
    );

    expect(prompt).toContain("completed turn turn-7");
    expect(prompt).toContain("- src/product.ts");
    expect(prompt).toContain("- docs/decision.md");
    expect(prompt).toContain("Only create or update provisional Canvas items");
    expect(prompt).toContain("Never promote anything to current");
    expect(prompt).toContain(`canonical project root is "${workspaceRoot}"`);
    expect(prompt).toContain("Never create or update a worktree-local");
  });

  it("boots from repository evidence without claiming founder approval", () => {
    const prompt = buildCrokiRepositoryBootstrapPrompt(workspaceRoot);
    expect(prompt).toContain("Inspect this repository");
    expect(prompt).toContain("Every new item must be provisional");
    expect(prompt).toContain("Never mark an item current");
    expect(prompt).toContain("domain product");
  });

  it("keeps GTM and workflow work inside Canvas semantics and native Threads", () => {
    expect(buildCrokiGtmExplorationPrompt(workspaceRoot)).toContain("domain gtm");
    expect(buildCrokiGtmExplorationPrompt(workspaceRoot)).toContain("founder perspective");
    expect(buildCrokiWorkflowCompositionPrompt(workspaceRoot)).toContain("existing Croki Thread");
    expect(buildCrokiWorkflowCompositionPrompt(workspaceRoot)).toContain(
      "Do not create a second workflow engine",
    );
  });

  it("prepares release promotion through the native Thread and normal Review path", () => {
    const prompt = buildCrokiReleaseLineagePrompt(workspaceRoot);
    expect(prompt).toContain("verified project evidence");
    expect(prompt).toContain(".croki/application.croki");
    expect(prompt).toContain("Do not promote Thread reports");
    expect(prompt).toContain("normal repository and Review path");
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
