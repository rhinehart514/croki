import type { CrokiApplication } from "@croki/shared/crokiApplication";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ApplicationFocusDetails, CrokiApplicationFocus } from "./CrokiApplicationFocus";
import { applicationFocusLabel } from "./CrokiApplicationPresentation.logic";

const application: CrokiApplication = {
  version: 1,
  application: {
    name: "Croki",
    promise: "Build at agent speed without losing application coherence.",
  },
  released: {
    version: "0.4.7",
    summary: "Native agent work remains inspectable.",
    product: [],
    gtm: [],
    learnings: [],
    sources: [],
  },
  building: {
    version: "0.4.8",
    intent: "Keep application focus inside a normal ADE.",
    product: ["Show one compact application focus."],
    gtm: [],
    successSignals: [],
  },
};

describe("Croki application focus", () => {
  it("reduces application lineage to the current released-to-building focus", () => {
    expect(applicationFocusLabel(application)).toBe("0.4.7 → 0.4.8");
    const markup = renderToStaticMarkup(
      <CrokiApplicationFocus
        state={{
          status: "loaded",
          application,
          sourcePath: ".croki/application.croki",
        }}
        onOpenSource={() => undefined}
      />,
    );
    expect(markup).toContain("0.4.7 → 0.4.8");
    expect(markup).toContain("Open application focus");
  });

  it("keeps repositories without an application brief in the ordinary ADE", () => {
    expect(
      renderToStaticMarkup(
        <CrokiApplicationFocus state={{ status: "absent" }} onOpenSource={() => undefined} />,
      ),
    ).toBe("");
  });

  it("makes a broken application brief directly repairable", () => {
    const markup = renderToStaticMarkup(
      <CrokiApplicationFocus
        state={{
          status: "invalid",
          errorCode: "malformed",
          sourcePath: ".croki/application.croki",
        }}
        onOpenSource={() => undefined}
      />,
    );
    expect(markup).toContain(".croki invalid");
    expect(markup).toContain("Open .croki/application.croki to repair it");
  });

  it("shows the application promise and current intent without another object browser", () => {
    const markup = renderToStaticMarkup(<ApplicationFocusDetails application={application} />);
    expect(markup).toContain("Application direction");
    expect(markup).toContain("Keep application focus inside a normal ADE.");
    expect(markup).toContain("Project-declared in .croki/application.croki");
    expect(markup).not.toContain("Concept");
    expect(markup).not.toContain("Venture");
  });
});
