import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemIndex, WorkIndex, WorkIndexItem } from "@/api";
import { SystemWorkspace } from "./SystemWorkspace";

const work = {
  threadRef: "thread:offer", ventureRef: "venture:v", parentThreadRef: null, originMessageRef: null,
  subjectRefs: ["object:offer"], focusRef: "object:offer", founderIntent: "Sharpen the offer", lifecycle: "open",
  activity: "running", attention: "none", terminal: null, unread: false, reviewedThrough: null,
  latestMeaningfulEvent: { kind: "running", ref: "run:one", at: null, summary: "Working" }, runRefs: ["run:one"],
  pinnedAt: null, participantRefs: ["codex"], activeParticipantRefs: ["codex"], createdAt: null, updatedAt: "2026-07-19T12:00:00.000Z",
} satisfies WorkIndexItem;

const index = {
  ventureId: "v", revision: 2, architectureRevision: 1, scope: "system",
  objects: [{
    id: "offer", objectRef: "object:offer", name: "Setup offer", statement: "Lead with speed.", type: "offer", territory: "gtm",
    assertion: "founder-asserted", provenance: null, properties: {}, compatibilityOwned: false, architectureRole: null,
    threadRefs: ["thread:offer"], attention: [{ kind: "traceability", reason: "Distribution path is missing" }], createdAt: null, updatedAt: null,
  }],
  relationships: [], counts: { total: 1, product: 0, gtm: 1, attention: 1, matchCount: 1 },
} satisfies SystemIndex;

const workIndex = {
  ventureId: "v", revision: 3, items: [work], counts: { total: 1, attention: 0, active: 1, unread: 0, matchCount: 1 }, legacy: { unindexedRunCount: 0 },
} satisfies WorkIndex;

vi.mock("@/components/maps/VentureMaps", () => ({
  VentureMaps: ({ workByObject, onSelectionChange, inspectorActions }: {
    workByObject: Map<string, { state: string }>;
    onSelectionChange: (id: string | null) => void;
    inspectorActions: ReactNode;
  }) => <section aria-label="Mock system map"><span>{workByObject.get("offer")?.state}</span><button type="button" onClick={() => onSelectionChange("offer")}>Select offer</button>{inspectorActions}</section>,
}));

const base = {
  index, workIndex, scope: "system" as const, selectedRef: "object:offer", directions: [], camera: null, readOnlyReason: null,
  onScope: vi.fn(), onSelect: vi.fn(), onAgentContextChange: vi.fn(), onCameraChange: vi.fn(), onMutate: vi.fn(async () => undefined),
  onMutateArchitecture: vi.fn(async () => undefined), onOpenWork: vi.fn(),
};

describe("SystemWorkspace", () => {
  beforeEach(() => Object.values(base).forEach((value) => { if (typeof value === "function" && "mockClear" in value) value.mockClear(); }));

  it("keeps scope in the canvas header and exposes the selected node to the agent", () => {
    render(<SystemWorkspace {...base} />);
    expect(screen.getByText("working")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GTM" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    expect(base.onScope).toHaveBeenCalledWith("product");
    fireEvent.click(screen.getByRole("button", { name: "Select offer" }));
    expect(base.onAgentContextChange).toHaveBeenCalledWith(expect.objectContaining({ objectRef: "object:offer", subjectRefs: ["object:offer"], threadRef: "thread:offer", state: "working" }));
    fireEvent.click(screen.getByRole("button", { name: "Open thread" }));
    expect(base.onOpenWork).toHaveBeenCalledWith("thread:offer");
  });

  it("selects nodes without changing mode and renders honest attention", () => {
    const { rerender } = render(<SystemWorkspace {...base} selectedRef={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Select offer" }));
    expect(base.onSelect).toHaveBeenCalledWith(index.objects[0], "thread:offer");
    rerender(<SystemWorkspace {...base} scope="attention" selectedRef={null} />);
    expect(screen.getByText("Distribution path is missing")).toBeInTheDocument();
    expect(screen.getByText("Working")).toBeInTheDocument();
  });
});
