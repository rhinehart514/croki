import { TurnId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { CrokiCanvasRunProjection } from "./CrokiCanvasRunProjection";

describe("CrokiCanvasRunProjection", () => {
  it("projects the current native Thread plan as workflow state", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasRunProjection
        activePlan={{
          createdAt: "2026-07-30T00:00:00.000Z",
          turnId: TurnId.make("turn-1"),
          explanation: "Validate the complete signup experience.",
          steps: [
            { step: "Inspect the current flow", status: "completed" },
            { step: "Test account creation", status: "inProgress" },
            { step: "Synthesize evidence", status: "pending" },
          ],
        }}
      />,
    );

    expect(markup).toContain("Current Thread run");
    expect(markup).toContain("Validate the complete signup experience.");
    expect(markup).toContain('aria-label="Completed"');
    expect(markup).toContain('aria-label="In progress"');
    expect(markup).toContain('aria-label="Pending"');
  });

  it("prepares workflow composition in the current Thread", () => {
    const onPrepareWorkflow = vi.fn();
    const markup = renderToStaticMarkup(
      <CrokiCanvasRunProjection activePlan={null} onPrepareWorkflow={onPrepareWorkflow} />,
    );

    expect(markup).toContain("ordinary Croki turns");
    expect(markup).toContain("Compose in Thread");
  });
});
