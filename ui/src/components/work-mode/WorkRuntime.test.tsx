import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkPreview, WorkTerminal } from ".";

describe("desktop work runtime fallbacks", () => {
  afterEach(() => { delete window.droverDesktop; });

  it("states native capability honestly in the browser harness", () => {
    render(<><WorkTerminal ventureId="venture-1" workspaceId="workspace-1" /><WorkPreview workspaceId="workspace-1" /></>);
    expect(screen.getByText("Terminal is available in the Drover desktop app.")).toBeInTheDocument();
    expect(screen.getByText("Preview is available in the Drover desktop app.")).toBeInTheDocument();
  });

  it("shows a canonical workspace unavailability reason", () => {
    render(<WorkTerminal ventureId="venture-1" workspaceId="workspace-1" unavailableReason="This workspace was discarded." />);
    expect(screen.getByRole("status")).toHaveTextContent("This workspace was discarded.");
  });
});
