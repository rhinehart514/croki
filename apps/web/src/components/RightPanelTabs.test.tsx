import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { RightPanelSurfaceIcon } from "./RightPanelTabs";

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
