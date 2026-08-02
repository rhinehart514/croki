import { EnvironmentId } from "@croki/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { CrokiCanvasArtifactLike } from "./crokiCanvasArtifactTypes";

vi.mock("./CrokiReleaseCanvas", () => ({
  CrokiReleaseCanvas: () => <section aria-label="Release mode" />,
}));
vi.mock("./CrokiContextCanvas", () => ({
  CrokiContextCanvas: () => <section aria-label="Context mode" />,
}));
vi.mock("./CrokiCanvasArtifact", () => ({
  CrokiCanvasArtifactView: () => <section aria-label="Artifact mode" />,
}));

import { CrokiCanvas } from "./CrokiCanvas";

const artifact = { id: "visual-1" } as CrokiCanvasArtifactLike;

describe("CrokiCanvas routing", () => {
  it("opens Release Canvas for an explicit empty artifact selection", () => {
    expect(renderCanvas({ artifact: null })).toContain('aria-label="Release mode"');
  });

  it("keeps project Context as an explicit secondary mode", () => {
    expect(renderCanvas({})).toContain('aria-label="Context mode"');
  });

  it("opens a selected Thread visual without changing either project mode", () => {
    expect(renderCanvas({ artifact })).toContain('aria-label="Artifact mode"');
  });
});

function renderCanvas(props: { readonly artifact?: CrokiCanvasArtifactLike | null }): string {
  return renderToStaticMarkup(
    <CrokiCanvas
      environmentId={EnvironmentId.make("local")}
      productName="Croki"
      workspaceRoot="/work/croki"
      {...props}
    />,
  );
}
