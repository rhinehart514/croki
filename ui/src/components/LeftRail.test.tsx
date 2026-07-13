import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { STEP_DRAG_MIME } from "@/lib/objectPalette";
import { LeftRail } from "./LeftRail";

function activateWithKeyboard(button: HTMLElement, key: "Enter" | " ") {
  button.focus();
  const shouldRunDefault = fireEvent.keyDown(button, { key });
  if (shouldRunDefault) fireEvent.click(button);
  fireEvent.keyUp(button, { key });
}

function dragPayload(button: HTMLElement) {
  let serialized = "";
  const dataTransfer = {
    effectAllowed: "none",
    setData: vi.fn((type: string, value: string) => {
      if (type === STEP_DRAG_MIME) serialized = value;
    }),
  };
  fireEvent.dragStart(button, { dataTransfer });
  return JSON.parse(serialized);
}

vi.mock("@/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api")>();
  return { ...original, getCapabilityInventory: vi.fn().mockResolvedValue(null) };
});

describe("LeftRail unified workspace", () => {
  it("rests collapsed as a summonable edge, then expands to progressively disclose its views", () => {
    render(
      <LeftRail
        channels={[{ id: "pipeline-1", name: "Design partners", objective: "Find the first ten", nodeCount: 1 } as never]}
        activeChannelId={null}
        bench={[]}
        onLoadChannel={vi.fn()}
        onOpenAgent={vi.fn()}
        productContext={<div>Observed product truth</div>}
      />,
    );

    // Pure-canvas home: the rail rests as one summon affordance, not a standing sidebar — its views
    // (and the Product tab) are absent until the founder opens it.
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
    expect(screen.queryByRole("tab", { name: "Product" })).toBeNull();
    fireEvent.click(screen.getByTitle("Expand your workspace"));
    expect(screen.getByRole("tab", { name: "Product", selected: true })).toBeTruthy();
    expect(screen.getByText("Observed product truth")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Build" }));
    expect(screen.queryByText("Observed product truth")).toBeNull();
    expect(screen.getByText("Your crew")).toBeTruthy();
    expect(screen.getByText("Design partners")).toBeTruthy();
  });

  it("adds a teammate with the keyboard using the same payload as drag", () => {
    const onAddStep = vi.fn();
    render(
      <LeftRail
        channels={[{ id: "pipeline-1", name: "Design partners", objective: "Find the first ten", nodeCount: 1 } as never]}
        activeChannelId="pipeline-1"
        bench={[{
          ref: "prospect-researcher",
          name: "Researcher",
          job: "Finds prospects worth reaching now.",
          hasRuns: false,
          runCount: 0,
          counts: { approved: 0 },
        } as never]}
        onLoadChannel={vi.fn()}
        onOpenAgent={vi.fn()}
        onAddStep={onAddStep}
      />,
    );
    fireEvent.click(screen.getByTitle("Expand your workspace"));
    const dragged = dragPayload(screen.getByTitle("Researcher — Finds prospects worth reaching now."));
    activateWithKeyboard(screen.getByRole("button", { name: "Add Researcher to selected pipeline" }), "Enter");

    expect(onAddStep).toHaveBeenCalledTimes(1);
    expect(onAddStep).toHaveBeenCalledWith(dragged);
  });

  it("adds a capability with the keyboard using the same payload as drag", () => {
    const onAddStep = vi.fn();
    render(
      <LeftRail
        channels={[{ id: "pipeline-1", name: "Design partners", objective: "Find the first ten", nodeCount: 1 } as never]}
        activeChannelId="pipeline-1"
        bench={[]}
        onLoadChannel={vi.fn()}
        onOpenAgent={vi.fn()}
        onAddStep={onAddStep}
      />,
    );
    fireEvent.click(screen.getByTitle("Expand your workspace"));
    const dragged = dragPayload(screen.getByTitle("Connect Exa to give your crew this capability"));
    activateWithKeyboard(screen.getByRole("button", { name: "Add Exa to selected pipeline" }), " ");

    expect(onAddStep).toHaveBeenCalledTimes(1);
    expect(onAddStep).toHaveBeenCalledWith(dragged);
  });

  it("disables placement until a pipeline and placement callback are available", () => {
    render(
      <LeftRail
        channels={[]}
        activeChannelId={null}
        bench={[{ ref: "prospect-researcher", name: "Researcher", hasRuns: false } as never]}
        onLoadChannel={vi.fn()}
        onOpenAgent={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTitle("Expand your workspace"));
    expect(screen.getByText("Select a pipeline before adding a teammate or capability.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select a pipeline before adding Researcher" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Select a pipeline before adding Exa" })).toHaveProperty("disabled", true);
  });

  it("keeps placement disabled when the selected pipeline has no placement callback", () => {
    render(
      <LeftRail
        channels={[{ id: "pipeline-1", name: "Design partners", objective: "Find the first ten", nodeCount: 1 } as never]}
        activeChannelId="pipeline-1"
        bench={[{ ref: "prospect-researcher", name: "Researcher", hasRuns: false } as never]}
        onLoadChannel={vi.fn()}
        onOpenAgent={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTitle("Expand your workspace"));
    expect(screen.getByText("This pipeline cannot receive palette items here yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Adding Researcher is unavailable" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Adding Exa is unavailable" })).toHaveProperty("disabled", true);
  });
});
