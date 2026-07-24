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

// Development hatch: an unpackaged launch may load the renderer from a local Vite dev server so
// UI edits go live without a rebuild. Only a credential-free plain-http loopback origin qualifies;
// anything else returns null and the shell keeps its file-only document. This never defines a
// production surface — packaged launches ignore it entirely.
function parseLoopbackDevServerUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl ?? ""));
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "http:" || !loopback || url.username || url.password) return null;
    return `${url.origin}/`;
  } catch {
    return null;
  }
}

// The main window renders exactly one local document. The only in-window navigation that is ever
// legitimate is back to that same file (a reload); anything else must be blocked by the caller and,
// when it is a safe external link, handed to the real browser instead. When the application URL is
// the loopback dev server, reloads and HMR full-page fallbacks stay on that exact origin.
function isAllowedRendererNavigation(applicationUrl, navigationUrl) {
  try {
    const application = new URL(String(applicationUrl ?? ""));
    const navigation = new URL(String(navigationUrl ?? ""));
    if (application.protocol === "file:") {
      return navigation.protocol === "file:" && navigation.pathname === application.pathname;
    }
    return parseLoopbackDevServerUrl(application.href) !== null && navigation.origin === application.origin;
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

module.exports = { externalHttpUrl, parseSafeExternalUrl, parseLoopbackDevServerUrl, isAllowedRendererNavigation, resolveLoginShell, mergePathLists };
