import type { CrokiApplication } from "@croki/shared/crokiApplication";
import { describe, expect, it } from "vite-plus/test";

import {
  conceptIdsFromEntries,
  conceptThreadOptions,
  createCrokiConcept,
} from "./CrokiConceptControl.logic";

const application: CrokiApplication = {
  version: 1,
  application: { name: "Croki" },
  released: {
    version: "0.4.5",
    summary: "Threads are where work happens.",
    product: [],
    gtm: [],
    learnings: [],
    sources: [],
  },
  building: {
    version: "0.4.6",
    intent: "Keep parallel product work coherent.",
    product: [],
    gtm: [],
    successSignals: [],
  },
};

describe("Croki concept creation", () => {
  it("creates one self-describing child without a central index", () => {
    const concept = createCrokiConcept(
      application,
      "Application Sense",
      " Explore without changing application truth. ",
      ["application-sense"],
    );

    expect(concept.concept.id).toBe("application-sense-2");
    expect(concept.scope.branch).toBe("croki/concept/application-sense-2");
    expect(concept.parent).toEqual({
      application: "Croki",
      releasedVersion: "0.4.5",
      buildingVersion: "0.4.6",
    });
    expect(concept.concept.intent).toBe("Explore without changing application truth.");
    expect(concept).not.toHaveProperty("index");
  });

  it("discovers only direct concept files", () => {
    expect(
      conceptIdsFromEntries([
        { path: ".croki/concepts/application-sense.croki" },
        { path: ".croki/concepts/nested/ignored.croki" },
        { path: ".croki/application.croki" },
      ]),
    ).toEqual(["application-sense"]);
  });

  it("opens the concept branch as a worktree Thread", () => {
    expect(conceptThreadOptions("croki/concept/application-sense")).toEqual({
      branch: "croki/concept/application-sense",
      envMode: "worktree",
    });
  });
});
