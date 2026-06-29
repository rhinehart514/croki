// electron-builder afterPack hook.
//
// We ship UNSIGNED (no Apple Developer identity). But the bundled Electron binary is itself ad-hoc /
// linker-signed, and macOS Library Validation will SIGKILL the process the moment it loads a native
// module (better-sqlite3) that isn't part of that same signature. The fix that works for a local,
// single-user build is to ad-hoc sign the WHOLE bundle as one unit, so the native binding is no
// longer foreign unsigned code — it shares the bundle's ad-hoc signature. This runs before the .dmg
// is sealed, so the disk image carries a launchable app.
const { execSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  // --deep ad-hoc sign (-s -): one signature across Electron, helpers, frameworks, and the rebuilt
  // better-sqlite3 binding. --force replaces the inherited ad-hoc signatures.
  execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: "inherit" });
};
