import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({
  connectCapability: vi.fn(),
  getCapabilities: vi.fn(),
  getCapabilityInventory: vi.fn(),
  reclassifyCapabilityTool: vi.fn(),
  removeCapability: vi.fn(),
}));

import { getCapabilities, getCapabilityInventory, reclassifyCapabilityTool } from "@/api";
import type { CapabilityServer, CapabilityTool } from "@/types";
import { ConnectCapability } from "./ConnectCapability";

const tool: CapabilityTool = {
  name: "send_email",
  description: "Send an email",
  class: "write",
  reason: "Acts on the world",
  source: "annotation",
  declaredReadOnly: false,
  declaredDestructive: false,
  override: null,
  effectiveClass: "write",
};

const server: CapabilityServer = {
  id: "mail",
  name: "Mail",
  url: "local",
  trust: "verified",
  auth: { status: "authed", method: "token" },
  connectedAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z",
  read: [],
  write: [tool],
  defaultedCount: 0,
  overrideCount: 0,
  toolCount: 1,
};

const mockedGetCapabilities = vi.mocked(getCapabilities);
const mockedGetCapabilityInventory = vi.mocked(getCapabilityInventory);
const mockedReclassify = vi.mocked(reclassifyCapabilityTool);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetCapabilities.mockResolvedValue({ servers: [server] });
  mockedGetCapabilityInventory.mockResolvedValue({ tools: [], agents: [] });
});

describe("ConnectCapability wall confirmation", () => {
  it("disables confirmation controls and deduplicates while loosening the wall", async () => {
    let resolveMove!: (value: { server: CapabilityServer; loosenedWall: boolean }) => void;
    const pendingMove = new Promise<{ server: CapabilityServer; loosenedWall: boolean }>((resolve) => {
      resolveMove = resolve;
    });
    mockedReclassify
      .mockRejectedValueOnce(new Error("confirm required"))
      .mockReturnValueOnce(pendingMove);

    render(<ConnectCapability />);

    fireEvent.click(await screen.findByRole("button", { name: "Run free" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Loosen the wall" });
    fireEvent.click(confirm);

    const pendingAction = await within(dialog).findByRole("button", { name: "Loosening…" });
    const cancel = within(dialog).getByRole("button", { name: "Keep gated" });
    expect(pendingAction).toBeDisabled();
    expect(cancel).toBeDisabled();

    fireEvent.click(pendingAction);
    expect(mockedReclassify).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveMove({ server, loosenedWall: true });
      await pendingMove;
    });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});
