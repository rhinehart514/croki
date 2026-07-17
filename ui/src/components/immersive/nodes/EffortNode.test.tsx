import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

// Phase 4 acceptance (architecture §4): each zoom band renders the expected archetype subtree. The band
// is derived by useSemanticZoom from the live React Flow transform; here we drive that transform through
// a mocked useStore so the pure quantizer decides the band, and assert the archetype exposes the right
// data-band (the CSS then reveals/hides body/foot/detail lines — verified structurally by the attribute
// the LOD selectors key off, so the three bands are genuinely distinct, not one card at three sizes).
let zoom = 1.0;
vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom" },
  useStore: (selector: (state: { transform: [number, number, number] }) => unknown) =>
    selector({ transform: [0, 0, zoom] }),
}));

import { EffortNode } from "./EffortNode";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

function makeData(): AtlasNode["data"] {
  return {
    kind: "bet",
    title: "First outreach to 20 shops",
    effortKicker: "A way to reach them",
    statement: "A short note that opens with what they'd recognize, not a pitch.",
    stateLabel: "Drafting",
    effortTone: "underway",
    draftCount: 3,
    continuation: "last touched 2m ago · 3 attempts",
    teammates: [{ ref: "yara", name: "Yara" }],
    pressure: [],
    altitude: "architecture",
    focusRole: "context",
    selected: false,
    readOnly: false,
    onSelect: vi.fn(),
    onFocus: vi.fn(),
    onPromote: vi.fn(),
    onActivateMotion: vi.fn(),
    onBeginConnection: vi.fn(),
    onOpenWall: vi.fn(),
    onRevealMachinery: vi.fn(),
  } as unknown as AtlasNode["data"];
}

function renderAt(bandZoom: number) {
  zoom = bandZoom;
  const props = { id: "bet:b1", data: makeData() } as unknown as ComponentProps<typeof EffortNode>;
  const { container } = render(<EffortNode {...props} />);
  return container.querySelector(".iw-node") as HTMLElement;
}

afterEach(() => { cleanup(); zoom = 1.0; });

describe("EffortNode semantic-zoom bands", () => {
  it("renders the title in every band", () => {
    for (const z of [0.4, 0.9, 1.4]) {
      renderAt(z);
      expect(screen.getByText("First outreach to 20 shops")).toBeInTheDocument();
      cleanup();
    }
  });

  it("marks the glyph band far out", () => {
    expect(renderAt(0.4).dataset.band).toBe("glyph");
  });

  it("marks the card band at mid zoom and renders the resting anatomy (body, drafts, footer)", () => {
    const node = renderAt(0.9);
    expect(node.dataset.band).toBe("card");
    expect(node.querySelector(".iw-body")).not.toBeNull();
    expect(node.querySelector(".iw-drafts")).not.toBeNull();
    expect(node.querySelector(".iw-foot")).not.toBeNull();
  });

  it("marks the detail band near, exposing the detail-only continuation line", () => {
    const node = renderAt(1.4);
    expect(node.dataset.band).toBe("detail");
    const continuation = node.querySelector(".iw-detail-only");
    expect(continuation).not.toBeNull();
    expect(continuation?.textContent).toContain("last touched");
  });

  it("carries the needs-your-hand tone only through the data-tone seam (amber rationing)", () => {
    zoom = 0.9;
    const data = makeData();
    (data as { effortTone: string }).effortTone = "needs";
    const props = { id: "bet:b2", data } as unknown as ComponentProps<typeof EffortNode>;
    const { container } = render(<EffortNode {...props} />);
    expect(container.querySelector(".iw-card")?.getAttribute("data-tone")).toBe("needs");
  });
});
