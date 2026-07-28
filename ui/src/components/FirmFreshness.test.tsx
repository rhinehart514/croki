import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FirmFreshness } from "./FirmFreshness";

describe("FirmFreshness layered recovery", () => {
  it("names the engine layer, retained state, and one scoped retry without raw transport copy", () => {
    const retry = vi.fn();
    render(<FirmFreshness
      connection={{
        phase: "stale",
        lastUpdatedAt: Date.now(),
        retryAt: null,
        failures: 1,
        layer: "engine",
        message: "/api/private failed (502) token=sk-secret",
      }}
      onRetry={retry}
    />);

    expect(screen.getByRole("status")).toHaveTextContent("Work engine reconnecting");
    expect(screen.getByRole("status")).toHaveTextContent("transcript, draft, and last Review remain visible");
    expect(screen.getByRole("status")).not.toHaveTextContent(/\/api\/|502|sk-secret/i);
    fireEvent.click(screen.getByRole("button", { name: "Retry engine" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("distinguishes an offline connection from an engine failure", () => {
    render(<FirmFreshness
      connection={{
        phase: "offline",
        lastUpdatedAt: Date.now(),
        retryAt: null,
        failures: 1,
        layer: "transport",
        message: null,
      }}
      onRetry={vi.fn()}
    />);
    expect(screen.getByRole("status")).toHaveTextContent("Connection offline");
    expect(screen.getByRole("button", { name: "Retry connection" })).toBeInTheDocument();
  });
});
