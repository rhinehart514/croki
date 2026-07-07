import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the API seam — the gate's job is to re-check the connection and lift the result up, not to talk
// to a real server. We grab the mock back to drive what a re-check returns.
vi.mock("@/api", () => ({
  getConnection: vi.fn(),
}));

import { ConnectClaude } from "./ConnectClaude";
import { getConnection } from "@/api";

const mockedGet = vi.mocked(getConnection);

beforeEach(() => {
  vi.clearAllMocks();
});

const disconnected = { connected: false, label: null, reason: "Claude Code is not signed in. Run `claude` to sign in." };

describe("ConnectClaude", () => {
  it("walks the founder through installing and signing in", () => {
    render(<ConnectClaude connection={disconnected} onResult={() => {}} />);

    expect(screen.getByText(/Connect Claude to begin/i)).toBeInTheDocument();
    // The three-beat walkthrough is present.
    expect(screen.getByText(/Install Claude Code/i)).toBeInTheDocument();
    expect(screen.getByText(/Sign in with your subscription/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Re-check connection/i })).toBeInTheDocument();
    // The precise detected reason is surfaced honestly.
    expect(screen.getByText(/not signed in/i)).toBeInTheDocument();
  });

  it("lifts a connected result up so the parent can drop the gate", async () => {
    const onResult = vi.fn();
    mockedGet.mockResolvedValue({ connected: true, label: "Claude subscription", reason: null });
    render(<ConnectClaude connection={disconnected} onResult={onResult} />);

    fireEvent.click(screen.getByRole("button", { name: /Re-check connection/i }));

    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ connected: true }));
  });

  it("keeps the founder here and reports the reason when still disconnected", async () => {
    const onResult = vi.fn();
    mockedGet.mockResolvedValue({ connected: false, label: null, reason: "Claude Code is not signed in." });
    render(<ConnectClaude connection={disconnected} onResult={onResult} />);

    fireEvent.click(screen.getByRole("button", { name: /Re-check connection/i }));

    // The fresh status still flows up (parent stays on the gate because connected is false).
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ connected: false })));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not signed in/i);
  });

  it("names a disabled install plainly and offers no re-check", () => {
    render(
      <ConnectClaude
        connection={{ connected: false, label: null, reason: "Claude Code runtime is disabled (GTM_IDE_DISABLE_CLAUDE_CODE)." }}
        onResult={() => {}}
      />,
    );

    expect(screen.getByText(/turned off for this install/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Re-check connection/i })).not.toBeInTheDocument();
  });
});
