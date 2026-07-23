import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { browserReadAvailability, buildBrowserReadTools, readBrowserPage } from "../src/connected-read-capabilities.mjs";

describe("Croki browser read capability", () => {
  it("reports the host executable honestly", () => {
    assert.deepEqual(browserReadAvailability({ env: { DROVER_BROWSER_PATH: "/browser" }, platform: "test", existsSync: (path) => path === "/browser" }), {
      available: true,
      executablePath: "/browser",
      reason: null,
    });
    assert.equal(browserReadAvailability({ env: {}, platform: "test", existsSync: () => false }).available, false);
  });

  it("does not expose a tool when no browser can run", () => {
    assert.deepEqual(buildBrowserReadTools({ availability: { available: false, executablePath: null, reason: "missing" } }), []);
  });

  it("uses a fresh bounded context and always closes the browser", async () => {
    const calls = [];
    const page = {
      setDefaultTimeout(value) { calls.push(["timeout", value]); },
      async goto(url, options) { calls.push(["goto", url, options]); },
      async title() { return "Example"; },
      url() { return "https://example.com/final"; },
      locator(selector) {
        if (selector === "body") return { innerText: async () => "Rendered evidence" };
        return { evaluateAll: async () => [{ label: "Source", url: "https://example.com/source" }] };
      },
    };
    let closed = false;
    const launch = async (options) => ({
      async newContext(contextOptions) {
        calls.push(["context", contextOptions]);
        return { newPage: async () => page };
      },
      async close() { closed = true; },
      options,
    });
    const result = await readBrowserPage({ url: "https://user:secret@example.com/start" }, {
      availability: { available: true, executablePath: "/browser", reason: null },
      launch,
    });
    assert.equal(result.source.url, "https://example.com/final");
    assert.equal(result.text, "Rendered evidence");
    assert.equal(result.links.length, 1);
    assert.equal(closed, true);
    assert.equal(calls.find(([kind]) => kind === "goto")[1], "https://example.com/start");
    assert.deepEqual(calls.find(([kind]) => kind === "context")[1].permissions, []);
    assert.equal(calls.find(([kind]) => kind === "context")[1].serviceWorkers, "block");
  });

  it("rejects non-web protocols before launching", async () => {
    await assert.rejects(
      () => readBrowserPage({ url: "file:///etc/passwd" }, { availability: { available: true, executablePath: "/browser" }, launch: async () => { throw new Error("should not launch"); } }),
      /HTTP or HTTPS/,
    );
  });
});
