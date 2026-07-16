import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCredentials = vi.fn();
const connectGmail = vi.fn();
const removeCredential = vi.fn();
const getHeatSettings = vi.fn();
const setHeatSettings = vi.fn();

vi.mock("@/api", () => ({
  getCredentials: (...args: unknown[]) => getCredentials(...args),
  connectGmail: (...args: unknown[]) => connectGmail(...args),
  removeCredential: (...args: unknown[]) => removeCredential(...args),
  getHeatSettings: (...args: unknown[]) => getHeatSettings(...args),
  setHeatSettings: (...args: unknown[]) => setHeatSettings(...args),
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
    getHeatSettings.mockReset().mockResolvedValue({ heat: "off", dailySpendUsd: 0 });
    setHeatSettings.mockReset().mockResolvedValue({ heat: "off", dailySpendUsd: 0 });
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
    expect(await screen.findByRole("checkbox")).toBeDisabled();
    expect(screen.getAllByRole("status").some((status) => status.textContent?.includes("Desktop host required"))).toBe(true);
  });
});
