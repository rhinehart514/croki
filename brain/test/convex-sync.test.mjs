import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { pullTeamDocuments, syncEnabled } from "../src/convex-sync.mjs";

// These guard the local-only boot path: with no team configured, the syncer must NOT reach for the
// network and must NOT report a sync that didn't happen. The server boot relies on the `disabled` flag
// to stay quiet instead of logging an alarming "pulled 0" / "pull failed" line.
describe("convex-sync unconfigured path", () => {
  const saved = {};
  const keys = ["GTM_IDE_CONVEX_URL", "GTM_IDE_TEAM_ID"];

  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k];
    for (const k of keys) delete process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reports sync off when no team is configured", () => {
    assert.equal(syncEnabled(), false);
  });

  it("does not attempt a fetch and returns disabled when unconfigured", async () => {
    let fetched = false;
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => {
      fetched = true;
      throw new Error("fetch should not be called when Convex is unconfigured");
    };
    try {
      const result = await pullTeamDocuments();
      assert.equal(fetched, false, "no network call may happen for a local-only deployment");
      assert.equal(result.disabled, true);
      assert.equal(result.pulled, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
