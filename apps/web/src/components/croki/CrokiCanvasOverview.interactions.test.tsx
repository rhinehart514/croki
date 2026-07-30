import type { CrokiContext, CrokiNodeKind } from "@t3tools/shared/crokiContext";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const buttons = vi.hoisted(
  () =>
    [] as Array<{
      readonly "aria-label"?: string;
      readonly children?: unknown;
      readonly disabled?: boolean;
      readonly onClick?: () => void;
    }>,
);

vi.mock("../ui/button", () => ({
  Button: (props: {
    readonly "aria-label"?: string;
    readonly children?: unknown;
    readonly disabled?: boolean;
    readonly onClick?: () => void;
  }) => {
    buttons.push(props);
    return (
      <button aria-label={props["aria-label"]} disabled={props.disabled}>
        {props.children as never}
      </button>
    );
  },
}));

import { CrokiCanvasOverview } from "./CrokiCanvasOverview";

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

describe("CrokiCanvasOverview interactions", () => {
  beforeEach(() => {
    buttons.length = 0;
  });

  it("routes add, adopt, retire, and relationship actions", () => {
    const onAddNode = vi.fn<(kind: CrokiNodeKind) => void>();
    const onAdopt = vi.fn();
    const onReject = vi.fn();
    const onRetire = vi.fn();
    const onDeleteEdge = vi.fn();
    const onAddEdge = vi.fn();
    renderToStaticMarkup(
      <CrokiCanvasOverview
        context={CONTEXT}
        edgeFrom="work-1"
        edgeRelation="advances"
        edgeTo="intent-1"
        onAddEdge={onAddEdge}
        onAddNode={onAddNode}
        onAdopt={onAdopt}
        onDeleteEdge={onDeleteEdge}
        onEdgeFromChange={vi.fn()}
        onEdgeRelationChange={vi.fn()}
        onEdgeToChange={vi.fn()}
        onReject={onReject}
        onRetire={onRetire}
        onSelect={vi.fn()}
      />,
    );

    findButton("Add intent").onClick?.();
    findButton("Adopt Add the review loop").onClick?.();
    findButton("Reject Add the review loop").onClick?.();
    findButton("Retire Keep product truth near the work").onClick?.();
    findButton("Delete relationship").onClick?.();
    findButton("Add relationship").onClick?.();

    expect(onAddNode).toHaveBeenCalledWith("intent");
    expect(onAdopt).toHaveBeenCalledWith("work-1");
    expect(onReject).toHaveBeenCalledWith("work-1");
    expect(onRetire).toHaveBeenCalledWith("intent-1");
    expect(onDeleteEdge).toHaveBeenCalledWith(CONTEXT.edges[0]);
    expect(onAddEdge).toHaveBeenCalledOnce();
  });

  it("uses keyboard-native controls and labeled navigation sections", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasOverview
        context={CONTEXT}
        edgeFrom=""
        edgeRelation="supports"
        edgeTo=""
        onAddEdge={vi.fn()}
        onAddNode={vi.fn()}
        onAdopt={vi.fn()}
        onDeleteEdge={vi.fn()}
        onEdgeFromChange={vi.fn()}
        onEdgeRelationChange={vi.fn()}
        onEdgeToChange={vi.fn()}
        onReject={vi.fn()}
        onRetire={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain('<section aria-label="Founder-approved canon">');
    expect(markup).toContain('<section aria-label="Provisional review queue">');
    expect(markup).toContain('<section aria-label="Relationships">');
    expect(markup).toContain('aria-label="Edit Add the review loop"');
    expect(markup).toContain('aria-label="Relationship source"');
    expect(markup).toContain('aria-label="Relationship target"');
    expect(findButton("Add relationship").disabled).toBe(true);
  });

  it("starts an empty Canvas through the native provisional bootstrap", () => {
    const onBuildFromRepository = vi.fn();
    const markup = renderToStaticMarkup(
      <CrokiCanvasOverview
        context={{ ...CONTEXT, nodes: [], edges: [] }}
        edgeFrom=""
        edgeRelation="supports"
        edgeTo=""
        onAddEdge={vi.fn()}
        onAddNode={vi.fn()}
        onAdopt={vi.fn()}
        onBuildFromRepository={onBuildFromRepository}
        onDeleteEdge={vi.fn()}
        onEdgeFromChange={vi.fn()}
        onEdgeRelationChange={vi.fn()}
        onEdgeToChange={vi.fn()}
        onReject={vi.fn()}
        onRetire={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain("Generated items arrive as provisional suggestions");
    findButtonText("Build from repository").onClick?.();
    expect(onBuildFromRepository).toHaveBeenCalledOnce();
  });
});

function findButton(label: string) {
  const props = buttons.find((candidate) => candidate["aria-label"] === label);
  if (!props) throw new Error(`Could not find button '${label}'.`);
  return props;
}

function findButtonText(label: string) {
  const props = buttons.find((candidate) => buttonText(candidate.children) === label);
  if (!props) throw new Error(`Could not find button text '${label}'.`);
  return props;
}

function buttonText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map(buttonText).join("");
}
