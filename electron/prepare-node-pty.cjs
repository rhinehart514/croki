// node-pty 1.1.0's macOS package can arrive with its spawn helper missing the executable bit.
// Repair the exact installed helper before development or packaging; other platforms do not use it.
if (process.platform === "darwin") {
  const fs = require("node:fs");
  const path = require("node:path");
  const packageRoot = path.dirname(require.resolve("node-pty/package.json"));
  const helper = path.join(packageRoot, "prebuilds", `darwin-${process.arch}`, "spawn-helper");
  if (!fs.existsSync(helper)) throw new Error(`node-pty spawn helper is missing: ${helper}`);
  fs.chmodSync(helper, 0o755);
}
