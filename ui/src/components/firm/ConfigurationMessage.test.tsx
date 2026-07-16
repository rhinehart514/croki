import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FirmConversationMessage } from "@/types";

const applyConfigurationProposal = vi.fn();
const restoreConfiguration = vi.fn();

vi.mock("@/api", () => ({
  applyConfigurationProposal: (...args: unknown[]) => applyConfigurationProposal(...args),
  restoreConfiguration: (...args: unknown[]) => restoreConfiguration(...args),
}));

import { ConfigurationMessage } from "./ConfigurationMessage";

const proposalMessage: FirmConversationMessage = {
  id: "message-proposal", ventureId: "v1", role: "founder", kind: "configuration-proposal",
  content: "Give Sable independent verification", teammateRef: "sable", betId: null,
  configurationProposal: {
    id: "proposal-1", baseRevision: 3, proposedRevision: 4,
    summary: "Give Sable independent verification", status: "pending",
    rationale: "Adds a configured capability without granting host authority.",
    diff: [{ path: "agents.sable.capabilities.additional", before: [], after: ["independent verification"] }],
  },
  createdAt: "2026-07-14T12:00:00.000Z",
};

describe("ConfigurationMessage", () => {
  beforeEach(() => {
    applyConfigurationProposal.mockReset().mockResolvedValue({});
    restoreConfiguration.mockReset().mockResolvedValue({});
  });

  it("applies a current proposal and reports the live version change", async () => {
    const onChanged = vi.fn();
    render(<ConfigurationMessage ventureId="v1" message={proposalMessage} currentRevision={3} onChanged={onChanged} />);
    expect(screen.getByText("v3 → v4")).toBeTruthy();
    expect(screen.getByText("What a participant can do or when they join changes")).toBeTruthy();
    expect(screen.getByText("Inspect 1 exact change").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("participants › sable › capabilities › additional")).toBeTruthy();
    expect(screen.getByText("independent verification")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply change" }));
    await waitFor(() => expect(applyConfigurationProposal).toHaveBeenCalledWith("v1", "proposal-1", 3));
    expect(await screen.findByText("Applied to the live firm")).toBeTruthy();
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("undoes the current receipt as a new configuration version", async () => {
    const receiptMessage: FirmConversationMessage = {
      ...proposalMessage,
      id: "message-receipt",
      role: "agent",
      kind: "configuration-receipt",
      configurationProposal: null,
      configurationReceipt: { id: "receipt-4", revision: 4, summary: "Added verification", source: "proposal:proposal-1" },
    };
    render(<ConfigurationMessage ventureId="v1" message={receiptMessage} currentRevision={4} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    await waitFor(() => expect(restoreConfiguration).toHaveBeenCalledWith("v1", 4, "receipt-4"));
    expect(await screen.findByText("Restored as a new version")).toBeTruthy();
  });

  it("keeps the proposal inspectable but disables apply while the shell is read-only", () => {
    render(
      <ConfigurationMessage
        ventureId="v1"
        message={proposalMessage}
        currentRevision={3}
        readOnly
        readOnlyReason="Connection lost. Reconnecting…"
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Apply change" })).toBeDisabled();
    expect(screen.getByText("Connection lost. Reconnecting…")).toBeTruthy();
    expect(applyConfigurationProposal).not.toHaveBeenCalled();
  });
});
