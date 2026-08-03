import { EnvironmentId, ThreadId } from "@croki/contracts";
import type { CrokiContext } from "@croki/shared/crokiContext";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { CrokiCanvasArtifactLike } from "./crokiCanvasArtifactTypes";

const mocks = vi.hoisted(() => ({
  fieldProps: null as Record<string, unknown> | null,
  selectNode: vi.fn(),
  selectArtifactNodes: vi.fn(),
}));

const CONTEXT: CrokiContext = {
  version: 1,
  product: "Croki",
  updatedAt: "2026-07-30T00:00:00.000Z",
  nodes: [
    {
      id: "intent-1",
      kind: "intent",
      status: "current",
      title: "Keep product truth near the work",
      body: "",
      updatedAt: "2026-07-30T00:00:00.000Z",
    },
    {
      id: "work-1",
      kind: "work",
      status: "provisional",
      title: "Add the review loop",
      body: "",
      updatedAt: "2026-07-30T00:00:00.000Z",
    },
  ],
  edges: [{ from: "work-1", to: "intent-1", relation: "enables" }],
};

vi.mock("./useCrokiCanvasController", () => ({
  useCrokiCanvasController: () => ({
    retry: vi.fn(),
    state: {
      context: CONTEXT,
      conflictContents: null,
      dirty: false,
      isSaving: false,
      modelError: null,
      repairConfirmation: false,
      repairInProgress: false,
      selectedNodeId: null,
      sourceMessage: null,
      sourceState: "valid",
    },
    workspaceKey: "local\u0000/work/croki",
  }),
}));
vi.mock("./crokiCanvasDraftStore", () => ({
  selectCrokiCanvasNode: (...args: readonly unknown[]) => mocks.selectNode(...args),
}));
vi.mock("./CrokiCanvasLiveField", () => ({
  CrokiCanvasLiveField: (props: Record<string, unknown>) => {
    mocks.fieldProps = props;
    return <div aria-label="Live Canvas field" />;
  },
}));

import { CrokiCanvas } from "./CrokiCanvas";
import { canvasThreadFocusIds } from "./crokiCanvasThreadFocus";

describe("CrokiCanvas live perception interactions", () => {
  beforeEach(() => {
    mocks.fieldProps = null;
    mocks.selectNode.mockReset();
    mocks.selectArtifactNodes.mockReset();
  });

  it("routes spatial context selection into the existing source selection store", () => {
    renderCanvas();
    const field = mocks.fieldProps as {
      readonly onSelect: (object: {
        readonly id: string;
        readonly source: string;
        readonly selectionId?: string;
      }) => void;
    };
    field.onSelect({ id: "context:work-1", source: "context", selectionId: "work-1" });
    expect(mocks.selectNode).toHaveBeenLastCalledWith("local\u0000/work/croki", "work-1");
  });

  it("keeps source actions separate from the projection", () => {
    const onOpenReference = vi.fn();
    const markup = renderCanvas({ onOpenReference });
    expect(markup).toContain('aria-label="Croki Live Canvas"');
    expect(markup).toContain("Working understanding");
    expect(markup).not.toContain("Save Canvas");
    expect(markup).not.toContain("Undo Canvas change");
  });

  it("forwards artifact selection callbacks without creating Canvas state", () => {
    const onSelectArtifactNodes = vi.fn();
    renderCanvas({
      artifact: { id: "visual-1" } as CrokiCanvasArtifactLike,
      onSelectArtifactNodes,
    });
    const field = mocks.fieldProps as {
      readonly onSelect: (object: {
        readonly id: string;
        readonly source: string;
        readonly selectionId?: string;
        readonly artifact?: CrokiCanvasArtifactLike;
      }) => void;
    };
    field.onSelect({
      id: "visual:artifact:node-1",
      source: "visual",
      selectionId: "node-1",
      artifact: {
        id: "visual-1",
        revision: 1,
        threadId: ThreadId.make("thread-1"),
        turnId: null,
        harnessId: "product-v1",
        presentation: "system",
        question: "Observe this",
        nodes: [{ id: "node-1", role: "focal", title: "Focal" }],
        edges: [],
        createdAt: "2026-07-30T00:00:00.000Z",
      },
    });
    expect(onSelectArtifactNodes).toHaveBeenLastCalledWith(["node-1"]);
  });

  it("forwards sensed object ids as ephemeral Thread attention", () => {
    const onSelectArtifactNodes = vi.fn();
    renderCanvas({ onSelectArtifactNodes });
    const field = mocks.fieldProps as {
      readonly onSelect: (object: {
        readonly id: string;
        readonly source: string;
        readonly selectionId?: string;
        readonly perceptionObject?: { readonly id: string };
      }) => void;
    };
    field.onSelect({
      id: "activity:preview-1",
      source: "visual",
      selectionId: "activity:preview-1",
      perceptionObject: { id: "activity:preview-1" },
    });
    expect(onSelectArtifactNodes).toHaveBeenLastCalledWith(["activity:preview-1"]);
    expect(mocks.selectNode).not.toHaveBeenCalled();
  });

  it("addresses live conclusions and collapsed evidence through stable sensed ids", () => {
    expect(
      canvasThreadFocusIds([
        {
          selectionId: "conclusion:1",
          perceptionObject: { id: "conclusion:1" },
        },
        {
          perceptionObjects: [{ id: "source:1" }, { id: "source:2" }],
        },
      ]),
    ).toEqual(["conclusion:1", "source:1", "source:2"]);
  });

  it("wires a direct Canvas row action to the native Thread focus bridge", () => {
    const onUseSelectionInThread = vi.fn();
    renderCanvas({ onUseSelectionInThread });
    const field = mocks.fieldProps as {
      readonly onAddress: (object: {
        readonly id: string;
        readonly selectionId: string;
        readonly perceptionObject: { readonly id: string };
      }) => void;
    };

    field.onAddress({
      id: "artifact:judgment-1",
      selectionId: "artifact:judgment-1",
      perceptionObject: { id: "artifact:judgment-1" },
    });

    expect(onUseSelectionInThread).toHaveBeenLastCalledWith(["artifact:judgment-1"]);
  });
});

function renderCanvas(
  props: {
    readonly artifact?: CrokiCanvasArtifactLike;
    readonly onOpenReference?: () => void;
    readonly onSelectArtifactNodes?: (ids: readonly string[]) => void;
    readonly onUseSelectionInThread?: (ids: readonly string[]) => void;
  } = {},
) {
  return renderToStaticMarkup(
    <CrokiCanvas
      environmentId={EnvironmentId.make("local")}
      productName="Croki"
      workspaceRoot="/work/croki"
      {...props}
    />,
  );
}
