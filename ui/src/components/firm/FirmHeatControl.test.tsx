import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getHeatSettings = vi.fn();
const setHeatSettings = vi.fn();

vi.mock("@/api", () => ({
  getHeatSettings: (...args: unknown[]) => getHeatSettings(...args),
  setHeatSettings: (...args: unknown[]) => setHeatSettings(...args),
}));

import { FirmHeatControl } from "./FirmHeatControl";

describe("FirmHeatControl", () => {
  beforeEach(() => {
    getHeatSettings.mockReset().mockResolvedValue({ heat: "steady", dailySpendUsd: 8 });
    setHeatSettings.mockReset().mockResolvedValue({ heat: "off", dailySpendUsd: 8 });
  });

  it("turns always-on work off without discarding the saved daily limit", async () => {
    const view = render(<FirmHeatControl ventureId="venture-1" />);
    const toggle = await screen.findByRole("checkbox");
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.getByText("No unattended model work")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save setting" }));
    await waitFor(() => expect(setHeatSettings).toHaveBeenCalledWith("venture-1", { heat: "off", dailySpendUsd: 8 }));
    view.unmount();
  });

  it("keeps settings visible but disables changes while the shell is read-only", async () => {
    const view = render(<FirmHeatControl ventureId="venture-1" />);
    await screen.findByRole("checkbox");

    view.rerender(
      <FirmHeatControl
        ventureId="venture-1"
        readOnly
        readOnlyReason="Connection lost. Reconnecting…"
      />,
    );

    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByLabelText("Daily spend")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Connection lost. Reconnecting…");
    await waitFor(() => expect(setHeatSettings).not.toHaveBeenCalled());
  });
});
