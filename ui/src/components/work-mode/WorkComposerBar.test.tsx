import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkComposerBar } from "./WorkComposerBar";

const getRuntimeStatuses = vi.fn();
vi.mock("@/api", () => ({
  getRuntimeStatuses: (...args: unknown[]) => getRuntimeStatuses(...args),
}));

const props = { ventureId: "venture-one", threadKey: "thread:one", repository: "/projects/drover", disabled: false, canvasOpen: false };

const advertisedRuntimes = [
  {
    id: "claude-code", label: "Claude", connected: true, auth: "oauth", authLabel: "Claude subscription", reason: null,
    capabilities: {
      version: "Agent SDK 9.8.7", planSupported: true, update: { state: "unknown" }, discovery: { state: "partial" },
      models: [{ id: "claude-opus-4-8", label: "Claude Opus 4.8", description: "Deep coding", maxEffort: "max", contextWindow: 200_000 }],
      skills: [{ name: "review", description: "Review exact changes", reference: "/review" }],
      slashCommands: [{ name: "ship", description: "Prepare shipment", reference: "/ship" }],
      interactionModes: [{ id: "default", label: "Act" }, { id: "plan", label: "Plan" }],
    },
  },
  {
    id: "codex", label: "Codex", connected: true, auth: "chatgpt-login", authLabel: "ChatGPT subscription", reason: null,
    capabilities: {
      version: "codex-cli 5.6.1", planSupported: false, update: { state: "unknown" }, discovery: { state: "partial" },
      models: [{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol", description: "Flagship", maxEffort: "max", contextWindow: null }],
      skills: [{ name: "audit", description: "Audit the repository", reference: "$audit" }],
      slashCommands: [],
      interactionModes: [{ id: "default", label: "Act" }],
    },
  },
];

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
    render(<WorkComposerBar {...props} onCanvasOpenChange={vi.fn()} onChange={onChange} />);
    expect(screen.getByText("drover")).toBeInTheDocument();
    expect(screen.getByText("Isolated worktree")).toBeInTheDocument();
    expect(screen.getByText("Guarded")).toBeInTheDocument();
    expect(screen.getByLabelText("Thread controls")).toBeInTheDocument();
    expect(screen.queryByLabelText("Connected capabilities the coding agent can reach")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitemradio", { name: /GPT-5\.6 Sol/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "codex", model: "gpt-5.6-sol", effort: "high" }));
    expect(localStorage.getItem("drover:work-model:venture-one")).toBe("codex:gpt-5.6-sol");
    expect(localStorage.getItem("drover:work-model:venture-one:thread:one")).toBe("codex:gpt-5.6-sol");
  });

  it("exposes the model's actual reasoning tiers and remembers the choice", async () => {
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} onCanvasOpenChange={vi.fn()} onChange={onChange} />);
    // Claude Opus 4.8 (default) reasons up through max.
    expect(screen.getByRole("menuitemradio", { name: /Maximum/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Quick/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "claude-code", model: "claude-opus-4-8", effort: "low" }));
    expect(localStorage.getItem("drover:work-effort:venture-one")).toBe("low");
    expect(localStorage.getItem("drover:work-effort:venture-one:thread:one")).toBe("low");
  });

  it("restores one venture model choice across Thread keys", async () => {
    localStorage.setItem("drover:work-model:venture-one", "codex:gpt-5.6-terra");
    localStorage.setItem("drover:work-effort:venture-one", "xhigh");
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} threadKey="thread:another" onCanvasOpenChange={vi.fn()} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({
      runtime: "codex",
      model: "gpt-5.6-terra",
      effort: "xhigh",
    }));
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("GPT-5.6 Terra");
  });

  it("clamps a higher tier down when switching to a model whose ceiling is lower", async () => {
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} onCanvasOpenChange={vi.fn()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Maximum/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "claude-code", model: "claude-opus-4-8", effort: "max" }));

    // GPT-5.6 Sol exposes Ultra, which the founder can select directly.
    fireEvent.click(screen.getByRole("menuitemradio", { name: /GPT-5\.6 Sol/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Ultra/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "codex", model: "gpt-5.6-sol", effort: "ultra" }));

    // Luna tops out at Maximum, so Ultra collapses and is no longer offered.
    fireEvent.click(screen.getByRole("menuitemradio", { name: /GPT-5\.6 Luna/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "codex", model: "gpt-5.6-luna", effort: "max" }));
    expect(screen.queryByRole("menuitemradio", { name: /Ultra/ })).not.toBeInTheDocument();
  });

  it("keeps the founder's participant when its runtime is offline instead of silently swapping", async () => {
    localStorage.setItem("drover:work-model:venture-one", "codex:gpt-5.6-sol");
    getRuntimeStatuses.mockResolvedValue({
      runtimes: [
        { id: "codex", label: "Codex", connected: false, auth: "chatgpt-login", authLabel: "ChatGPT subscription", reason: "Not signed in" },
        { id: "claude-code", label: "Claude", connected: true, auth: "oauth", authLabel: "Claude subscription", reason: null },
      ],
    });
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} onCanvasOpenChange={vi.fn()} onChange={onChange} />);
    await waitFor(() => expect(screen.getByLabelText("SDK model")).toHaveTextContent("Not connected"));
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("GPT-5.6 Sol");
    expect(localStorage.getItem("drover:work-model:venture-one")).toBe("codex:gpt-5.6-sol");
    expect(onChange).toHaveBeenLastCalledWith({ runtime: "codex", model: "gpt-5.6-sol", effort: "high" });
  });

  it("never hides the participant behind an automatic router or an unnamed default", () => {
    render(<WorkComposerBar {...props} onCanvasOpenChange={vi.fn()} onChange={vi.fn()} />);
    expect(screen.queryByText("Auto")).not.toBeInTheDocument();
    // Every offered participant names an exact model; no row defers to whatever the CLI is configured for.
    expect(screen.queryByText("Default model")).not.toBeInTheDocument();
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("Claude Opus 4.8");
  });

  it("keeps the runtime a founder chose when an old adapter-only preference forward-maps", async () => {
    localStorage.setItem("drover:work-model:venture-one", "codex");
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} onCanvasOpenChange={vi.fn()} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ runtime: "codex", model: "gpt-5.6-sol", effort: "high" }));
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("GPT-5.6 Sol");
  });

  it("toggles only the Canvas view and keeps the selected SDK controls present", () => {
    const onCanvasOpenChange = vi.fn();
    const { rerender } = render(<WorkComposerBar {...props} onCanvasOpenChange={onCanvasOpenChange} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Canvas" }));
    expect(onCanvasOpenChange).toHaveBeenCalledWith(true);

    rerender(<WorkComposerBar {...props} canvasOpen onCanvasOpenChange={onCanvasOpenChange} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Canvas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("Claude Opus 4.8");
    expect(screen.getByText("drover")).toBeInTheDocument();
    expect(screen.queryByText("Croki agents")).not.toBeInTheDocument();
  });

  it("never turns Skills or commands into a persistent picker or hidden turn modifier", async () => {
    getRuntimeStatuses.mockResolvedValue({ runtimes: advertisedRuntimes });
    localStorage.setItem("drover:work-native-reference:venture-capabilities", "/review");
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} ventureId="venture-capabilities" onCanvasOpenChange={vi.fn()} onChange={onChange} />);

    const plan = await screen.findByRole("button", { name: "Plan" });
    expect(screen.getByRole("menuitemradio", { name: /Claude Opus 4\.8.*200k context/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Native provider capabilities")).not.toBeInTheDocument();
    expect(screen.queryByText("/review")).not.toBeInTheDocument();
    expect(screen.queryByText("$audit")).not.toBeInTheDocument();
    fireEvent.click(plan);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({
      runtime: "claude-code",
      model: "claude-opus-4-8",
      effort: "high",
      interactionMode: "plan",
    }));
    expect(localStorage.getItem("drover:work-native-reference:venture-capabilities")).toBeNull();
  });

  it("removes Claude-only Plan when the founder selects Codex without exposing either provider as a capability picker", async () => {
    getRuntimeStatuses.mockResolvedValue({ runtimes: advertisedRuntimes });
    render(<WorkComposerBar {...props} ventureId="venture-provider-boundary" onCanvasOpenChange={vi.fn()} onChange={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Plan" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitemradio", { name: /GPT-5\.6 Sol/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Plan" })).not.toBeInTheDocument());
    expect(screen.queryByText("/review")).not.toBeInTheDocument();
    expect(screen.queryByText("$audit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Native provider capabilities")).not.toBeInTheDocument();
  });

  it("keeps a persisted model unavailable until the founder chooses a replacement", async () => {
    localStorage.setItem("drover:work-model:venture-model-drift", "claude-code:claude-fable-5");
    getRuntimeStatuses.mockResolvedValue({ runtimes: advertisedRuntimes });
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} ventureId="venture-model-drift" onCanvasOpenChange={vi.fn()} onChange={onChange} />);

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({
      runtime: "claude-code",
      model: "claude-fable-5",
      effort: "high",
    }));
    await waitFor(() => expect(screen.getByLabelText("SDK model")).toHaveTextContent("Model unavailable"));
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("Claude Fable 5");
    expect(localStorage.getItem("drover:work-model:venture-model-drift")).toBe("claude-code:claude-fable-5");
    expect(screen.getByRole("menuitemradio", { name: /Claude Fable 5.*Unavailable in the current provider inventory/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("menuitemradio", { name: /Claude Opus 4\.8/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({
      runtime: "claude-code",
      model: "claude-opus-4-8",
      effort: "high",
    }));
    expect(screen.getByLabelText("SDK model")).not.toHaveTextContent("Model unavailable");
  });

  it("retains an exact future model id even when no local compatibility label exists", async () => {
    localStorage.setItem("drover:work-model:venture-future-model", "codex:gpt-6-preview");
    getRuntimeStatuses.mockResolvedValue({ runtimes: advertisedRuntimes });
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} ventureId="venture-future-model" onCanvasOpenChange={vi.fn()} onChange={onChange} />);

    await waitFor(() => expect(screen.getByLabelText("SDK model")).toHaveTextContent("Model unavailable"));
    expect(screen.getByLabelText("SDK model")).toHaveTextContent("gpt-6-preview");
    expect(onChange).toHaveBeenLastCalledWith({
      runtime: "codex",
      model: "gpt-6-preview",
      effort: null,
    });
    expect(localStorage.getItem("drover:work-model:venture-future-model")).toBe("codex:gpt-6-preview");
  });

  it("does not invent reasoning controls when the provider advertises no effort setting", async () => {
    getRuntimeStatuses.mockResolvedValue({
      runtimes: [{
        ...advertisedRuntimes[0],
        capabilities: {
          ...advertisedRuntimes[0].capabilities,
          models: [{
            id: "claude-haiku",
            label: "Claude Haiku",
            description: "Fast",
            maxEffort: "low",
            efforts: [],
            contextWindow: null,
          }],
        },
      }],
    });
    const onChange = vi.fn();
    render(<WorkComposerBar {...props} ventureId="venture-provider-default" onCanvasOpenChange={vi.fn()} onChange={onChange} />);

    await waitFor(() => expect(screen.getByLabelText("SDK model")).toHaveTextContent("Model unavailable"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Claude Haiku.*Fast/ }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({
      runtime: "claude-code",
      model: "claude-haiku",
      effort: null,
    }));
    expect(screen.getByLabelText("Reasoning effort is chosen by this model")).toHaveTextContent("Provider default");
    expect(screen.queryByLabelText("Reasoning effort")).not.toBeInTheDocument();
  });
});
