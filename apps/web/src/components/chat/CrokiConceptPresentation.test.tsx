import type { CrokiConceptFile } from "@croki/shared/crokiConcepts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ActiveConceptDetails, CreateConceptDialogContents } from "./CrokiConceptPresentation";
import { Dialog } from "../ui/dialog";

const concept: CrokiConceptFile = {
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
  inherits: [],
  challenges: [],
  relationships: [],
  evidence: [],
};

describe("Croki concept presentation", () => {
  it("states the isolation and application-truth boundary before creation", () => {
    const markup = renderToStaticMarkup(
      <Dialog open>
        <CreateConceptDialogContents
          name="Application Sense"
          intent="Keep parallel product work coherent."
          saving={false}
          onOpenChange={() => undefined}
          onNameChange={() => undefined}
          onIntentChange={() => undefined}
          onCreate={() => undefined}
        />
      </Dialog>,
    );

    expect(markup).toContain("Explore a concept separately");
    expect(markup).toContain("isolated worktree Thread");
    expect(markup).toContain("Application truth stays unchanged");
    expect(markup).toContain("What should become true?");
  });

  it("keeps active scope and lifecycle actions in the Thread header", () => {
    const markup = renderToStaticMarkup(
      <ActiveConceptDetails concept={concept} saving={false} onStatus={() => undefined} />,
    );

    expect(markup).toContain("Application Sense");
    expect(markup).toContain("Exploring separately · Parent context active");
    expect(markup).toContain("croki/concept/application-sense");
    expect(markup).toContain("Review integration");
    expect(markup).toContain("Archive concept");
  });
});
