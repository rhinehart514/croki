import { EnvironmentId, type UiHistoryEntry } from "@croki/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const assetState = vi.hoisted(() => ({ mode: "success" as "success" | "loading" | "failure" }));

vi.mock("~/assets/assetUrls", () => ({
  useAssetUrlState: (
    _environmentId: unknown,
    resource: { _tag: "attachment"; attachmentId: string },
  ) => {
    if (assetState.mode === "loading") return { _tag: "Loading" as const };
    if (assetState.mode === "failure") return { _tag: "Failure" as const };
    return {
      _tag: "Success" as const,
      url: `https://environment.example/assets/${resource.attachmentId}.png`,
    };
  },
}));

import {
  ConceptSetRow,
  MAX_CONCEPT_SET_OPTIONS,
  moveConceptScreen,
  rankConceptScreens,
  setConceptDisposition,
  toggleConceptComparison,
  type ConceptScreenEntry,
} from "./ConceptSetRow";

const environmentId = EnvironmentId.make("environment-1");

function screen(
  id: string,
  initialRank: number,
  observedAt: string,
  title = id,
): ConceptScreenEntry {
  return {
    id,
    attachmentId: `attachment-${id}`,
    url: `http://localhost:5173/${id}`,
    title,
    observedAt,
    width: 1_280,
    height: 800,
    interactiveElementCount: 2,
    consoleErrorCount: 0,
    networkFailureCount: 0,
    actionCount: 1,
    concept: {
      id: `concept-${id}`,
      title,
      summary: `Summary for ${id}`,
      tradeoff: id === "alpha" ? "More visual density" : undefined,
      initialRank,
    },
  };
}

const options = [
  screen("gamma", 3, "2026-08-05T12:00:03.000Z"),
  screen("alpha", 1, "2026-08-05T12:00:02.000Z"),
  screen("beta", 1, "2026-08-05T12:00:01.000Z"),
];

describe("ConceptSetRow", () => {
  it("keeps concept options, ranks by initial rank then observed time, and caps at ten", () => {
    const extra = Array.from({ length: MAX_CONCEPT_SET_OPTIONS + 2 }, (_, index) =>
      screen(
        `extra-${index}`,
        index + 4,
        `2026-08-05T12:01:${String(index).padStart(2, "0")}.000Z`,
      ),
    );
    const nonConcept: UiHistoryEntry = { ...options[0]!, concept: undefined };
    const ranked = rankConceptScreens([...options, nonConcept, ...extra]);

    expect(ranked.map((entry) => entry.id)).toEqual([
      "beta",
      "alpha",
      "gamma",
      ...extra.slice(0, MAX_CONCEPT_SET_OPTIONS - 3).map((entry) => entry.id),
    ]);
    expect(ranked).toHaveLength(MAX_CONCEPT_SET_OPTIONS);
  });

  it("reorders options and restores a two-option comparison without exceeding two", () => {
    const ranked = rankConceptScreens(options);
    expect(moveConceptScreen(ranked, 2, 0).map((entry) => entry.id)).toEqual([
      "gamma",
      "beta",
      "alpha",
    ]);
    expect(toggleConceptComparison([], "alpha")).toEqual(["alpha"]);
    expect(toggleConceptComparison(["alpha"], "beta")).toEqual(["alpha", "beta"]);
    expect(toggleConceptComparison(["alpha", "beta"], "gamma")).toEqual(["alpha", "beta"]);
    expect(toggleConceptComparison(["alpha", "beta"], "alpha")).toEqual(["beta"]);
  });

  it("preserves every option through repeated long-distance and invalid reorder attempts", () => {
    const ranked = rankConceptScreens(options);
    const expectedIds = ranked.map((entry) => entry.id).toSorted();
    let reordered = ranked;

    for (let index = 0; index < 250; index += 1) {
      const from = index % reordered.length;
      const to = (index * 7 + 2) % reordered.length;
      reordered = moveConceptScreen(reordered, from, to);
      expect(reordered.map((entry) => entry.id).toSorted()).toEqual(expectedIds);
    }

    expect(moveConceptScreen(reordered, -1, 0)).toEqual(reordered);
    expect(moveConceptScreen(reordered, 0, reordered.length)).toEqual(reordered);
  });

  it("makes Keep, Question, and Reject reversible", () => {
    const kept = setConceptDisposition({}, "alpha", "keep");
    const questioned = setConceptDisposition(kept, "alpha", "question");
    const rejected = setConceptDisposition(questioned, "alpha", "reject");
    expect(rejected).toEqual({ alpha: "reject" });
    expect(setConceptDisposition(rejected, "alpha", "reject")).toEqual({});
  });

  it("renders the selected visual, ranked controls, comparison affordance, and actions", () => {
    assetState.mode = "success";
    const markup = renderToStaticMarkup(
      <ConceptSetRow environmentId={environmentId} screens={options} onImageExpand={vi.fn()} />,
    );

    expect(markup).toContain('data-concept-set="true"');
    expect(markup).toContain('data-concept-selected="true"');
    expect(markup).toContain("Concept options");
    expect(markup).toContain("Ranked options");
    expect(markup).toContain("Keep");
    expect(markup).toContain("Question");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Drag beta to reorder");
    expect(markup).toContain("Drag to rank · compare two");
    expect(markup).toContain("Reset option order");
    expect(markup).toContain("Continue with selected");
    expect(markup).toContain("Remix kept");
    expect(markup).toContain("https://environment.example/assets/attachment-beta.png");
  });

  it("shows empty and failed-image states honestly", () => {
    expect(
      renderToStaticMarkup(<ConceptSetRow environmentId={environmentId} screens={[options[0]!]} />),
    ).toBe("");

    assetState.mode = "failure";
    const markup = renderToStaticMarkup(
      <ConceptSetRow environmentId={environmentId} screens={options} />,
    );
    expect(markup).toContain('data-concept-image-state="failure"');
    expect(markup).toContain("Image unavailable");
    expect(markup).not.toContain("<img");
  });
});
