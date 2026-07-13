import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ reviseGoal: vi.fn(), reviseWorkArtifact: vi.fn(), getGoal: vi.fn(), getWorkArtifact: vi.fn() }));
vi.mock("@/api", () => api);
vi.mock("@/lib/identity", () => ({ getIdentity: () => ({ userId: "founder", name: "Founder" }) }));

vi.mock("@xyflow/react", () => ({
  Handle: () => <span aria-hidden="true" />,
  NodeResizer: ({ onResizeEnd }: { onResizeEnd?: (event: unknown, value: { width: number; height: number }) => void }) => (
    <button type="button" onClick={() => onResizeEnd?.({}, { width: 800, height: 520 })}>Resize region</button>
  ),
  Position: { Left: "left", Right: "right" },
}));

import { CanvasAnchor, CanvasRegion, KindCluster, ObjectChip } from "@/components/canvas/wovenNodes";

describe("woven canvas keyboard navigation", () => {
  it("makes shared objects and kind clusters keyboard-activatable", () => {
    const onActivate = vi.fn();
    render(
      <div onClick={onActivate}>
        <ObjectChip {...({ data: {
          objectKey: "customer:1", kind: "customer", label: "Acme",
          bucket: "seen", lanes: ["a", "b"], degree: 2,
          provenance: { kind: "grounded", basis: "two pipeline touches" },
        } } as never)} />
        <KindCluster {...({ data: { label: "Research", count: 3, totalDegree: 5 } } as never)} />
      </div>,
    );

    const object = screen.getByRole("button", { name: /customer: Acme/i });
    const cluster = screen.getByRole("button", { name: /Research: 3 objects/i });
    fireEvent.keyDown(object, { key: "Enter" });
    fireEvent.keyDown(cluster, { key: " " });
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("makes collapsed canvas groups keyboard-activatable", () => {
    const onActivate = vi.fn();
    render(
      <div onClick={onActivate}>
        <CanvasAnchor {...({ data: {
          anchorId: "canchor:group:product-state",
          ref: { type: "group", id: "product-state" },
          kind: "product-state", label: "States", count: 12, group: true,
        } } as never)} />
      </div>,
    );
    const group = screen.getByRole("button", { name: /States: 12 product details/i });
    fireEvent.keyDown(group, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("renders an honest, keyboard-expandable remainder summary for repeated canvas objects", () => {
    const onActivate = vi.fn();
    render(
      <div onClick={onActivate}>
        <CanvasAnchor {...({ data: {
          anchorId: "canchor:group:outcome",
          ref: { type: "group", id: "outcome" },
          kind: "outcome", label: "Outcomes", count: 5, group: true, groupType: "overflow",
        } } as never)} />
      </div>,
    );

    const summary = screen.getByRole("button", { name: "5 more outcomes. Show all." });
    expect(summary).toHaveTextContent("5 more outcomes");
    fireEvent.keyDown(summary, { key: " " });
    expect(onActivate).toHaveBeenCalledOnce();
  });

  it("names shared-goal attention honestly without presenting it as a blocker", () => {
    render(<CanvasAnchor {...({ data: {
      anchorId: "canchor:work-artifact:shared",
      ref: { type: "work-artifact", id: "shared" },
      kind: "document", label: "Onboarding change",
      conflict: {
        count: 1,
        goalCount: 2,
        label: "2 active goals share work-artifact shared",
        detail: "Two goals touch this object. Shared context is not proof that their changes are incompatible.",
      },
    } } as never)} />);

    expect(screen.getByText("Shared by 2 active goals")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Advisory; work is not blocked/i })).toBeInTheDocument();
  });

  it("offers the same anchor connection gesture from the keyboard", () => {
    const connect = vi.fn();
    render(<CanvasAnchor {...({ data: {
      anchorId: "canchor:goal:g-1",
      ref: { type: "goal", id: "g-1" },
      kind: "goal", label: "Improve activation",
      connection: { active: false, source: false },
      onKeyboardConnect: connect,
    } } as never)} />);

    const goal = screen.getByRole("button", { name: /Press C to connect/i });
    fireEvent.keyDown(goal, { key: "c" });
    expect(connect).toHaveBeenCalledOnce();
    expect(screen.getByText("C connect")).toBeInTheDocument();
  });

  it("expands selected goal work in canvas space and saves a direct revision", async () => {
    api.reviseGoal.mockResolvedValue({});
    api.getGoal.mockResolvedValue({ goal: { projectId: "p1", id: "g-1", revision: 3, statement: "Improve activation", desiredChange: "More founders finish setup", updatedAt: "now" } });
    const changed = vi.fn();
    render(<CanvasAnchor {...({ selected: true, data: {
      anchorId: "canchor:goal:g-1",
      ref: { type: "goal", id: "g-1" },
      kind: "goal", label: "Improve activation",
      body: { projectId: "p1", revision: 3, statement: "Improve activation", desiredChange: "More founders finish setup", updatedAt: "now" },
      onAuthorityChanged: changed,
    } } as never)} />);

    expect(screen.getByRole("group", { name: /Goal: Improve activation/i })).toBeInTheDocument();
    expect(screen.getByText("More founders finish setup")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit here" }));
    fireEvent.change(screen.getByLabelText("Goal"), { target: { value: "Fix first-session activation" } });
    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));
    await vi.waitFor(() => expect(api.reviseGoal).toHaveBeenCalledWith("p1", "g-1", expect.objectContaining({
      expectedRevision: 3, statement: "Fix first-session activation",
    })));
    expect(changed).toHaveBeenCalled();
  });

  it("renders an isolated product change and its runtime receipt directly on the selected canvas node", () => {
    render(<CanvasAnchor {...({ selected: true, data: {
      anchorId: "canchor:product-change:change-1",
      ref: { type: "product-change", id: "change-1" },
      kind: "code-change", label: "Improve activation copy",
      body: { status: "ready-for-review", provider: "codex", model: "gpt-5.5-codex", diff: "--- a/app.ts\n+++ b/app.ts\n-old\n+new" },
    } } as never)} />);

    expect(screen.getByText(/ready-for-review · codex · gpt-5.5-codex/)).toBeInTheDocument();
    expect(screen.getByLabelText("Code changes")).toHaveTextContent("+new");
    expect(screen.queryByRole("button", { name: "Edit here" })).toBeNull();
  });

  it("exposes region collapse, resize, and archive as local canvas gestures", () => {
    const collapse = vi.fn();
    const resize = vi.fn();
    const archive = vi.fn();
    render(<CanvasRegion {...({ selected: true, data: {
      regionId: "activation", ref: { type: "work-region", id: "activation" }, title: "Fix activation",
      purpose: "Understand and improve first value", memberCount: 4, size: { width: 640, height: 420 },
      collapsed: false, revision: 2, onToggleCollapsed: collapse, onResizeEnd: resize, onArchive: archive,
    } } as never)} />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse Fix activation" }));
    fireEvent.click(screen.getByRole("button", { name: "Resize region" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(collapse).toHaveBeenCalledOnce();
    expect(resize).toHaveBeenCalledWith({ width: 800, height: 520 });
    expect(archive).toHaveBeenCalledOnce();
    expect(screen.getByText("4 items")).toBeInTheDocument();
  });
});
