import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePresence } from "./usePresence";

function PresenceProbe({ authenticated, onUnauthorized }: { authenticated: boolean; onUnauthorized?: () => void }) {
  const presence = usePresence(authenticated, onUnauthorized);
  return <output>{presence?.state ?? "unknown"}</output>;
}

describe("usePresence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not attempt a present heartbeat before the founder session is unlocked", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PresenceProbe authenticated={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts heartbeats after the founder session is authenticated", async () => {
    const state = { state: "present", present: true, outwardHold: false, detection: "automatic", leaseMs: 45_000 };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => state });
    vi.stubGlobal("fetch", fetchMock);
    const { getByText, unmount } = render(<PresenceProbe authenticated />);

    await waitFor(() => expect(getByText("present")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/presence", expect.objectContaining({ method: "POST" }));
    unmount();
  });

  it("returns the app to its locked state when a saved session cookie is no longer valid", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    render(<PresenceProbe authenticated onUnauthorized={onUnauthorized} />);

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  });
});
