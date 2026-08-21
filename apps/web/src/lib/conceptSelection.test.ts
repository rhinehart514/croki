import { describe, expect, it } from "vite-plus/test";

import type { UiHistoryEntry } from "@croki/contracts";
import { appendConceptSelectionToPrompt } from "./conceptSelection";

function conceptEntry(id: string, title: string, initialRank: number): UiHistoryEntry {
  return {
    id: `screen-${id}`,
    attachmentId: `thread-1-00000000-0000-4000-8000-00000000000${initialRank}`,
    url: `http://localhost:5173/${id}`,
    title,
    observedAt: "2026-08-15T12:00:00.000Z",
    width: 1_280,
    height: 800,
    interactiveElementCount: 4,
    consoleErrorCount: 0,
    networkFailureCount: 0,
    actionCount: 1,
    concept: {
      id,
      title,
      summary: `${title} summary that is intentionally not serialized.`,
      tradeoff: `${title} tradeoff that is intentionally not serialized.`,
      initialRank,
    },
  };
}

describe("concept selection prompt", () => {
  it("keeps the founder's rank and stable screen references visible", () => {
    const result = appendConceptSelectionToPrompt("Build the strongest route.", {
      action: "remix",
      concepts: [
        { entry: conceptEntry("map", "Architecture map", 1), rank: 2, disposition: "keep" },
        { entry: conceptEntry("runway", "Ranked runway", 2), rank: 1, disposition: "keep" },
      ],
    });

    expect(result).toContain(
      "Build the strongest route.\n\nConcept selection\nAction: Remix concepts",
    );
    expect(result.indexOf("#1 Ranked runway")).toBeLessThan(result.indexOf("#2 Architecture map"));
    expect(result).toContain("concept: runway · ui_history: screen-runway · keep");
    expect(result).not.toContain("intentionally not serialized");
  });

  it("does not change the draft when no labeled concept is selected", () => {
    const ordinary = { ...conceptEntry("plain", "Plain", 1), concept: undefined };
    expect(
      appendConceptSelectionToPrompt("Keep drafting", {
        action: "continue",
        concepts: [{ entry: ordinary, rank: 1, disposition: "unreviewed" }],
      }),
    ).toBe("Keep drafting");
  });

  it("replaces an earlier trailing selection instead of stacking hidden-looking directives", () => {
    const first = appendConceptSelectionToPrompt("Explore the options.", {
      action: "continue",
      concepts: [
        { entry: conceptEntry("map", "Architecture map", 1), rank: 2, disposition: "question" },
      ],
    });
    const revised = appendConceptSelectionToPrompt(first, {
      action: "remix",
      concepts: [
        { entry: conceptEntry("runway", "Ranked runway", 2), rank: 1, disposition: "keep" },
      ],
    });

    expect(revised.match(/Concept selection/g)).toHaveLength(1);
    expect(revised).toContain("Action: Remix concepts");
    expect(revised).not.toContain("Architecture map");
  });

  it("replaces an earlier selection when the composer contains no other text", () => {
    const first = appendConceptSelectionToPrompt("", {
      action: "continue",
      concepts: [
        { entry: conceptEntry("map", "Architecture map", 1), rank: 1, disposition: "question" },
      ],
    });
    const revised = appendConceptSelectionToPrompt(first, {
      action: "continue",
      concepts: [
        { entry: conceptEntry("runway", "Ranked\nrunway", 2), rank: 1, disposition: "keep" },
      ],
    });

    expect(revised.match(/Concept selection/g)).toHaveLength(1);
    expect(revised).toContain("#1 Ranked runway");
    expect(revised).not.toContain("Architecture map");
  });
});
