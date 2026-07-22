const fs = require("node:fs");
const path = require("node:path");

function externalHttpUrl(rawUrl) {
  const url = new URL(String(rawUrl ?? ""));
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("External links must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("External links cannot contain credentials.");
  return url.toString();
}

function resolveLoginShell(candidate, fallback = "/bin/zsh") {
  const value = String(candidate ?? "");
  if (!path.isAbsolute(value)) return fallback;
  try {
    if (!fs.statSync(value).isFile()) return fallback;
    fs.accessSync(value, fs.constants.X_OK);
    return value;
  } catch {
    return fallback;
  }
}

module.exports = { externalHttpUrl, resolveLoginShell };
