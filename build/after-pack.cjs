// electron-builder afterPack hook.
//
// Local builds have no Apple Developer identity. Ad-hoc sign the complete bundle before the DMG is
// sealed so macOS sees one coherent local application.
const { execSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  // --deep ad-hoc sign (-s -) covers Electron, helpers, and frameworks. --force replaces inherited
  // ad-hoc signatures.
  execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: "inherit" });
};
