import { EnvironmentId } from "@croki/contracts";
import type {
  CrokiContext,
  CrokiContextNode,
  CrokiContextReference,
} from "@croki/shared/crokiContext";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  applyTransition: vi.fn(),
  controllerProps: null as unknown,
  nodeEditorProps: null as unknown,
  workspaceProps: null as unknown,
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
vi.mock("./CrokiCanvasWorkspace", () => ({
  CrokiCanvasWorkspace: (props: unknown) => {
    mocks.workspaceProps = props;
    return <div aria-label="Visual Canvas workspace" />;
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
  edges: [{ from: "work-1", to: "intent-1", relation: "enables" }],
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
    mocks.workspaceProps = null;
    controllerState.selectedNode = null;
  });

  it("keeps the decision field mounted while routing selection and retirement", () => {
    renderCanvas();
    const props = mocks.workspaceProps as WorkspaceProps;

    props.onSelect("work-1");
    expect(mocks.selectNode).toHaveBeenLastCalledWith("local\u0000/work/croki", "work-1");

    controllerState.selectedNode = CONTEXT.nodes[1]!;
    const markup = renderCanvas();
    expect(markup).toContain('aria-label="Visual Canvas workspace"');
    expect(markup).toContain('aria-label="Focused Canvas editor"');
    const editor = mocks.nodeEditorProps as NodeEditorProps;
    editor.onRetire("intent-1");
    expect(lastTransitionNode("intent-1").status).toBe("retired");
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

  it("completes founder judgment and makes relationships correctable", () => {
    controllerState.selectedNode = CONTEXT.nodes[1]!;
    renderCanvas();
    const editor = mocks.nodeEditorProps as NodeEditorProps;
    const workspace = mocks.workspaceProps as WorkspaceProps;

    editor.onAdopt("work-1");
    expect(lastTransitionNode("work-1").status).toBe("current");

    editor.onDecline("work-1");
    expect(lastTransitionNode("work-1").status).toBe("retired");
    expect(mocks.selectNode).toHaveBeenLastCalledWith("local\u0000/work/croki", null);

    const edge = CONTEXT.edges[0]!;
    expect(workspace.onConnect({ from: edge.from, to: edge.to })).toBeNull();
    expect(mocks.applyTransition.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ error: "duplicate-edge" }),
    );

    expect(
      workspace.onReplaceEdge(edge, {
        ...edge,
        from: "intent-1",
        to: "intent-1",
      }),
    ).toBeNull();
    const refused = mocks.applyTransition.mock.calls.at(-1)?.[0] as {
      readonly context: CrokiContext;
      readonly error: string | null;
    };
    expect(refused.context.edges).toEqual(CONTEXT.edges);
    expect(refused.error).toBe("self-edge");

    expect(
      workspace.onReplaceEdge(edge, {
        ...edge,
        relation: "guides",
        from: "intent-1",
        to: "work-1",
      }),
    ).toEqual({ ...edge, relation: "guides", from: "intent-1", to: "work-1" });
    const replaced = mocks.applyTransition.mock.calls.at(-1)?.[0] as {
      readonly context: CrokiContext;
    };
    expect(replaced.context.edges).toEqual([
      { from: "intent-1", to: "work-1", relation: "guides" },
    ]);

    workspace.onDisconnect(edge);
    const disconnected = mocks.applyTransition.mock.calls.at(-1)?.[0] as {
      readonly context: CrokiContext;
    };
    expect(disconnected.context.edges).toEqual([]);
  });

  it("forwards pending lifecycle ownership and exposes labeled landmarks", () => {
    const onPendingChange = vi.fn();
    const markup = renderCanvas(onPendingChange);

    expect(mocks.controllerProps).toEqual(expect.objectContaining({ onPendingChange }));
    expect(markup).toContain('aria-label="Croki Canvas"');
    expect(markup).toContain('aria-label="Visual Canvas workspace"');
    expect(markup).toContain("Save Canvas");
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
      (mocks.workspaceProps as { onBuildFromRepository?: () => void }).onBuildFromRepository,
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

interface WorkspaceProps {
  readonly onConnect: (edge: {
    readonly from: string;
    readonly to: string;
  }) => CrokiContext["edges"][number] | null;
  readonly onDisconnect: (edge: CrokiContext["edges"][number]) => void;
  readonly onReplaceEdge: (
    previous: CrokiContext["edges"][number],
    next: CrokiContext["edges"][number],
  ) => CrokiContext["edges"][number] | null;
  readonly onSelect: (id: string) => void;
}

interface NodeEditorProps {
  readonly onAdopt: (id: string) => void;
  readonly onAddReference: (reference: CrokiContextReference) => string | null;
  readonly onDecline: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onRemoveReference: (reference: CrokiContextReference) => void;
  readonly onRetire: (id: string) => void;
  readonly onUpdate: (id: string, patch: Partial<Pick<CrokiContextNode, "title">>) => void;
}
