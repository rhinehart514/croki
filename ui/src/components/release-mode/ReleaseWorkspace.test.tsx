import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReleaseDetail, ReleaseIndex, SystemIndexObject, WorkIndexItem } from "@/api";
import { ReleaseWorkspace } from "./ReleaseWorkspace";

const release: ReleaseDetail = { id: "launch", releaseRef: "object:launch", name: "Launch", statement: "Move setup to market.", lifecycle: "draft", attention: [], updatedAt: null, createdAt: null, endedAt: null, endedBy: null, relatedObjectRefs: ["object:product"], threadRefs: ["thread:work"], runRefs: [], decisions: [], outcomes: [], relationships: [{ id: "link", relationshipRef: "relationship:link", compatibilityOwned: false, fromRef: "object:launch", toRef: "object:product", label: "Product delta", type: "release-link", assertion: "founder-asserted", sourceRefs: [] }], externalRefs: {}, revision: 3 };
const index: ReleaseIndex = { ventureId: "v1", revision: 3, releases: [release], unassignedActions: [], counts: { needsYou: 0, drafts: 1, inMarket: 0, ended: 0 } };
const object: SystemIndexObject = { id: "product", objectRef: "object:product", name: "Faster setup", statement: "", type: "open", territory: "product", assertion: "founder-asserted", provenance: null, properties: {}, compatibilityOwned: false, architectureRole: null, threadRefs: [], attention: [], createdAt: null, updatedAt: null };
const customer: SystemIndexObject = { ...object, id: "customer", objectRef: "object:customer", name: "Customers finish setup unaided" };
const thread = { threadRef: "thread:work", founderIntent: "Prepare exact launch work" } as WorkIndexItem;
const base = { index, objects: [object, customer], threads: [thread], readOnlyReason: null, onCreate: vi.fn(async () => {}), onMutate: vi.fn(async () => {}), onChanged: vi.fn(), onSelectRelease: vi.fn(), onStartRelease: vi.fn() };

describe("ReleaseWorkspace", () => {
  it("keeps a contextual release unsaved and asks the founder to confirm the inferred link", () => {
    const onCreate = vi.fn(async () => {});
    render(<ReleaseWorkspace {...base} release={null} draftContext={{ kind: "object", ref: object.objectRef, label: object.name, suggestedRole: "Product delta" }} onCreate={onCreate} />);
    expect(screen.getByText("Unsaved draft")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Product delta")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("What is moving to market?"), { target: { value: "Setup launch" } });
    fireEvent.click(screen.getByRole("button", { name: "Save release" }));
    expect(onCreate).toHaveBeenCalledWith({ name: "Setup launch", statement: "", linkLabel: "Product delta" });
  });

  it("renders one honest path, preserves exact joins, and removes the old subnavigation", () => {
    const onMutate = vi.fn(async () => {});
    render(<ReleaseWorkspace {...base} release={release} draftContext={null} onMutate={onMutate} />);
    expect(screen.getByRole("heading", { name: "From product change to returned reality" })).toBeInTheDocument();
    for (const label of ["Product delta", "Customer consequence", "Distribution", "Outward action", "Evidence"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText("Faster setup")).toBeInTheDocument();
    expect(screen.getByText("Prepare exact launch work")).toBeInTheDocument();
    expect(screen.getAllByText("Open")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Remove Faster setup" }));
    expect(onMutate).toHaveBeenCalledWith([{ op: "unlink-object", relationshipRef: "relationship:link" }]);
    expect(screen.queryByRole("navigation", { name: "Release views" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open chat" })).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("selects releases in the surface and opens a link control from the relevant path step", () => {
    const onSelectRelease = vi.fn();
    render(<ReleaseWorkspace {...base} release={release} draftContext={null} onSelectRelease={onSelectRelease} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Release" }), { target: { value: "launch" } });
    expect(onSelectRelease).toHaveBeenCalledWith("launch");
    const customerStep = screen.getByText("Customer consequence").closest("article");
    expect(customerStep).not.toBeNull();
    fireEvent.click(within(customerStep!).getByRole("button", { name: "Link" }));
    expect(screen.getByRole("region", { name: "Link customer consequence" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Customers finish setup unaided" })).toBeInTheDocument();
  });
});
