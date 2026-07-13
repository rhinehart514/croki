import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({ getFailureLog: vi.fn() }));

import { getFailureLog } from "@/api";
import { FailureLogPanel } from "./FailureLogPanel";

const mockedGetFailureLog = vi.mocked(getFailureLog);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetFailureLog.mockResolvedValue({
    selfInflictedCount: 1,
    transientCount: 1,
    groups: [
      {
        signature: "bug",
        category: "node-error",
        failureClass: "self_inflicted",
        errorKind: "code_throw",
        occurrences: 1,
        firstSeen: "2026-07-13T12:00:00.000Z",
        lastSeen: "2026-07-13T12:00:00.000Z",
        pipeline: "Outbound",
        step: "Draft",
        errorSnippet: "formatter crashed",
        file: "bug.md",
        status: "open",
      },
      {
        signature: "retry",
        category: "run-stall",
        failureClass: "transient",
        errorKind: "timeout",
        occurrences: 2,
        firstSeen: "2026-07-13T12:00:00.000Z",
        lastSeen: "2026-07-13T12:01:00.000Z",
        pipeline: "Outbound",
        step: null,
        errorSnippet: "provider timed out",
        file: "retry.md",
        status: "open",
      },
    ],
  });
});

describe("FailureLogPanel accessibility", () => {
  it("stays nonmodal so the surrounding canvas remains interactive", async () => {
    render(<FailureLogPanel projectId="proj-1" onClose={() => {}} />);

    const panel = await screen.findByRole("dialog", { name: /what drover saw fail/i });
    expect(panel).not.toHaveAttribute("aria-modal", "true");

    const backdrop = document.querySelector('[data-slot="sheet-overlay"]');
    expect(backdrop).toHaveClass("pointer-events-none");
  });

  it("uses keyboard-navigable tabs and exposes the selected panel", async () => {
    render(<FailureLogPanel projectId="proj-1" onClose={() => {}} />);

    const toFix = await screen.findByRole("tab", { name: /to fix/i });
    const transient = screen.getByRole("tab", { name: /transient/i });
    expect(toFix).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("formatter crashed")).toBeVisible();

    await act(async () => { toFix.focus(); });
    await act(async () => { fireEvent.keyDown(toFix, { key: "ArrowRight" }); });
    await waitFor(() => expect(transient).toHaveFocus());
    await act(async () => { fireEvent.click(transient); });

    await waitFor(() => expect(transient).toHaveAttribute("aria-selected", "true"));
    expect(await screen.findByText("provider timed out")).toBeVisible();
    expect(screen.queryByText("formatter crashed")).toBeNull();
  });
});
