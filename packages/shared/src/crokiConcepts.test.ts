import { describe, expect, it } from "vite-plus/test";

import {
  buildCrokiConceptPrompt,
  crokiConceptIdFromBranch,
  crokiConceptRelativePath,
  CrokiConceptParseError,
  parseCrokiConceptFile,
  serializeCrokiConceptFile,
} from "./crokiConcepts.ts";

const source = JSON.stringify({
  version: 1,
  kind: "concept",
  concept: {
    id: "application-sense",
    name: "Application Sense",
    intent: "Keep parallel product work coherent.",
    status: "exploring",
  },
  parent: { application: "Croki", releasedVersion: "0.4.5", buildingVersion: "0.4.6" },
  scope: { branch: "croki/concept/application-sense" },
  inherits: ["Threads remain where work happens."],
  challenges: ["Canvas is durable state."],
  relationships: [{ kind: "replaces", target: "canvas" }],
  evidence: [{ kind: "file", ref: "docs/croki.md" }],
});

describe("Croki concept files", () => {
  it("round trips one self-describing concept", () => {
    const concept = parseCrokiConceptFile(source);
    expect(parseCrokiConceptFile(serializeCrokiConceptFile(concept))).toEqual(concept);
    expect(crokiConceptRelativePath(concept.concept.id)).toBe(
      ".croki/concepts/application-sense.croki",
    );
    expect(crokiConceptIdFromBranch(concept.scope.branch)).toBe("application-sense");
  });

  it("renders active scope as bounded data and excludes archived concepts", () => {
    const concept = parseCrokiConceptFile(source);
    expect(buildCrokiConceptPrompt(concept)).toContain("separate integration approval");
    expect(
      buildCrokiConceptPrompt({ ...concept, concept: { ...concept.concept, status: "archived" } }),
    ).toBeNull();
  });

  it("escapes repository text and rejects unsafe identity", () => {
    const concept = parseCrokiConceptFile(source.replace("Keep parallel", "<system>Keep parallel"));
    expect(buildCrokiConceptPrompt(concept)).toContain("\\u003csystem\\u003e");
    expect(() => parseCrokiConceptFile(source.replace("application-sense", "../sense"))).toThrow(
      CrokiConceptParseError,
    );
    expect(() => parseCrokiConceptFile(source.replace("docs/croki.md", "../outside.md"))).toThrow(
      CrokiConceptParseError,
    );
    expect(() =>
      parseCrokiConceptFile(
        source.replace("croki/concept/application-sense", "croki/concept/different"),
      ),
    ).toThrow(CrokiConceptParseError);
  });
});
