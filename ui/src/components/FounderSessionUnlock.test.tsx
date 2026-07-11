import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ unlockFounderSession: vi.fn() }));
vi.mock("@/api", () => api);
import { FounderSessionUnlock } from "@/components/FounderSessionUnlock";

describe("FounderSessionUnlock", () => {
  it("claims founder authority with the terminal code", async () => {
    api.unlockFounderSession.mockResolvedValue({ authenticated: true });
    const unlocked = vi.fn();
    render(<FounderSessionUnlock onUnlocked={unlocked} />);
    fireEvent.change(screen.getByLabelText("Founder action code"), { target: { value: "alpha-code" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(api.unlockFounderSession).toHaveBeenCalledWith("alpha-code"));
    expect(unlocked).toHaveBeenCalled();
  });

  it("keeps a refused code visible without hiding the canvas contract", async () => {
    api.unlockFounderSession.mockRejectedValue(new Error("That founder action code was not accepted."));
    render(<FounderSessionUnlock onUnlocked={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Founder action code"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not accepted");
  });
});
