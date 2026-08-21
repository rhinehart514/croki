import { EnvironmentId } from "@croki/contracts";
import { createEmptyCrokiContext, type CrokiContext } from "@croki/shared/crokiContext";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  applyTransition: vi.fn(),
  context: null as CrokiContext | null,
  discard: vi.fn(),
  save: vi.fn(),
}));

vi.mock("./useCrokiCanvasController", () => ({
  useCrokiCanvasController: () => ({
    applyTransition: mocks.applyTransition,
    canRedo: false,
    canUndo: false,
    discard: mocks.discard,
    redo: vi.fn(),
    retry: vi.fn(),
    save: mocks.save,
    state: {
      context: mocks.context ?? createEmptyCrokiContext("Croki"),
      baseline: createEmptyCrokiContext("Croki"),
      baselineContents: "{}",
      conflictContents: null,
      dirty: true,
      isSaving: false,
      modelError: null,
      repairConfirmation: false,
      repairInProgress: false,
      selectedNodeId: null,
      sourceMessage: null,
      sourceState: "valid",
    },
    undo: vi.fn(),
    validationErrors: [],
    workspaceKey: "local\u0000/work/croki",
  }),
}));
vi.mock("./CrokiCanvasSourceNotice", () => ({ CrokiCanvasSourceNotice: () => null }));

import { CrokiReleaseCanvas } from "./CrokiReleaseCanvas";

describe("CrokiReleaseCanvas", () => {
  beforeEach(() => {
    mocks.applyTransition.mockReset();
    mocks.discard.mockReset();
    mocks.save.mockReset();
    mocks.context = null;
  });

  it("introduces Canvas by asking for the next release when none exists", () => {
    const markup = renderCanvas();
    expect(markup).toContain('aria-label="Release Canvas"');
    expect(markup).toContain("Name the next release");
    expect(markup).toContain("See what is being built toward the next release.");
    expect(markup).not.toContain('aria-label="Release scope"');
  });

  it("opens on active release scope and identifies current Thread work", () => {
    mocks.context = contextWithRelease();
    const markup = renderCanvas({ id: "thread-1", title: "Build Release Canvas" });

    expect(markup).toContain("Next release 0.4.2 · from 0.4.1");
    expect(markup).toContain("See the next release taking shape.");
    expect(markup).toContain('aria-label="Release scope"');
    expect(markup).toContain('aria-label="Working"');
    expect(markup).toContain("Native Release Canvas");
    expect(markup).toContain('aria-label="Current Thread"');
    expect(markup).toContain("0/1 proof");
    expect(markup).toContain("Save");
  });

  it("keeps project context available without displacing the release default", () => {
    mocks.context = contextWithRelease();
    const markup = renderToStaticMarkup(
      <CrokiReleaseCanvas
        environmentId={EnvironmentId.make("local")}
        productName="Croki"
        workspaceRoot="/work/croki"
        onOpenContext={vi.fn()}
      />,
    );

    expect(markup).toContain(">Context</button>");
    expect(markup).toContain('aria-label="Release scope"');
  });
});

function renderCanvas(activeThread?: { readonly id: string; readonly title: string }) {
  return renderToStaticMarkup(
    <CrokiReleaseCanvas
      environmentId={EnvironmentId.make("local")}
      productName="Croki"
      workspaceRoot="/work/croki"
      {...(activeThread ? { activeThread } : {})}
    />,
  );
}

function contextWithRelease(): CrokiContext {
  return {
    ...createEmptyCrokiContext("Croki"),
    release: {
      version: "0.4.2",
      baseline: "0.4.1",
      goal: "See the next release taking shape.",
      status: "active",
      items: [
        {
          id: "native-release-canvas",
          title: "Native Release Canvas",
          kind: "feature",
          status: "working",
          outcome: "See active work and missing proof beside the Thread.",
          acceptanceCriteria: [
            { id: "visible", text: "The release is visible.", status: "pending" },
          ],
          sourceThreads: [{ id: "thread-1", title: "Build Release Canvas" }],
        },
      ],
    },
  };
}
