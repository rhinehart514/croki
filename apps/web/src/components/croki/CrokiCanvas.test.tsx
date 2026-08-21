import { EnvironmentId } from "@croki/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { CrokiCanvasArtifactLike } from "./crokiCanvasArtifactTypes";

const mocks = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));

vi.mock("./CrokiTrueCanvas", () => ({
  CrokiTrueCanvas: (props: Record<string, unknown>) => {
    mocks.props = props;
    return <section aria-label="Croki Live Canvas" data-canvas-surface="true" />;
  },
}));

import { CrokiCanvas } from "./CrokiCanvas";

const artifact = { id: "visual-1" } as CrokiCanvasArtifactLike;

describe("CrokiCanvas unified surface", () => {
  it("uses one Canvas surface when no legacy selection exists", () => {
    expect(renderCanvas({})).toContain('aria-label="Croki Live Canvas"');
    expect(renderCanvas({})).not.toContain("Release mode");
    expect(renderCanvas({})).not.toContain("Context mode");
    expect(renderCanvas({})).not.toContain("Artifact mode");
  });

  it("keeps the same surface for release and Thread visual projections", () => {
    expect(renderCanvas({ artifact: null })).toContain('aria-label="Croki Live Canvas"');
    expect(renderCanvas({ artifact })).toContain('aria-label="Croki Live Canvas"');
  });

  it("forwards legacy data and source seams to the live projection", () => {
    const onOpenReference = vi.fn();
    const onApproveCanvasObjects = vi.fn();
    renderCanvas({ artifact, onOpenReference, onApproveCanvasObjects });
    expect(mocks.props).toEqual(
      expect.objectContaining({ artifact, onOpenReference, onApproveCanvasObjects }),
    );
  });
});

function renderCanvas(props: {
  readonly artifact?: CrokiCanvasArtifactLike | null;
  readonly onOpenReference?: () => void;
  readonly onApproveCanvasObjects?: (ids: readonly string[]) => void;
}): string {
  return renderToStaticMarkup(
    <CrokiCanvas
      environmentId={EnvironmentId.make("local")}
      productName="Croki"
      workspaceRoot="/work/croki"
      {...props}
    />,
  );
}
