import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { CdpClient } from "./cdp.mjs";

const ELECTRON = path.resolve(import.meta.dirname, "../../../node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export async function launchDroverElectron({ root, home, port }) {
  if (!fs.existsSync(ELECTRON)) throw new Error(`Electron is not installed at ${ELECTRON}`);
  const childEnv = { ...process.env, GTM_IDE_HOME: home, GTM_IDE_PERSISTENCE: "json", GTM_IDE_DISABLE_CLAUDE_CODE: "1" };
  // Codex and some package runners set this for their own Electron-based host. It would turn the
  // product under test into a plain Node process, so the native acceptance child must not inherit it.
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const child = spawn(ELECTRON, [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-allow-origins=*",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(home, "electron-profile")}`,
    root,
  ], {
    cwd: root,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  let client = null;
  try {
    const endpoint = `http://127.0.0.1:${port}`;
    let page = null;
    for (let attempt = 0; attempt < 400; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Electron exited before Drover opened.\n${output}`);
      try {
        const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
        page = targets.find((target) => target.type === "page" && /^http:\/\/127\.0\.0\.1:/.test(target.url));
        if (page?.webSocketDebuggerUrl) break;
      } catch { /* the actual Electron host is still booting */ }
      await delay(50);
    }
    if (!page?.webSocketDebuggerUrl) throw new Error(`Electron did not expose the Drover renderer.\n${output}`);
    client = await CdpClient.connect(page.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    return {
      child,
      client,
      output: () => output,
      async close() {
        await client?.close().catch(() => {});
        if (child.exitCode === null) {
          child.kill("SIGTERM");
          await Promise.race([
            new Promise((resolve) => child.once("exit", resolve)),
            delay(3000).then(() => child.kill("SIGKILL")),
          ]);
        }
      },
    };
  } catch (error) {
    await client?.close().catch(() => {});
    if (child.exitCode === null) child.kill("SIGTERM");
    throw error;
  }
}
