import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SystemIndexObject } from "@/api";
import { SystemObjectEditor } from "./SystemEditPanel";

const object: SystemIndexObject = { id: "offer", objectRef: "object:offer", name: "Setup offer", statement: "Lead with speed.", type: "open", territory: "gtm", assertion: "founder-asserted", provenance: null, properties: { territory: "gtm" }, compatibilityOwned: false, architectureRole: null, threadRefs: [], attention: [], createdAt: null, updatedAt: null };

describe("SystemObjectEditor", () => {
  it("saves open semantic objects through the system mutation adapter", () => {
    const onSystemMutate = vi.fn(async () => {});
    render(<SystemObjectEditor object={object} readOnlyReason={null} onClose={vi.fn()} onSystemMutate={onSystemMutate} onArchitectureMutate={vi.fn(async () => {})} />);
    fireEvent.change(screen.getByLabelText("Statement"), { target: { value: "Promise time to value." } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSystemMutate).toHaveBeenCalledWith([{ op: "update-object", objectRef: "object:offer", name: "Setup offer", statement: "Promise time to value.", territory: "gtm" }]);
  });

  it("keeps compatibility-owned records on the architecture adapter", () => {
    const onArchitectureMutate = vi.fn(async () => {});
    render(<SystemObjectEditor object={{ ...object, compatibilityOwned: true, architectureRole: "offer" }} readOnlyReason={null} onClose={vi.fn()} onSystemMutate={vi.fn(async () => {})} onArchitectureMutate={onArchitectureMutate} />);
    expect(screen.getByRole("combobox", { name: /Territory/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onArchitectureMutate).toHaveBeenCalledWith([{ op: "update-element", elementId: "offer", value: { name: "Setup offer", statement: "Lead with speed." } }], "Update Setup offer from Product / GTM");
  });
});
