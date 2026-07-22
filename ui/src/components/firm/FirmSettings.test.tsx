import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCredentials = vi.fn();
const connectGmail = vi.fn();
const removeCredential = vi.fn();
const saveCredential = vi.fn();

vi.mock("@/api", () => ({
  getCredentials: (...args: unknown[]) => getCredentials(...args),
  connectGmail: (...args: unknown[]) => connectGmail(...args),
  removeCredential: (...args: unknown[]) => removeCredential(...args),
  saveCredential: (...args: unknown[]) => saveCredential(...args),
}));

import { FirmSettings } from "./FirmSettings";

const venture = {
  id: "venture-1",
  name: "Northstar",
  repository: "/products/northstar",
  createdAt: "now",
  updatedAt: "now",
};

describe("FirmSettings", () => {
  beforeEach(() => {
    getCredentials.mockReset().mockResolvedValue({ credentials: [] });
    connectGmail.mockReset().mockResolvedValue({
      credential: { provider: "gmail", label: "Gmail (OAuth)", savedAt: "now", hasToken: true, authType: "oauth" },
      credentials: [{ provider: "gmail", label: "Gmail (OAuth)", savedAt: "now", hasToken: true, authType: "oauth" }],
    });
    removeCredential.mockReset().mockResolvedValue({ removed: true, credentials: [] });
    saveCredential.mockReset().mockResolvedValue({
      credential: { provider: "exa", label: "Exa", savedAt: "now", hasToken: true, authType: "token" },
      credentials: [{ provider: "exa", label: "Exa", savedAt: "now", hasToken: true, authType: "token" }],
    });
  });

  it("connects Exa as a read-only research source", async () => {
    const onCapabilitiesChanged = vi.fn();
    render(<FirmSettings venture={venture} onCapabilitiesChanged={onCapabilitiesChanged} onClose={() => undefined} />);
    await screen.findByRole("button", { name: "Connect Exa" });
    fireEvent.click(screen.getByRole("button", { name: "Connect Exa" }));
    fireEvent.change(screen.getByLabelText("Exa API key"), { target: { value: "exa-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Exa key" }));
    await waitFor(() => expect(saveCredential).toHaveBeenCalledWith("exa", "exa-key", "Exa"));
    expect(await screen.findByText("Available to every venture")).toBeTruthy();
    expect(onCapabilitiesChanged).toHaveBeenCalledOnce();
  });

  it("shows only real crew capabilities and connects Gmail through OAuth", async () => {
    const onCapabilitiesChanged = vi.fn();
    render(<FirmSettings venture={venture} onCapabilitiesChanged={onCapabilitiesChanged} onClose={() => undefined} />);

    expect(screen.getByRole("dialog", { name: "Venture settings" })).toBeTruthy();
    expect(screen.getByText("/products/northstar")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Product repository capabilities" })).toHaveTextContent(/read product truth.*apply changes only after your review/i);
    expect(await screen.findByText("Not connected")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Connect Gmail" }));
    fireEvent.change(screen.getByLabelText("Google OAuth client ID"), { target: { value: "client-id" } });
    fireEvent.change(screen.getByLabelText("Google OAuth client secret"), { target: { value: "client-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Google" }));

    await waitFor(() => expect(connectGmail).toHaveBeenCalledWith("client-id", "client-secret"));
    expect(await screen.findByText("Gmail (OAuth) · available to every venture")).toBeTruthy();
    expect(onCapabilitiesChanged).toHaveBeenCalledOnce();
  });

  it("keeps connection and always-on writes unavailable outside the desktop host", async () => {
    render(
      <FirmSettings
        venture={venture}
        readOnly
        readOnlyReason="Desktop host required"
        onClose={() => undefined}
      />,
    );

    expect(await screen.findByRole("button", { name: "Connect Gmail" })).toBeDisabled();
    expect(screen.queryByText(/Heat|always-on/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").some((status) => status.textContent?.includes("Desktop host required"))).toBe(true);
  });

  it("opens the real OAuth replacement form from a failed release reconnect", async () => {
    getCredentials.mockResolvedValue({
      credentials: [{ provider: "gmail", label: "Gmail (OAuth)", savedAt: "now", hasToken: true, authType: "oauth" }],
    });
    render(<FirmSettings venture={venture} initialConnection="gmail" onClose={() => undefined} />);
    expect(await screen.findByRole("group", { name: "Reconnect Gmail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to Google" })).toBeDisabled();
  });
});
