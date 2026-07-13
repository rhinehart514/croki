import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GateDeltaCard } from "./GateDeltaCard";

describe("GateDeltaCard", () => {
  it("requires a second authorization before shipping a code-native change", async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);

    render(
      <GateDeltaCard
        delta={{
          kind: "change",
          title: "A reviewed product change",
          files: [{ path: "ui/src/App.tsx" }],
          deployConfirmable: true,
          shipPath: "opens a pull request on your repo",
        }}
        onDecide={onDecide}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ship it live/i }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByText(/opens a pull request on your repo/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(onDecide).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /ship it live/i }));
    fireEvent.click(screen.getByRole("button", { name: "Ship it live" }));

    await waitFor(() => {
      expect(onDecide).toHaveBeenCalledWith({ decision: "ship", deployConfirmed: true });
    });
  });
});
