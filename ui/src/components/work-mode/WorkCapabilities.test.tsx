import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkCapabilities } from "./WorkCapabilities";

const getCapabilityInventory = vi.fn();
const getCredentials = vi.fn();
vi.mock("@/api", () => ({
  getCapabilityInventory: () => getCapabilityInventory(),
  getCredentials: () => getCredentials(),
}));

const inventory = (...capabilities: Array<Record<string, unknown>>) => ({ capabilities });

describe("WorkCapabilities", () => {
  beforeEach(() => {
    getCapabilityInventory.mockReset();
    getCredentials.mockReset().mockResolvedValue({ credentials: [] });
  });

  it("names each connected capability's kind and authority in words", async () => {
    getCapabilityInventory.mockResolvedValue(inventory(
      { id: "repository", label: "Repository", provider: "native", kind: "workspace", authority: "inward", status: "available", detail: "Isolated product work" },
      { id: "gmail.send", label: "Gmail Send", provider: "gmail", kind: "action", authority: "founder-gate", status: "available", detail: "Founder approves every send" },
    ));
    render(<WorkCapabilities />);

    const repo = await screen.findByLabelText("Repository, Workspace, Inward access");
    expect(repo).toBeInTheDocument();
    // The gated action names Approval in words, never by colour alone.
    expect(screen.getByLabelText("Gmail Send, Action, Approval access")).toBeInTheDocument();
    expect(screen.getByText("Approval")).toBeInTheDocument();
  });

  it("stays quiet when the host reports nothing callable", async () => {
    getCapabilityInventory.mockResolvedValue(inventory());
    const { container } = render(<WorkCapabilities />);
    await waitFor(() => expect(getCapabilityInventory).toHaveBeenCalled());
    expect(container.querySelector(".work-capability-strip")).toBeNull();
  });

  it("drops unavailable and agent-skill entries the agent cannot actually call", async () => {
    getCapabilityInventory.mockResolvedValue(inventory(
      { id: "repository", label: "Repository", provider: "native", kind: "workspace", authority: "inward", status: "available", detail: "Isolated product work" },
      { id: "skill.one", label: "Some Skill", provider: "agent", kind: "agent-skill", authority: "inward", status: "unavailable", detail: "Configured only" },
      { id: "exa.search", label: "Exa Search", provider: "exa", kind: "source", authority: "read", status: "unavailable", detail: "Not connected" },
    ));
    render(<WorkCapabilities />);

    await screen.findByLabelText("Repository, Workspace, Inward access");
    expect(screen.queryByText("Some Skill")).toBeNull();
    expect(screen.queryByText("Exa Search")).toBeNull();
  });

  it("surfaces a reconnect status without failing the strip", async () => {
    getCapabilityInventory.mockResolvedValue(inventory(
      { id: "gmail.read", label: "Gmail Read", provider: "gmail", kind: "source", authority: "read", status: "reconnect", detail: "Reconnect Gmail" },
    ));
    render(<WorkCapabilities />);

    expect(await screen.findByLabelText("Gmail Read, Source, Read access, Reconnect")).toBeInTheDocument();
  });

  it("stays quiet when the host cannot answer at all", async () => {
    getCapabilityInventory.mockRejectedValue(new Error("offline"));
    const { container } = render(<WorkCapabilities />);
    await waitFor(() => expect(getCapabilityInventory).toHaveBeenCalled());
    expect(container.querySelector(".work-capability-strip")).toBeNull();
  });
});
