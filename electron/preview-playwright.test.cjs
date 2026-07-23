const assert = require("node:assert/strict");
const test = require("node:test");
const { extractInjectedSource, playwrightInstallExpression, INJECTED_GLOBAL } = require("./preview-playwright.cjs");

const LONG_SOURCE = "x".repeat(120_000);
const syntheticBundle = (literal) =>
  `var bundle = ({\n  "generated/injectedScriptSource.ts"() {\n    "use strict";\n    source4 = ${literal};\n  }\n});`;

test("extractInjectedSource pulls the injected-script literal out of a core bundle", () => {
  const source = extractInjectedSource(syntheticBundle(JSON.stringify(LONG_SOURCE)), "/tmp/coreBundle.js");
  assert.equal(source, LONG_SOURCE);
});

test("extractInjectedSource fails honestly when the bundle shape changes", () => {
  assert.throws(() => extractInjectedSource("nothing here", "/tmp/coreBundle.js"), /marker was not found/);
  assert.throws(() => extractInjectedSource('"generated/injectedScriptSource.ts"() { source4 = "short";', "/tmp/coreBundle.js"), /terminator was not found/);
  assert.throws(
    () => extractInjectedSource(syntheticBundle('"too short"'), "/tmp/coreBundle.js"),
    /expected a long string/,
  );
});

test("extraction evaluates the literal in an empty sandbox, not this process", () => {
  const literal = `(globalThis.leaked = true, ${JSON.stringify(LONG_SOURCE)})`;
  assert.equal(extractInjectedSource(syntheticBundle(literal), "/tmp/coreBundle.js"), LONG_SOURCE);
  assert.equal("leaked" in globalThis, false);
});

test("playwrightInstallExpression builds one idempotent installer from the real installed bundle", () => {
  const expression = playwrightInstallExpression();
  assert.equal(typeof expression, "string");
  assert.ok(expression.includes(`globalThis.${INJECTED_GLOBAL}`), "installs under the drover global");
  assert.ok(expression.includes("InjectedScript"), "wraps Playwright's InjectedScript");
  assert.ok(expression.includes('"testIdAttributeName":"data-testid"'), "keeps the standard test id attribute");
  assert.equal(playwrightInstallExpression(), expression, "the expression is cached, not re-read per call");
});
