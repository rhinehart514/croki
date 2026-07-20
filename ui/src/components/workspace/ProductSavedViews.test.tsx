import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductSavedViews } from "./ProductSavedViews";

const view = { id: "view-one", kind: "live" as const, name: "Project intake", arrangement: "product", createdAt: "2026-07-20T12:00:00.000Z" };

describe("ProductSavedViews", () => {
  it("saves, reopens, and deliberately deletes a reachable view", async () => {
    const onSave = vi.fn(async () => undefined);
    const onReopen = vi.fn(async () => "View reopened from current venture truth.");
    const onDelete = vi.fn(async () => undefined);
    render(<ProductSavedViews views={[view]} canSave disabledReason={null} loadError={null} onSave={onSave} onReopen={onReopen} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Save current view" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Reopen Project intake" }));
    await waitFor(() => expect(onReopen).toHaveBeenCalledWith(view));
    fireEvent.click(screen.getByRole("button", { name: "Delete Project intake" }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Project intake" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(view));
  });

  it("explains why saving and deletion are unavailable", () => {
    render(<ProductSavedViews views={[view]} canSave={false} disabledReason="Offline. Venture truth is read-only." loadError={null} onSave={vi.fn()} onReopen={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save current view" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Project intake" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reopen Project intake" })).toBeEnabled();
  });
});
