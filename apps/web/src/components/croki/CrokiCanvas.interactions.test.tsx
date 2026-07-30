import { EnvironmentId } from "@t3tools/contracts";
import type {
  CrokiContext,
  CrokiContextEdge,
  CrokiContextNode,
  CrokiContextReference,
  CrokiNodeKind,
} from "@t3tools/shared/crokiContext";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  applyTransition: vi.fn(),
  controllerProps: null as unknown,
  nodeEditorProps: null as unknown,
  overviewProps: null as unknown,
  replaceDraft: vi.fn(),
  save: vi.fn(),
  selectNode: vi.fn(),
  updateNode: vi.fn(),
}));

vi.mock("./useCrokiCanvasController", () => ({
  useCrokiCanvasController: (props: unknown) => {
    mocks.controllerProps = props;
    return {
      applyTransition: mocks.applyTransition,
      retry: vi.fn(),
      save: mocks.save,
      selectedNode: controllerState.selectedNode,
      state: controllerState.state,
      updateNode: mocks.updateNode,
      validationErrors: [],
      workspaceKey: "local\u0000/work/croki",
    };
  },
}));
vi.mock("./crokiCanvasDraftStore", () => ({
  cancelCrokiCanvasRepair: vi.fn(),
  confirmCrokiCanvasRepair: vi.fn(),
  reloadConflictingCrokiCanvasFile: vi.fn(),
  replaceCrokiCanvasDraft: (...args: readonly unknown[]) => mocks.replaceDraft(...args),
  requestCrokiCanvasRepair: vi.fn(),
  selectCrokiCanvasNode: (...args: readonly unknown[]) => mocks.selectNode(...args),
}));
vi.mock("./CrokiCanvasNodeEditor", () => ({
  CrokiCanvasNodeEditor: (props: unknown) => {
    mocks.nodeEditorProps = props;
    return <article aria-label="Focused Canvas editor" />;
  },
}));
vi.mock("./CrokiCanvasOverview", () => ({
  CrokiCanvasOverview: (props: unknown) => {
    mocks.overviewProps = props;
    return <nav aria-label="Canvas overview" />;
  },
}));
vi.mock("./CrokiCanvasSourceNotice", () => ({
  CrokiCanvasSourceNotice: () => null,
}));
vi.mock("../ui/scroll-area", () => ({
  ScrollArea: (props: { readonly children: unknown }) => <div>{props.children as never}</div>,
}));

import { CrokiCanvas } from "./CrokiCanvas";

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
  edges: [{ from: "work-1", to: "intent-1", relation: "advances" }],
};

const controllerState = {
  selectedNode: null as CrokiContextNode | null,
  state: {
    context: CONTEXT,
    baseline: CONTEXT,
    baselineContents: "{}",
    conflictContents: null,
    dirty: true,
    isSaving: false,
    modelError: null,
    repairConfirmation: false,
    repairInProgress: false,
    selectedNodeId: null,
    sourceMessage: null,
    sourceState: "valid" as const,
  },
};

describe("CrokiCanvas interaction routing", () => {
  beforeEach(() => {
    mocks.applyTransition.mockReset();
    mocks.replaceDraft.mockReset();
    mocks.save.mockReset();
    mocks.selectNode.mockReset();
    mocks.updateNode.mockReset();
    mocks.nodeEditorProps = null;
    mocks.overviewProps = null;
    controllerState.selectedNode = null;
  });

  it("routes add, adopt, retire, relationship, and selection actions", () => {
    renderCanvas();
    const props = mocks.overviewProps as OverviewProps;

    props.onAddNode("evidence");
    expect(mocks.applyTransition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        error: null,
        context: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              kind: "evidence",
              status: "provisional",
            }),
          ]),
        }),
      }),
    );
    expect(mocks.selectNode).toHaveBeenCalledWith(
      "local\u0000/work/croki",
      expect.stringMatching(/^evidence-/),
    );

    props.onAdopt("work-1");
    expect(lastTransitionNode("work-1").status).toBe("current");
    props.onReject("work-1");
    expect(lastTransitionNode("work-1").status).toBe("retired");
    props.onRetire("intent-1");
    expect(lastTransitionNode("intent-1").status).toBe("retired");

    props.onDeleteEdge(CONTEXT.edges[0]!);
    expect(mocks.replaceDraft).toHaveBeenLastCalledWith(
      "local\u0000/work/croki",
      expect.objectContaining({ edges: [] }),
    );
    props.onSelect("work-1");
    expect(mocks.selectNode).toHaveBeenLastCalledWith("local\u0000/work/croki", "work-1");
  });

  it("routes focused edits and cascading deletion", () => {
    controllerState.selectedNode = CONTEXT.nodes[1]!;
    renderCanvas();
    const props = mocks.nodeEditorProps as NodeEditorProps;

    props.onUpdate("work-1", { title: "Ship the review loop" });
    expect(mocks.updateNode).toHaveBeenCalledWith("work-1", {
      title: "Ship the review loop",
    });

    const reference = {
      kind: "file",
      path: "src/canvas.ts",
      line: 42,
    } as const;
    expect(props.onAddReference(reference)).toBeNull();
    expect(lastTransitionNode("work-1").references).toEqual([reference]);
    props.onRemoveReference(reference);
    expect(lastTransitionNode("work-1").references).toBeUndefined();

    props.onDelete("work-1");
    const transition = mocks.applyTransition.mock.calls.at(-1)?.[0] as {
      readonly context: CrokiContext;
    };
    expect(transition.context.nodes.map((node) => node.id)).toEqual(["intent-1"]);
    expect(transition.context.edges).toEqual([]);
    expect(mocks.selectNode).toHaveBeenLastCalledWith("local\u0000/work/croki", null);
  });

  it("forwards pending lifecycle ownership and exposes labeled landmarks", () => {
    const onPendingChange = vi.fn();
    const markup = renderCanvas(onPendingChange);

    expect(mocks.controllerProps).toEqual(expect.objectContaining({ onPendingChange }));
    expect(markup).toContain('aria-label="Croki Canvas"');
    expect(markup).toContain('aria-label="Canvas overview"');
    expect(markup).toContain("Unsaved");
  });

  it("forwards repository bootstrap and reference opening seams", () => {
    const onBuildFromRepository = vi.fn();
    renderToStaticMarkup(
      <CrokiCanvas
        environmentId={EnvironmentId.make("local")}
        productName="Croki"
        workspaceRoot="/work/croki"
        onBuildFromRepository={onBuildFromRepository}
      />,
    );
    expect(
      (mocks.overviewProps as { onBuildFromRepository?: () => void }).onBuildFromRepository,
    ).toBe(onBuildFromRepository);

    const onOpenReference = vi.fn();
    controllerState.selectedNode = CONTEXT.nodes[1]!;
    renderToStaticMarkup(
      <CrokiCanvas
        environmentId={EnvironmentId.make("local")}
        productName="Croki"
        workspaceRoot="/work/croki"
        onOpenReference={onOpenReference}
      />,
    );
    expect(
      (
        mocks.nodeEditorProps as {
          onOpenReference?: (reference: unknown) => void;
        }
      ).onOpenReference,
    ).toBe(onOpenReference);
  });
});

function renderCanvas(onPendingChange?: (pending: boolean) => void) {
  return renderToStaticMarkup(
    <CrokiCanvas
      environmentId={EnvironmentId.make("local")}
      productName="Croki"
      workspaceRoot="/work/croki"
      {...(onPendingChange ? { onPendingChange } : {})}
    />,
  );
}

function lastTransitionNode(id: string) {
  const transition = mocks.applyTransition.mock.calls.at(-1)?.[0] as {
    readonly context: CrokiContext;
  };
  const node = transition.context.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Missing transition node '${id}'.`);
  return node;
}

interface OverviewProps {
  readonly onAddNode: (kind: CrokiNodeKind) => void;
  readonly onAdopt: (id: string) => void;
  readonly onDeleteEdge: (edge: CrokiContextEdge) => void;
  readonly onReject: (id: string) => void;
  readonly onRetire: (id: string) => void;
  readonly onSelect: (id: string) => void;
}

interface NodeEditorProps {
  readonly onAddReference: (reference: CrokiContextReference) => string | null;
  readonly onDelete: (id: string) => void;
  readonly onRemoveReference: (reference: CrokiContextReference) => void;
  readonly onUpdate: (id: string, patch: Partial<Pick<CrokiContextNode, "title">>) => void;
}
