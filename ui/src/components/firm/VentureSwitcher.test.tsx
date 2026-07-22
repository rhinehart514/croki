import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmVenture } from "@/api";
import { VentureSwitcher } from "./VentureSwitcher";

const venture = (id: string, updatedAt: string): FirmVenture => ({
  id,
  name: `Venture ${id.toUpperCase()}`,
  repository: `/work/repos/repository-${id}`,
  createdAt: "2026-07-01T12:00:00.000Z",
  updatedAt,
});

describe("Venture switcher", () => {
  it("searches a large portfolio by venture or repository and preserves current context", () => {
    const ventures = [
      venture("a", "2026-07-01T12:00:00.000Z"),
      venture("b", "2026-07-06T12:00:00.000Z"),
      venture("c", "2026-07-05T12:00:00.000Z"),
      venture("d", "2026-07-04T12:00:00.000Z"),
      venture("e", "2026-07-03T12:00:00.000Z"),
      venture("f", "2026-07-02T12:00:00.000Z"),
    ];
    const onSwitch = vi.fn();
    const { container } = render(<VentureSwitcher venture={ventures[0]} ventures={ventures} onSwitch={onSwitch} onCreate={vi.fn()} />);

    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByRole("button", { name: /Venture Arepository-aCurrent/ })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Find a venture" }), { target: { value: "repository-e" } });
    expect(screen.queryByRole("button", { name: /Venture A/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Venture Erepository-e/ }));

    expect(onSwitch).toHaveBeenCalledWith(ventures[4]);
    expect(details.open).toBe(false);
  });
});
