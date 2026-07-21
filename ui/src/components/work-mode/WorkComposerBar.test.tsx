import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkComposerBar } from "./WorkComposerBar";

const getRuntimeStatuses = vi.fn();
vi.mock("@/api", () => ({ getRuntimeStatuses: () => getRuntimeStatuses() }));

describe("WorkComposerBar", () => {
  beforeEach(() => {
    localStorage.clear();
    getRuntimeStatuses.mockReset().mockResolvedValue({
      runtimes: [
        { id: "codex", label: "Codex", connected: true, auth: "chatgpt-login", authLabel: "ChatGPT subscription", reason: null },
        { id: "claude-code", label: "Claude", connected: true, auth: "oauth", authLabel: "Claude subscription", reason: null },
      ],
    });
  });

  it("keeps real coding context visible and returns an exact model selection", async () => {
    const onChange = vi.fn();
    render(<WorkComposerBar ventureId="venture-one" threadKey="thread:one" repository="/projects/drover" disabled={false} mode="code" onModeChange={vi.fn()} onChange={onChange} />);
    expect(screen.getByText("drover")).toBeInTheDocument();
    expect(screen.getByText("Worktree")).toBeInTheDocument();
    expect(screen.getByText("Guarded")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat participation controls")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("SDK model"), { target: { value: "codex:gpt-5.4" } });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "codex", model: "gpt-5.4" }));
    expect(localStorage.getItem("drover:work-model:venture-one:thread:one")).toBe("codex:gpt-5.4");
  });

  it("never hides the participant behind an automatic router", () => {
    render(<WorkComposerBar ventureId="venture-one" threadKey="thread:one" repository="/projects/drover" disabled={false} mode="code" onModeChange={vi.fn()} onChange={vi.fn()} />);
    expect(screen.queryByRole("option", { name: "Auto" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("SDK model")).toHaveValue("claude-code");
  });

  it("switches the chat itself from direct coding to Product and GTM agents", () => {
    const onModeChange = vi.fn();
    const { rerender } = render(<WorkComposerBar ventureId="venture-one" threadKey="thread:one" repository="/projects/drover" disabled={false} mode="code" onModeChange={onModeChange} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Product / GTM — Agents" }));
    expect(onModeChange).toHaveBeenCalledWith("product-gtm");

    rerender(<WorkComposerBar ventureId="venture-one" threadKey="thread:one" repository="/projects/drover" disabled={false} mode="product-gtm" onModeChange={onModeChange} onChange={vi.fn()} />);
    expect(screen.getByText("Drover agents")).toBeInTheDocument();
    expect(screen.getByText(/Ideate workflows, branches, gates/)).toBeInTheDocument();
    expect(screen.queryByLabelText("SDK model")).not.toBeInTheDocument();
  });
});
