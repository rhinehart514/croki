import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { RightPanelEmptyState, RightPanelSurfaceIcon } from "./RightPanelTabs";

describe("RightPanelSurfaceIcon", () => {
  it.each([
    { active: true, state: "active", colorClass: "text-primary" },
    { active: false, state: "inactive", colorClass: "text-current" },
  ])("renders the Canvas icon in its $state state", ({ active, state, colorClass }) => {
    const markup = renderToStaticMarkup(
      <RightPanelSurfaceIcon
        surface={{ id: "canvas", kind: "canvas" }}
        sessions={{}}
        theme="dark"
        active={active}
      />,
    );

    expect(markup).toContain("lucide-circle-dot");
    expect(markup).toContain(`data-surface-icon-state="${state}"`);
    expect(markup).toContain(colorClass);
  });
});

describe("RightPanelEmptyState", () => {
  const props = {
    onAddBrowser: () => undefined,
    onAddTerminal: () => undefined,
    onAddDiff: () => undefined,
    onAddFiles: () => undefined,
    onAddCanvas: () => undefined,
    onAddAgents: () => undefined,
    browserAvailable: true,
    diffAvailable: true,
    filesAvailable: true,
  };

  it("presents Preview as one running-app surface and omits disabled Canvas", () => {
    const markup = renderToStaticMarkup(
      <RightPanelEmptyState {...props} canvasAvailable={false} />,
    );

    expect(markup).toContain("Preview");
    expect(markup).toContain("Open and interact with a running app.");
    expect(markup).not.toContain("component or product idea");
    expect(markup).not.toContain("Canvas");
  });

  it("offers Canvas only when its beta is enabled", () => {
    const markup = renderToStaticMarkup(<RightPanelEmptyState {...props} canvasAvailable />);

    expect(markup).toContain("Canvas");
  });
});
