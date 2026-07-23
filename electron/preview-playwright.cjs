// Selector engine only: extracts Playwright's InjectedScript source from the installed
// playwright-core bundle so preview automation can resolve text/role/css locators inside the
// guest page. Playwright itself is never launched; no browser is downloaded or spawned.
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// The bundle inlines each generated script as `sourceN = '...'` inside a module named after its
// source file; the module name is stable across playwright-core versions while the variable
// number is not, so extraction anchors on the name.
const MODULE_MARKER = "generated/injectedScriptSource.ts";
const ASSIGNMENT_PATTERN = /source\d+ = /;
const SOURCE_TERMINATOR = ";\n  }\n});";
const SOURCE_MINIMUM_LENGTH = 100_000;
const SOURCE_EVALUATION_TIMEOUT_MS = 1_000;
const INJECTED_GLOBAL = "__droverPlaywrightInjected";

/** Pull the injected-script source literal out of playwright-core's lib/coreBundle.js. */
function extractInjectedSource(coreBundle, bundlePath) {
  const moduleStart = coreBundle.indexOf(MODULE_MARKER);
  if (moduleStart < 0) throw new Error(`Playwright injected runtime marker was not found in ${bundlePath}.`);
  const assignment = ASSIGNMENT_PATTERN.exec(coreBundle.slice(moduleStart, moduleStart + 2_000));
  if (!assignment) throw new Error(`Playwright injected runtime marker was not found in ${bundlePath}.`);
  const literalStart = moduleStart + assignment.index + assignment[0].length;
  const literalEnd = coreBundle.indexOf(SOURCE_TERMINATOR, literalStart);
  if (literalEnd < 0) throw new Error(`Playwright injected runtime terminator was not found in ${bundlePath}.`);
  const literal = coreBundle.slice(literalStart, literalEnd);
  const source = vm.runInNewContext(literal, Object.create(null), { timeout: SOURCE_EVALUATION_TIMEOUT_MS });
  if (typeof source !== "string" || source.length < SOURCE_MINIMUM_LENGTH) {
    throw new Error(`Playwright injected runtime from ${bundlePath} was ${typeof source}; expected a long string.`);
  }
  return source;
}

let cachedExpression = null;

/**
 * A page expression that installs Playwright's InjectedScript once as
 * `globalThis.__droverPlaywrightInjected` and is safe to evaluate repeatedly.
 */
function playwrightInstallExpression() {
  if (cachedExpression) return cachedExpression;
  const packageJsonPath = require.resolve("playwright-core/package.json");
  const bundlePath = path.join(path.dirname(packageJsonPath), "lib", "coreBundle.js");
  const source = extractInjectedSource(fs.readFileSync(bundlePath, "utf8"), bundlePath);
  const options = JSON.stringify({
    isUnderTest: false,
    sdkLanguage: "javascript",
    testIdAttributeName: "data-testid",
    stableRafCount: 1,
    browserName: "chromium",
    shouldPrependErrorPrefix: false,
    isUtilityWorld: false,
    customEngines: [],
  });
  cachedExpression = `(() => {
    if (globalThis.${INJECTED_GLOBAL}) return true;
    const module = { exports: {} };
    ${source}
    globalThis.${INJECTED_GLOBAL} = new (module.exports.InjectedScript())(globalThis, ${options});
    return true;
  })()`;
  return cachedExpression;
}

module.exports = { extractInjectedSource, playwrightInstallExpression, INJECTED_GLOBAL };
