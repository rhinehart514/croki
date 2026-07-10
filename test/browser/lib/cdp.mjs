import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import WebSocket from "ws";

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}

export function findChrome() {
  return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export async function launchChrome({ port, url }) {
  const executable = findChrome();
  if (!executable) throw new Error("Gate B needs Chrome or Chromium. Set CHROME_BIN to a browser executable available in CI.");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "drover-terrain-chrome-"));
  const child = spawn(executable, [
    "--headless=new",
    "--no-sandbox",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const base = `http://127.0.0.1:${port}`;
  let page;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools was ready: ${stderr.trim()}`);
    try {
      const pages = await json(`${base}/json/list`);
      page = pages.find((item) => item.type === "page");
      if (page?.webSocketDebuggerUrl) break;
    } catch {
      // Chrome has not opened the DevTools port yet.
    }
    await delay(50);
  }
  if (!page?.webSocketDebuggerUrl) throw new Error(`Chrome did not expose a page target on ${base}. ${stderr.trim()}`);

  const client = await CdpClient.connect(page.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__droverUnhandledRejections = [];
      window.__droverTerrainCounts = [];
      window.addEventListener("unhandledrejection", (event) => {
        window.__droverUnhandledRejections.push(String(event.reason?.stack || event.reason || "unknown rejection"));
      });
      window.addEventListener("DOMContentLoaded", () => {
        const recordTerrainCount = () => {
          const count = document.querySelectorAll('[data-testid="terrain-hypothesis"]').length;
          if (count > 0 && window.__droverTerrainCounts.at(-1) !== count) window.__droverTerrainCounts.push(count);
        };
        new MutationObserver(recordTerrainCount).observe(document.documentElement, { childList: true, subtree: true });
        recordTerrainCount();
      });
    `,
  });
  await client.send("Page.navigate", { url });
  return {
    child,
    client,
    userDataDir,
    async close() {
      await client.close().catch(() => {});
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        delay(2000).then(() => child.kill("SIGKILL")),
      ]);
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

export class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return new CdpClient(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    this.socket.close();
    await Promise.race([
      new Promise((resolve) => this.socket.once("close", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
  }
}
