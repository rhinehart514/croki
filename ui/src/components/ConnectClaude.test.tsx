import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the API seam — the gate's job is to re-check the connection and lift the result up, not to talk
// to a real server. We grab the mock back to drive what a re-check returns.
vi.mock("@/api", () => ({
  getConnection: vi.fn(),
}));

import { ConnectClaude } from "./ConnectClaude";
import { getConnection, type ConnectionStatus } from "@/api";

const mockedGet = vi.mocked(getConnection);

beforeEach(() => {
  vi.clearAllMocks();
});

// Neither provider signed in, legacy shape (no per-provider runtimes reported yet).
const disconnected: ConnectionStatus = { connected: false, label: null, reason: "No runtime available." };

describe("ConnectClaude — provider-neutral runtime gate", () => {
  it("shows BOTH providers, provider-neutral, with their exact commands when disconnected", () => {
    render(<ConnectClaude connection={disconnected} onResult={() => {}} />);

    // Provider-neutral heading, not a Claude install tutorial.
    expect(screen.getByRole("heading", { name: /Connect an AI runtime/i })).toBeInTheDocument();
    // Both providers are present as equals.
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    // Each carries its exact minimal command.
    expect(screen.getByText("codex login")).toBeInTheDocument();
    expect(screen.getByText("claude auth login")).toBeInTheDocument();
    // No API key is required for subscription auth — stated plainly.
    expect(screen.getByText(/neither needs an API key/i)).toBeInTheDocument();
    // The re-check action is offered.
    expect(screen.getByRole("button", { name: /Re-check connection/i })).toBeInTheDocument();
  });

  it("preserves the founder wall copy", () => {
    render(<ConnectClaude connection={disconnected} onResult={() => {}} />);
    expect(screen.getByText(/Nothing reaches the world until you approve it at the gate/i)).toBeInTheDocument();
  });

  it("renders as contextual recovery without hiding grounded truth", () => {
    const { container } = render(<ConnectClaude connection={disconnected} onResult={() => {}} contextual />);
    expect(container.querySelector(".runtime-context")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Read possible openings/i })).toBeInTheDocument();
    expect(screen.getByText(/Grounded product truth and existing work stay available/i)).toBeInTheDocument();
  });

  it("lifts the gate when CODEX is connected (renders nothing)", () => {
    const { container } = render(
      <ConnectClaude
        connection={{
          connected: true,
          label: "Codex (ChatGPT)",
          reason: null,
          runtimes: [
            { id: "codex", provider: "codex", label: "Codex (ChatGPT)", connected: true, reason: null },
            { id: "claude-code", provider: "claude", label: "Claude", connected: false, reason: "Not signed in." },
          ],
        }}
        onResult={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lifts the gate when CLAUDE is connected (renders nothing)", () => {
    const { container } = render(
      <ConnectClaude
        connection={{
          connected: true,
          label: "Claude subscription",
          reason: null,
          runtimes: [
            { id: "codex", provider: "codex", label: "Codex", connected: false, reason: "Not signed in." },
            { id: "claude-code", provider: "claude", label: "Claude", connected: true, reason: null },
          ],
        }}
        onResult={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not block when one provider is unavailable but the other is connected", () => {
    // Codex disabled/unavailable, Claude ready → top-level connected true → gate lifts.
    const { container } = render(
      <ConnectClaude
        connection={{
          connected: true,
          label: "Claude subscription",
          reason: null,
          runtimes: [
            { id: "codex", provider: "codex", label: "Codex", connected: false, reason: "Codex runtime is disabled." },
            { id: "claude-code", provider: "claude", label: "Claude", connected: true, reason: null },
          ],
        }}
        onResult={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps a disabled provider's reason provider-specific and redacted (no raw error)", () => {
    render(
      <ConnectClaude
        connection={{
          connected: false,
          label: null,
          reason: "Claude Code runtime is disabled (GTM_IDE_DISABLE_CLAUDE_CODE).",
          runtimes: [
            { id: "codex", provider: "codex", label: "Codex", connected: false, reason: "Not signed in." },
            {
              id: "claude-code",
              provider: "claude",
              label: "Claude",
              connected: false,
              reason: "Claude Code runtime is disabled (GTM_IDE_DISABLE_CLAUDE_CODE).",
            },
          ],
        }}
        onResult={() => {}}
      />,
    );

    // The disabled state reads as a short, redacted, provider-specific note...
    expect(screen.getByText(/Turned off for this install/i)).toBeInTheDocument();
    // ...and the raw backend error (env var and all) is never surfaced.
    expect(screen.queryByText(/GTM_IDE_DISABLE_CLAUDE_CODE/)).not.toBeInTheDocument();
    // Codex is still offered as the working path.
    expect(screen.getByText("codex login")).toBeInTheDocument();
  });

  it("lifts the gate when a re-check comes back connected", async () => {
    const onResult = vi.fn();
    mockedGet.mockResolvedValue({ connected: true, label: "Codex (ChatGPT)", reason: null });
    render(<ConnectClaude connection={disconnected} onResult={onResult} />);

    fireEvent.click(screen.getByRole("button", { name: /Re-check connection/i }));

    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ connected: true }));
  });

  it("stays put with a concise note when a re-check is still disconnected", async () => {
    const onResult = vi.fn();
    mockedGet.mockResolvedValue({ connected: false, label: null, reason: "No runtime available." });
    render(<ConnectClaude connection={disconnected} onResult={onResult} />);

    fireEvent.click(screen.getByRole("button", { name: /Re-check connection/i }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ connected: false })));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Still no AI runtime signed in/i);
  });

  it("reports a re-check failure concisely, never a raw error", async () => {
    mockedGet.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:8787 socket hang up"));
    render(<ConnectClaude connection={disconnected} onResult={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Re-check connection/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't reach the connection check/i);
    // The raw transport error must not leak through.
    expect(alert).not.toHaveTextContent(/ECONNREFUSED/);
  });
});
