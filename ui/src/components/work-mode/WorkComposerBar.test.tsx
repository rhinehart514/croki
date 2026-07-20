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
    render(<WorkComposerBar ventureId="venture-one" threadKey="thread:one" repository="/projects/drover" disabled={false} onChange={onChange} />);
    expect(screen.getByText("drover")).toBeInTheDocument();
    expect(screen.getByText("Worktree")).toBeInTheDocument();
    expect(screen.getByText("Guarded")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "codex:gpt-5.4" } });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "codex", model: "gpt-5.4" }));
    expect(localStorage.getItem("drover:work-model:venture-one:thread:one")).toBe("codex:gpt-5.4");
  });
});
