import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkComposerBar } from "./WorkComposerBar";

const getRuntimeStatuses = vi.fn();
vi.mock("@/api", () => ({
  getRuntimeStatuses: () => getRuntimeStatuses(),
}));

const props = { ventureId: "venture-one", threadKey: "thread:one", repository: "/projects/drover", disabled: false, mode: "code" as const };

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

  it("keeps real coding context visible and returns an exact, current model selection", async () => {
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} onModeChange={vi.fn()} onChange={onChange} />);
    expect(screen.getByText("drover")).toBeInTheDocument();
    expect(screen.getByText("Worktree")).toBeInTheDocument();
    expect(screen.getByText("Guarded")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat participation controls")).toBeInTheDocument();
    expect(screen.queryByLabelText("Connected capabilities the coding agent can reach")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitemradio", { name: /GPT-5\.6 Sol/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "codex", model: "gpt-5.6-sol", effort: "high" }));
    expect(localStorage.getItem("drover:work-model:venture-one")).toBe("codex:gpt-5.6-sol");
    expect(localStorage.getItem("drover:work-model:venture-one:thread:one")).toBe("codex:gpt-5.6-sol");
  });

  it("exposes the model's actual reasoning tiers and remembers the choice", async () => {
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} onModeChange={vi.fn()} onChange={onChange} />);
    // Claude (default) reasons up through max.
    expect(screen.getByRole("menuitemradio", { name: /Maximum/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Quick/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "claude-code", model: null, effort: "low" }));
    expect(localStorage.getItem("drover:work-effort:venture-one")).toBe("low");
    expect(localStorage.getItem("drover:work-effort:venture-one:thread:one")).toBe("low");
  });

  it("restores one venture model choice across Thread keys", async () => {
    localStorage.setItem("drover:work-model:venture-one", "codex:gpt-5.6-terra");
    localStorage.setItem("drover:work-effort:venture-one", "xhigh");
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} threadKey="thread:another" onModeChange={vi.fn()} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({
      runtime: "codex",
      model: "gpt-5.6-terra",
      effort: "xhigh",
    }));
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("GPT-5.6 Terra");
  });

  it("clamps a Max tier down when switching to a model whose ceiling is lower", async () => {
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} onModeChange={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Maximum/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "claude-code", model: null, effort: "max" }));

    // GPT-5.6 Sol reaches Max too, so switching to it keeps the tier.
    fireEvent.click(screen.getByRole("menuitemradio", { name: /GPT-5\.6 Sol/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "codex", model: "gpt-5.6-sol", effort: "max" }));

    // Terra tops out at Extra deep, so the tier collapses and Max is no longer offered.
    fireEvent.click(screen.getByRole("menuitemradio", { name: /GPT-5\.6 Terra/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "codex", model: "gpt-5.6-terra", effort: "xhigh" }));
    expect(screen.queryByRole("menuitemradio", { name: /Maximum/ })).not.toBeInTheDocument();
  });

  it("never hides the participant behind an automatic router", () => {
    render(<WorkComposerBar {...props} onModeChange={vi.fn()} onChange={vi.fn()} />);
    expect(screen.queryByText("Auto")).not.toBeInTheDocument();
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("Claude Code");
  });

  it("switches the chat itself from direct coding to Product and GTM agents", () => {
    const onModeChange = vi.fn();
    const { rerender } = render(<WorkComposerBar {...props} onModeChange={onModeChange} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Product / GTM — Agents" }));
    expect(onModeChange).toHaveBeenCalledWith("product-gtm");

    rerender(<WorkComposerBar {...props} mode="product-gtm" onModeChange={onModeChange} onChange={vi.fn()} />);
    expect(screen.getByText("Croki agents")).toBeInTheDocument();
    expect(screen.getByText(/Ideate workflows, branches, gates/)).toBeInTheDocument();
    expect(screen.queryByLabelText("SDK model")).not.toBeInTheDocument();
  });
});
