// Desktop shell security helpers: safe external destinations, renderer navigation lockdown, and
// login-shell PATH capture. Pure logic lives here so the Electron suite can prove it without a
// running shell.
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).

const fs = require("node:fs");
const path = require("node:path");

function externalHttpUrl(rawUrl) {
  const url = new URL(String(rawUrl ?? ""));
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("External links must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("External links cannot contain credentials.");
  return url.toString();
}

// T3's ElectronShell.parseSafeExternalUrl without Effect/Option: the normalized URL when the
// destination is a credential-free http(s) link, null for everything else. Never throws, so window
// open and navigation handlers can call it unconditionally.
function parseSafeExternalUrl(rawUrl) {
  try {
    return externalHttpUrl(rawUrl);
  } catch {
    return null;
  }
}

// The main window renders exactly one local document. The only in-window navigation that is ever
// legitimate is back to that same file (a reload); anything else must be blocked by the caller and,
// when it is a safe external link, handed to the real browser instead.
function isAllowedRendererNavigation(applicationUrl, navigationUrl) {
  try {
    const application = new URL(String(applicationUrl ?? ""));
    const navigation = new URL(String(navigationUrl ?? ""));
    return (
      application.protocol === "file:" &&
      navigation.protocol === "file:" &&
      navigation.pathname === application.pathname
    );
  } catch {
    return false;
  }
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

// Merge PATH-style lists in priority order, keeping the first appearance of each entry. The login
// shell's PATH leads so the founder's tool versions win, the inherited PATH follows so nothing the
// process already resolved disappears, and known CLI directories close the gaps.
function mergePathLists(lists, delimiter = ":") {
  const entries = [];
  const seen = new Set();
  for (const list of lists) {
    for (const entry of String(list ?? "").split(delimiter)) {
      const trimmed = entry.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      entries.push(trimmed);
    }
  }
  return entries.join(delimiter);
}

module.exports = { externalHttpUrl, parseSafeExternalUrl, isAllowedRendererNavigation, resolveLoginShell, mergePathLists };
