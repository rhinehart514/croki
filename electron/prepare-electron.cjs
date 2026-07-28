// npm may suppress dependency install scripts. Resolve Electron explicitly so its pinned Chromium
// binary is present for the desktop product and the deterministic browser-journey fallback.
const fs = require("node:fs");
const executable = require("electron");

if (!fs.existsSync(executable)) {
  throw new Error(`Electron executable is missing after installation: ${executable}`);
}
