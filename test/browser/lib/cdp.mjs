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
  // Keep the bundled Electron runtime as a portable CI fallback. Prefer a real browser for visual
  // evidence because Electron's headless software compositor can emit unpainted black tiles.
  path.resolve(import.meta.dirname, "../../../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
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

export async function launchChrome({ port, url, beforeNavigate = null }) {
  const executable = findChrome();
  if (!executable) throw new Error("The browser journey needs Chrome or Chromium. Set CHROME_BIN to a browser executable available in CI.");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "drover-firm-chrome-"));
  const electron = executable.endsWith("/Electron");
  const browserArgs = [
    "--headless",
    "--no-sandbox",
    "--disable-background-networking",
    "--disable-dev-shm-usage",
    ...(electron ? ["--disable-gpu"] : []),
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--enable-automation",
    "--hide-scrollbars",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-first-run",
    "--remote-allow-origins=*",
    "--force-device-scale-factor=1",
    "--window-size=1920,1080",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    electron
      ? path.resolve(import.meta.dirname, "../fixtures/electron-cdp.cjs")
      : "about:blank",
  ];
  const browserEnv = { ...process.env };
  // Codex/T3 shells may export this so Electron-backed Node commands behave like plain Node.
  // The portable browser fallback needs the actual Electron host and Chromium flags instead.
  if (electron) delete browserEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, browserArgs, { env: browserEnv, stdio: ["ignore", "pipe", "pipe"] });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  let client = null;
  const cleanup = async () => {
    await client?.close().catch(() => {});
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        delay(2000).then(() => child.kill("SIGKILL")),
      ]);
    }
    // Chrome may release a final profile file a few milliseconds after the browser process exits.
    // Node's bounded recursive retry handles that local cleanup race without hiding test failures.
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
  };

  try {
    const base = `http://127.0.0.1:${port}`;
    let page;
    // A cold macOS Chrome launch can spend several seconds validating the app bundle before DevTools
    // appears. Keep the deterministic journey patient enough for that first launch without hiding an exit.
    for (let attempt = 0; attempt < 300; attempt += 1) {
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

    client = await CdpClient.connect(page.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__droverUnhandledRejections = [];
      window.__droverPerformance = { cls: 0, inp: 0, lcp: 0 };
      window.__droverLayoutShifts = [];
      window.addEventListener("unhandledrejection", (event) => {
        window.__droverUnhandledRejections.push(String(event.reason?.stack || event.reason || "unknown rejection"));
      });
      if (window.PerformanceObserver) {
        const observe = (type, callback) => {
          if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;
          new PerformanceObserver((list) => callback(list.getEntries())).observe({ type, buffered: true });
        };
        observe("largest-contentful-paint", (entries) => {
          window.__droverPerformance.lcp = entries.at(-1)?.startTime || window.__droverPerformance.lcp;
        });
        observe("layout-shift", (entries) => {
          for (const entry of entries) {
            if (!entry.hadRecentInput) {
              window.__droverPerformance.cls += entry.value;
              window.__droverLayoutShifts.push({
                value: entry.value,
                at: entry.startTime,
                sources: (entry.sources || []).map((source) => ({
                  node: source.node ? [source.node.tagName?.toLowerCase(), source.node.id ? '#' + source.node.id : '', source.node.classList?.length ? '.' + [...source.node.classList].join('.') : ''].join('') : null,
                  previous: source.previousRect ? { x: source.previousRect.x, y: source.previousRect.y, width: source.previousRect.width, height: source.previousRect.height } : null,
                  current: source.currentRect ? { x: source.currentRect.x, y: source.currentRect.y, width: source.currentRect.width, height: source.currentRect.height } : null,
                })),
              });
            }
          }
        });
        observe("event", (entries) => {
          for (const entry of entries) {
            if (entry.interactionId) window.__droverPerformance.inp = Math.max(window.__droverPerformance.inp, entry.duration);
          }
        });
      }
    `,
    });
    if (beforeNavigate) await beforeNavigate(client);
    await client.send("Page.navigate", { url });
    return { child, client, userDataDir, close: cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
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
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
    socket.on("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Chrome DevTools closed before the command completed."));
      }
      this.pending.clear();
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
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome DevTools did not answer ${method} within 15 seconds.`));
      }, 15_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Chrome DevTools closed before the command completed."));
      }
      this.pending.clear();
      return;
    }
    this.socket.close();
    await Promise.race([
      new Promise((resolve) => this.socket.once("close", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
  }
}
