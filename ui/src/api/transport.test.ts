import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, noteWorkProjectionRevision, request } from "./transport";

function desktopRequestBridge() {
  const invoke = vi.fn(async () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
  }));
  Object.assign(window, { droverDesktop: { api: { request: invoke } } });
  return invoke;
}

describe("ordered Work command metadata", () => {
  afterEach(() => {
    delete window.droverDesktop;
  });

  it("stamps mutation identity and exact route scope below caller headers", async () => {
    const invoke = desktopRequestBridge();
    await request("/api/ventures/venture-a/threads/thread-1/runs/run-2/review", {
      method: "PUT",
      body: JSON.stringify({ expectedProjectionRevision: 7 }),
    });

    const input = invoke.mock.calls[0][0];
    expect(input.headers["x-drover-idempotency-key"]).toMatch(/^[-\w]+/);
    expect(input.headers["x-drover-venture-id"]).toBe("venture-a");
    expect(input.headers["x-drover-thread-id"]).toBe("thread-1");
    expect(input.headers["x-drover-run-id"]).toBe("run-2");
    expect(input.headers["x-drover-expected-projection-revision"]).toBe("7");
  });

  it("gives distinct commands distinct keys and leaves reads command-free", async () => {
    const invoke = desktopRequestBridge();
    await request("/api/ventures/venture-a/work-index", { method: "POST", body: "{}" });
    await request("/api/ventures/venture-a/work-index", { method: "POST", body: "{}" });
    await request("/api/ventures/venture-a/work-index");

    expect(invoke.mock.calls[0][0].headers["x-drover-idempotency-key"])
      .not.toBe(invoke.mock.calls[1][0].headers["x-drover-idempotency-key"]);
    expect(invoke.mock.calls[2][0].headers["x-drover-idempotency-key"]).toBeUndefined();
  });

  it("reuses an idempotency key only while a response is ambiguous", async () => {
    const invoke = vi.fn()
      .mockRejectedValueOnce(new Error("transport disconnected"))
      .mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true }),
      });
    Object.assign(window, { droverDesktop: { api: { request: invoke } } });
    const path = "/api/ventures/venture-retry/threads/thread-1/pin";
    const init = { method: "PUT", body: JSON.stringify({ pinned: true }) };

    await expect(request(path, init)).rejects.toBeInstanceOf(ApiError);
    await request(path, init);
    await request(path, init);

    const [ambiguous, retry, later] = invoke.mock.calls.map(([input]) => (
      input.headers["x-drover-idempotency-key"]
    ));
    expect(retry).toBe(ambiguous);
    expect(later).not.toBe(retry);
  });

  it("stamps the latest ordered Work projection revision when the body has no route revision", async () => {
    const invoke = desktopRequestBridge();
    noteWorkProjectionRevision("venture-current", 23);
    await request("/api/ventures/venture-current/threads/thread-1/pin", {
      method: "PUT",
      body: JSON.stringify({ pinned: true }),
    });
    expect(invoke.mock.calls[0][0].headers["x-drover-expected-projection-revision"]).toBe("23");
  });
});
