import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { CrokiCanvasArtifactLike } from "./crokiCanvasArtifactTypes";
import { CrokiCanvasArtifactView } from "./CrokiCanvasArtifact";
import { sameNodeSelection } from "./crokiCanvasArtifactSelection";

const artifact = {
  id: "canvas-1",
  revision: 2,
  threadId: "thread-1",
  turnId: null,
  harnessId: "product-v1",
  presentation: "compare",
  question: "How should visual reasoning participate in Croki?",
  nodes: [
    {
      id: "question",
      role: "focal",
      title: "How should visual reasoning participate in Croki?",
      body: "Keep execution in the Thread.",
      whyItMatters: "A visual should improve judgment, not create a second runtime.",
    },
    {
      id: "route-a",
      role: "route",
      title: "Optional harness artifact",
      body: "Product and GTM produce a visual only when relationships need space.",
      references: [{ kind: "file", path: "docs/project/harness-canvas-spec.md" }],
    },
    {
      id: "warning",
      role: "warning",
      title: "Do not duplicate Thread state",
      body: "Coordination remains chronological in the Thread.",
    },
  ],
  edges: [{ from: "question", to: "route-a", relation: "supports" }],
  createdAt: "2026-08-02T00:00:00.000Z",
} as unknown as CrokiCanvasArtifactLike;

describe("CrokiCanvasArtifactView", () => {
  it("treats equivalent React Flow selections as stable", () => {
    expect(sameNodeSelection(["route-a", "question"], ["question", "route-a"])).toBe(true);
    expect(sameNodeSelection(["route-a"], ["question"])).toBe(false);
  });

  it("renders a thread-scoped Product artifact without legacy editing chrome", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasArtifactView
        artifact={artifact}
        latestArtifact={{ ...artifact, revision: 3 } as CrokiCanvasArtifactLike}
        onViewArtifactRevision={vi.fn()}
      />,
    );
    expect(markup).toContain('aria-label="Harness Canvas"');
    expect(markup).toContain("Product · revision 2");
    expect(markup).toContain("Updated from this Thread");
    expect(markup).toContain("Revision 3 available");
    expect(markup).toContain("Optional harness artifact");
    expect(markup).toContain("Do not duplicate Thread state");
    expect(markup).not.toContain("Product / Run / Proposals");
    expect(markup).not.toContain("Save Canvas");
  });

  it("keeps selected artifact titles visible for Thread context", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasArtifactView
        artifact={artifact}
        selectedNodeIds={["question", "route-a"]}
        onUseSelectionInThread={vi.fn()}
      />,
    );
    expect(markup).toContain("Canvas selection:");
    expect(markup).toContain("How should visual reasoning participate in Croki?");
    expect(markup).toContain("Optional harness artifact");
    expect(markup).toContain("Use in Thread");
    expect(markup).toContain("Why it matters");

    const focused = renderToStaticMarkup(
      <CrokiCanvasArtifactView artifact={artifact} selectedNodeIds={["route-a"]} />,
    );
    expect(focused).toContain("Evidence");
  });

  it("renders an unavailable state without opening a broken field", () => {
    const markup = renderToStaticMarkup(<CrokiCanvasArtifactView artifact={null} />);
    expect(markup).toContain("No visual is available in this Thread.");
    expect(markup).not.toContain("react-flow");
  });
});
