const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");

const { externalHttpUrl, resolveLoginShell } = require("./security.cjs");

test("external destinations allow only credential-free HTTP and HTTPS URLs", () => {
  assert.equal(externalHttpUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(externalHttpUrl("http://127.0.0.1:4317/"), "http://127.0.0.1:4317/");
  for (const value of ["file:///tmp/secret", "javascript:alert(1)", "data:text/plain,x", "drover://open", "https://user:secret@example.com", "not a url"]) {
    assert.throws(() => externalHttpUrl(value));
  }
});

test("login shell resolution accepts only an absolute executable file", () => {
  const executable = process.platform === "win32" ? process.execPath : "/bin/sh";
  assert.equal(resolveLoginShell(executable, process.execPath), executable);
  assert.equal(resolveLoginShell("sh", process.execPath), process.execPath);
  assert.equal(resolveLoginShell(os.tmpdir(), process.execPath), process.execPath);
  assert.equal(resolveLoginShell("/definitely/missing/drover-shell", process.execPath), process.execPath);
});
