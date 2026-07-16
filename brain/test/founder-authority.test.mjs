import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  __resetFounderCapabilityReplayGuard,
  authorizeFounderWriteForRequest,
  founderAuthorityStatus,
} from "../src/routes/founder-authority.mjs";
import systemRoutes, { shellStatus } from "../src/routes/system.mjs";
import { founderHeaders, founderRequest, TEST_FOUNDER_CAPABILITY } from "./helpers/founder-capability.mjs";

describe("desktop-host founder authority", () => {
  it("exposes a stable server instance and an honest host-authority status for shell freshness", () => {
    const first = shellStatus();
    const second = shellStatus();
    assert.equal(first.instanceId, second.instanceId);
    assert.ok(Date.parse(first.startedAt));
    assert.equal(first.founderAuthority.available, true);
    assert.equal(first.founderAuthority.header, "x-drover-founder-capability");
    assert.equal(first.founderAuthority.replayWindowMs, 30_000);
  });

  it("rejects an unstamped loopback client and accepts a fresh host-signed request", () => {
    assert.throws(
      () => authorizeFounderWriteForRequest({ method: "POST", url: "/api/test", headers: {} }, "Testing a founder write"),
      (error) => error?.status === 403 && error?.code === "founder_capability_invalid",
    );
    assert.doesNotThrow(() => authorizeFounderWriteForRequest(founderRequest(), "Testing a founder write"));
  });

  it("refuses model and MCP traffic even when it carries a valid signed claim", () => {
    const req = founderRequest({ headers: { "x-gtm-actor": " Agent " } });
    assert.throws(
      () => authorizeFounderWriteForRequest(req, "Testing a founder write"),
      (error) => error?.status === 403 && error?.code === "founder_decision_forbidden" && /model or MCP/i.test(error.message),
    );
  });

  it("accepts Drover's same origin and refuses a cross-origin request", () => {
    assert.doesNotThrow(() => authorizeFounderWriteForRequest(founderRequest({
      path: "/api/test",
      origin: "http://127.0.0.1:4317",
    })));
    assert.throws(
      () => authorizeFounderWriteForRequest(founderRequest({ path: "/api/test", origin: "https://attacker.example" })),
      (error) => error?.status === 403 && /local Drover page/i.test(error.message),
    );
  });

  it("binds a claim to one method and path", () => {
    const headers = founderHeaders({ method: "POST", path: "/api/ventures/a/heat" });
    assert.throws(
      () => authorizeFounderWriteForRequest({ method: "POST", url: "/api/ventures/b/heat", headers }),
      (error) => error?.code === "founder_capability_invalid" && /mismatched/i.test(error.message),
    );
  });

  it("rejects a claim signed by an earlier desktop boot", () => {
    const path = "/api/ventures/a/heat";
    const headers = founderHeaders({ method: "POST", path, secret: "an-earlier-desktop-secret" });
    assert.throws(
      () => authorizeFounderWriteForRequest({ method: "POST", url: path, headers }),
      (error) => error?.code === "founder_capability_invalid" && /forged or mismatched/i.test(error.message),
    );
  });

  it("refuses stale and replayed claims", () => {
    const stale = founderRequest({ issuedAt: Date.now() - 31_000 });
    assert.throws(() => authorizeFounderWriteForRequest(stale), (error) => error?.code === "founder_capability_stale");

    __resetFounderCapabilityReplayGuard();
    const once = founderRequest();
    authorizeFounderWriteForRequest(once);
    assert.throws(() => authorizeFounderWriteForRequest(once), (error) => error?.code === "founder_capability_replayed");
  });

  it("fails closed without the desktop-host secret or a real request", () => {
    assert.equal(founderAuthorityStatus({}).available, false);
    assert.equal(founderAuthorityStatus({ GTM_IDE_FOUNDER_CAPABILITY: TEST_FOUNDER_CAPABILITY }).available, true);
    assert.throws(
      () => authorizeFounderWriteForRequest({ method: "POST", url: "/", headers: {} }, "Testing", { env: {} }),
      (error) => error?.status === 503 && error?.code === "founder_host_unavailable",
    );
    for (const request of [undefined, null, {}, { headers: null }, { headers: "not-headers" }]) {
      assert.throws(() => authorizeFounderWriteForRequest(request), /local Drover page/i);
    }
  });

  it("keeps the development founder hatch explicit, local, and unavailable to agents", () => {
    const localRequest = (headers = {}, remoteAddress = "127.0.0.1") => ({
      method: "POST",
      url: "/api/test",
      headers: {
        host: "127.0.0.1:4317",
        origin: "http://127.0.0.1:4317",
        ...headers,
      },
      socket: { remoteAddress },
    });
    const enabled = { DROVER_DEV_FOUNDER: "1" };

    assert.equal(founderAuthorityStatus({}).available, false);
    assert.throws(
      () => authorizeFounderWriteForRequest(localRequest(), "Testing", { env: {} }),
      (error) => error?.code === "founder_host_unavailable",
    );
    assert.deepEqual(
      founderAuthorityStatus(enabled),
      {
        available: true,
        transport: "development-loopback",
        header: "x-drover-founder-capability",
        replayWindowMs: 30_000,
      },
    );
    assert.doesNotThrow(
      () => authorizeFounderWriteForRequest(localRequest(), "Testing", { env: enabled }),
    );
    assert.throws(
      () => authorizeFounderWriteForRequest(
        localRequest({ "x-gtm-actor": "agent" }),
        "Testing",
        { env: enabled },
      ),
      (error) => error?.code === "founder_decision_forbidden",
    );
    assert.throws(
      () => authorizeFounderWriteForRequest(localRequest({}, "192.0.2.10"), "Testing", { env: enabled }),
      (error) => error?.code === "founder_decision_forbidden" && /outside loopback/i.test(error.message),
    );
  });
});

describe("removed founder-session endpoint", () => {
  for (const method of ["GET", "POST"]) {
    it(`does not claim ${method} /api/founder-session`, async () => {
      const handled = await systemRoutes({
        req: { method, headers: {} },
        res: {},
        url: new URL("/api/founder-session", "http://local"),
      });
      assert.equal(handled, false);
    });
  }
});
