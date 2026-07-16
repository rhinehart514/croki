import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FirmLensEmpty } from "./FirmLensEmpty";

describe("FirmLensEmpty", () => {
  it("explains first work without inventing an outcome and can be dismissed", () => {
    render(<FirmLensEmpty />);

    expect(screen.getByRole("heading", { name: "Start with one open direction." })).toBeTruthy();
    expect(screen.getByText(/reads the bound repository, cites what it finds/i)).toBeTruthy();
    expect(screen.queryByText(/give the firm an outcome/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss first-work help" }));
    expect(screen.queryByRole("heading", { name: "Start with one open direction." })).toBeNull();
  });
});
