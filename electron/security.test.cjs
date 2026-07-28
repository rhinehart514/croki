const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");

const {
  externalHttpUrl,
  parseSafeExternalUrl,
  parseLoopbackDevServerUrl,
  isAllowedRendererNavigation,
  isAllowedFounderMediaPermission,
  resolveLoginShell,
  mergePathLists,
} = require("./security.cjs");

test("external destinations allow only credential-free HTTP and HTTPS URLs", () => {
  assert.equal(externalHttpUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(externalHttpUrl("http://127.0.0.1:4317/"), "http://127.0.0.1:4317/");
  for (const value of ["file:///tmp/secret", "javascript:alert(1)", "data:text/plain,x", "drover://open", "https://user:secret@example.com", "not a url"]) {
    assert.throws(() => externalHttpUrl(value));
  }
});

test("parseSafeExternalUrl returns the safe URL or null and never throws", () => {
  assert.equal(parseSafeExternalUrl("https://example.com/docs"), "https://example.com/docs");
  for (const value of ["file:///tmp/secret", "javascript:alert(1)", "https://user:secret@example.com", "", null, undefined, 42]) {
    assert.equal(parseSafeExternalUrl(value), null);
  }
});

test("renderer navigation is allowed only back to the exact local application document", () => {
  const applicationUrl = "file:///Users/founder/drover/ui/dist/index.html";
  assert.equal(isAllowedRendererNavigation(applicationUrl, applicationUrl), true);
  assert.equal(isAllowedRendererNavigation(applicationUrl, `${applicationUrl}?query=1`), true, "query reloads stay in-window");
  for (const navigation of [
    "file:///Users/founder/drover/ui/dist/other.html",
    "file:///etc/passwd",
    "https://example.com/",
    "javascript:alert(1)",
    "not a url",
  ]) {
    assert.equal(isAllowedRendererNavigation(applicationUrl, navigation), false, navigation);
  }
  assert.equal(isAllowedRendererNavigation("https://example.com/app", "https://example.com/app"), false, "non-file, non-loopback application URLs never authorize navigation");
});

test("the dev-server hatch accepts only credential-free plain-http loopback origins", () => {
  assert.equal(parseLoopbackDevServerUrl("http://127.0.0.1:5173"), "http://127.0.0.1:5173/");
  assert.equal(parseLoopbackDevServerUrl("http://localhost:5173/anything?x=1"), "http://localhost:5173/", "normalizes to the bare origin");
  for (const value of [
    "https://127.0.0.1:5173",
    "http://192.168.1.20:5173",
    "http://evil.example.com",
    "http://user:secret@127.0.0.1:5173",
    "file:///tmp/index.html",
    "",
    null,
    undefined,
  ]) {
    assert.equal(parseLoopbackDevServerUrl(value), null, String(value));
  }
});

test("with a loopback dev-server document, navigation stays on that exact origin", () => {
  const devUrl = "http://127.0.0.1:5173/";
  assert.equal(isAllowedRendererNavigation(devUrl, devUrl), true);
  assert.equal(isAllowedRendererNavigation(devUrl, "http://127.0.0.1:5173/index.html?reload=1"), true, "reloads stay in-window");
  for (const navigation of [
    "http://127.0.0.1:4317/api/health",
    "http://localhost:5173/",
    "https://example.com/",
    "file:///Users/founder/drover/ui/dist/index.html",
    "javascript:alert(1)",
  ]) {
    assert.equal(isAllowedRendererNavigation(devUrl, navigation), false, navigation);
  }
});

test("login shell resolution accepts only an absolute executable file", () => {
  const executable = process.platform === "win32" ? process.execPath : "/bin/sh";
  assert.equal(resolveLoginShell(executable, process.execPath), executable);
  assert.equal(resolveLoginShell("sh", process.execPath), process.execPath);
  assert.equal(resolveLoginShell(os.tmpdir(), process.execPath), process.execPath);
  assert.equal(resolveLoginShell("/definitely/missing/drover-shell", process.execPath), process.execPath);
});

test("PATH merge keeps login-shell priority, deduplicates, and drops empty entries", () => {
  const merged = mergePathLists([
    "/opt/homebrew/bin:/usr/bin",
    "/usr/bin:/bin: :",
    "/Users/founder/.claude/local",
  ]);
  assert.equal(merged, "/opt/homebrew/bin:/usr/bin:/bin:/Users/founder/.claude/local");
  assert.equal(mergePathLists([null, undefined, ""]), "");
});

test("voice grants only microphone media to the exact founder window", () => {
  assert.equal(isAllowedFounderMediaPermission({
    isFounderWindow: true,
    permission: "media",
    mediaTypes: ["audio"],
  }), true);
  for (const input of [
    { isFounderWindow: false, permission: "media", mediaTypes: ["audio"] },
    { isFounderWindow: true, permission: "media", mediaTypes: ["video"] },
    { isFounderWindow: true, permission: "media", mediaTypes: ["audio", "video"] },
    { isFounderWindow: true, permission: "display-capture", mediaTypes: ["audio"] },
    { isFounderWindow: true, permission: "media", mediaTypes: [] },
  ]) {
    assert.equal(isAllowedFounderMediaPermission(input), false);
  }
});
