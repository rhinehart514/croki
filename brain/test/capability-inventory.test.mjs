import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilityInventory } from "../src/connected-read-capabilities.mjs";

describe("runtime capability inventory", () => {
  it("separates reads from outward authority and reports unavailable capabilities", () => {
    const inventory = capabilityInventory({
      credentials: [{ provider: "gmail", hasToken: true, accountAddress: "founder@example.com" }],
      browser: { available: false, reason: "No browser" },
    });
    assert.equal(inventory.find((item) => item.id === "browser").status, "unavailable");
    assert.equal(inventory.find((item) => item.id === "exa.search").status, "unavailable");
    assert.equal(inventory.find((item) => item.id === "gmail.read").authority, "read");
    assert.equal(inventory.find((item) => item.id === "gmail.send").authority, "founder-gate");
    assert.equal(inventory.find((item) => item.id === "gmail.send").accountAddress, "founder@example.com");
  });
});
