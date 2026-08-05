import type { CrokiApplication } from "@croki/shared/crokiApplication";
import type { CrokiConceptFile } from "@croki/shared/crokiConcepts";
import type { CrokiReleaseFile, CrokiVentureFile } from "@croki/shared/crokiScopes";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { CrokiApplicationVisual } from "./CrokiApplicationVisual";
import { CrokiConceptVisual } from "./CrokiConceptVisual";
import { CrokiReleaseVisual } from "./CrokiReleaseVisual";
import { CrokiVentureVisual } from "./CrokiVentureVisual";
import { isCrokiObjectPath, parseCrokiVisualObject } from "./CrokiObjectSurface.logic";

const application: CrokiApplication = {
  version: 1,
  application: { name: "Croki" },
  released: {
    version: "0.4.5",
    summary: "Native agent work remains inspectable.",
    product: ["Threads are the durable execution spine."],
    gtm: ["Croki is for founders building real software."],
    learnings: [],
    sources: [{ kind: "git-tag", ref: "v0.4.5" }],
  },
  building: {
    version: "0.4.7",
    intent: "Models can return to interfaces they actually checked.",
    product: ["Checked screens persist with their originating Thread."],
    gtm: ["Models can return to UI they actually saw."],
    successSignals: ["A later turn can reopen one checked screen."],
  },
};

const concept: CrokiConceptFile = {
  version: 1,
  kind: "concept",
  concept: {
    id: "application-sense",
    name: "Application Sense",
    intent: "Parallel product work remains one coherent application.",
    status: "exploring",
  },
  parent: { application: "Croki", releasedVersion: "0.4.5", buildingVersion: "0.4.7" },
  scope: { branch: "croki/concept/application-sense" },
  inherits: ["Threads remain where work happens."],
  challenges: ["Canvas should not remain durable project memory."],
  relationships: [{ kind: "supports", target: "parallel-threads" }],
  evidence: [{ kind: "file", ref: "docs/croki.md" }],
};

const release: CrokiReleaseFile = {
  version: 1,
  kind: "release",
  release: { id: "croki-0.4.7", name: "Croki 0.4.7", version: "0.4.7", status: "integrating" },
  parent: { application: "Croki" },
  previous: { version: "0.4.5", reality: "Agents reconstructed context." },
  intent: "Repositories gain product awareness.",
  concepts: ["application-sense"],
  product: {
    before: ["Context was scattered."],
    after: ["Context is inherited."],
    changes: ["Open visual product worlds."],
    removed: ["Manual indexes"],
  },
  gtm: {
    expression: ["Build many ideas as one product."],
    demoMoments: ["Open the release story."],
  },
  proof: ["All scopes validate."],
  successSignals: ["Native turns fail open."],
  learnings: [],
  evidence: [],
};

const venture: CrokiVentureFile = {
  version: 1,
  kind: "venture",
  venture: {
    id: "jacob",
    name: "Jacob Rhinehart Venture",
    thesis: "Build coherent products simply.",
  },
  audience: ["Founders"],
  distribution: [],
  businessModel: [],
  applications: [{ id: "croki", name: "Croki" }],
  capabilities: ["Founder judgment"],
  constraints: ["Native tools stay authoritative"],
  opportunities: [],
  conflicts: [],
  evidence: [],
};

describe("Croki visual objects", () => {
  it("recognizes .croki objects and distinguishes applications from Concepts", () => {
    expect(isCrokiObjectPath(".croki/application.croki")).toBe(true);
    expect(isCrokiObjectPath(".croki/application.json")).toBe(true);
    expect(isCrokiObjectPath("package.json")).toBe(false);
    expect(parseCrokiVisualObject(JSON.stringify(application))).toMatchObject({
      kind: "application",
    });
    expect(parseCrokiVisualObject(JSON.stringify(concept))).toMatchObject({ kind: "concept" });
    expect(parseCrokiVisualObject(JSON.stringify(release))).toMatchObject({ kind: "release" });
    expect(parseCrokiVisualObject(JSON.stringify(venture))).toMatchObject({ kind: "venture" });
    expect(parseCrokiVisualObject("not structured data")).toEqual({ kind: "invalid" });
  });

  it("renders the application as release reality, Concepts, product, market, and evidence", () => {
    const markup = renderToStaticMarkup(
      <CrokiApplicationVisual
        application={application}
        concepts={<button type="button">Application Sense</button>}
        onShapeApplication={() => undefined}
      />,
    );

    expect(markup).toContain("Croki");
    expect(markup).toContain("0.4.5 → 0.4.7");
    expect(markup).toContain("In the world");
    expect(markup).toContain("In motion");
    expect(markup).toContain("Application Sense");
    expect(markup).toContain("What people will experience");
    expect(markup).toContain("How the market changes");
    expect(markup).toContain("How we will know");
    expect(markup).toContain("Git tag v0.4.5");
    expect(markup).toContain("Shape in Thread");
    expect(markup).not.toContain("application.json");
  });

  it("opens a Concept as a scoped world connected to its parent", () => {
    const markup = renderToStaticMarkup(
      <CrokiConceptVisual concept={concept} onOpenParent={() => undefined} />,
    );

    expect(markup).toContain("Croki / ");
    expect(markup).toContain("Application Sense");
    expect(markup).toContain("Exploring separately");
    expect(markup).toContain("What it inherits");
    expect(markup).toContain("What it challenges");
    expect(markup).toContain("Threads remain where work happens.");
    expect(markup).toContain("Canvas should not remain durable project memory.");
    expect(markup).toContain("parallel-threads");
    expect(markup).toContain("docs/croki.md");
  });

  it("renders Release as a story and Venture as a portfolio boundary", () => {
    const releaseMarkup = renderToStaticMarkup(
      <CrokiReleaseVisual release={release} onOpenParent={() => undefined} />,
    );
    expect(releaseMarkup).toContain("You’re shipping Croki 0.4.7");
    expect(releaseMarkup).toContain("Before");
    expect(releaseMarkup).toContain("After");
    expect(releaseMarkup).toContain("What disappears");

    const ventureMarkup = renderToStaticMarkup(<CrokiVentureVisual venture={venture} />);
    expect(ventureMarkup).toContain("Jacob Rhinehart Venture");
    expect(ventureMarkup).toContain("Shared advantages, independent product worlds");
    expect(ventureMarkup).toContain("Croki");
  });
});
