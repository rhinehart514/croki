import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReleaseDetail, ReleaseIndex, SystemIndexObject, WorkIndexItem } from "@/api";
import { ReleaseWorkspace } from "./ReleaseWorkspace";

const release: ReleaseDetail = { id: "launch", releaseRef: "object:launch", name: "Launch", statement: "Move setup to market.", lifecycle: "draft", attention: [], updatedAt: null, createdAt: null, endedAt: null, endedBy: null, relatedObjectRefs: ["object:product"], threadRefs: ["thread:work"], runRefs: [], decisions: [], outcomes: [], relationships: [{ id: "link", relationshipRef: "relationship:link", compatibilityOwned: false, fromRef: "object:launch", toRef: "object:product", label: "Product delta", type: "release-link", assertion: "founder-asserted", sourceRefs: [] }], externalRefs: {}, revision: 3 };
const index: ReleaseIndex = { ventureId: "v1", revision: 3, releases: [release], unassignedActions: [], counts: { needsYou: 0, drafts: 1, inMarket: 0, ended: 0 } };
const object: SystemIndexObject = { id: "product", objectRef: "object:product", name: "Faster setup", statement: "", type: "open", territory: "product", assertion: "founder-asserted", provenance: null, properties: {}, compatibilityOwned: false, architectureRole: null, threadRefs: [], attention: [], createdAt: null, updatedAt: null };
const thread = { threadRef: "thread:work", founderIntent: "Prepare exact launch work" } as WorkIndexItem;
const base = { index, objects: [object], threads: [thread], readOnlyReason: null, onSubview: vi.fn(), onOpenChat: vi.fn(), onCreate: vi.fn(async () => {}), onMutate: vi.fn(async () => {}), onChanged: vi.fn() };

describe("ReleaseWorkspace", () => {
  it("keeps a contextual release unsaved and asks the founder to confirm the inferred link", () => {
    const onCreate = vi.fn(async () => {});
    render(<ReleaseWorkspace {...base} release={null} subview="overview" draftContext={{ kind: "object", ref: object.objectRef, label: object.name, suggestedRole: "Product delta" }} onCreate={onCreate} />);
    expect(screen.getByText("Unsaved draft")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Product delta")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("What is moving to market?"), { target: { value: "Setup launch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save release" }));
    expect(onCreate).toHaveBeenCalledWith({ name: "Setup launch", statement: "", linkLabel: "Product delta" });
  });

  it("edits canonical links and never presents percentage readiness", () => {
    const onMutate = vi.fn(async () => {});
    render(<ReleaseWorkspace {...base} release={release} subview="build" draftContext={null} onMutate={onMutate} />);
    expect(screen.getByText("Faster setup")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove link" })[0]);
    expect(onMutate).toHaveBeenCalledWith([{ op: "unlink-object", relationshipRef: "relationship:link" }]);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
