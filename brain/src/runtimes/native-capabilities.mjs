import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { query as agentQuery } from "@anthropic-ai/claude-agent-sdk";

import { findCodexBinary } from "./codex-auth.mjs";

const require = createRequire(import.meta.url);
const EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max", "ultra"];
const liveDiscovery = new Map();

const MODELS = Object.freeze({
  "claude-code": [
    { id: "claude-fable-5", label: "Claude Fable 5", description: "Most capable", maxEffort: "max", contextWindow: null },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", description: "Deep coding", maxEffort: "max", contextWindow: null },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5", description: "Balanced", maxEffort: "max", contextWindow: null },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Fast", maxEffort: "max", contextWindow: null },
  ],
  codex: [
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", description: "Flagship", maxEffort: "ultra", contextWindow: null },
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", description: "Balanced", maxEffort: "ultra", contextWindow: null },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", description: "Efficient", maxEffort: "max", contextWindow: null },
  ],
});

function frontmatterDescription(file) {
  try {
    const source = fs.readFileSync(file, "utf8").slice(0, 8_000);
    return source.match(/^---[\s\S]*?\ndescription:\s*["']?([^\n"']+)/)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

function markdownEntries(root, reference) {
  if (!root || !fs.existsSync(root)) return [];
  try {
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const file = entry.isDirectory()
        ? path.join(root, entry.name, "SKILL.md")
        : entry.isFile() && entry.name.endsWith(".md") ? path.join(root, entry.name) : null;
      if (!file || !fs.existsSync(file)) return [];
      const name = entry.isDirectory() ? entry.name : entry.name.replace(/\.md$/i, "");
      if (!/^[\w.-]+$/.test(name)) return [];
      return [{ name, description: frontmatterDescription(file), reference: reference(name) }];
    });
  } catch {
    return [];
  }
}

function unique(entries) {
  return [...new Map(entries.map((entry) => [entry.reference, entry])).values()]
    .sort((left, right) => left.name.localeCompare(right.name));
}

function contextWindow(description, id = "") {
  const match = String(description ?? "").match(/\b(\d+(?:\.\d+)?)\s*([km])\s+context\b/i);
  if (!match) return /\[1m\]$/i.test(id) ? 1_000_000 : null;
  return Math.round(Number(match[1]) * (match[2].toLowerCase() === "m" ? 1_000_000 : 1_000));
}

function maxEffort(levels, fallback = "high") {
  const supported = new Set(Array.isArray(levels) ? levels : []);
  return [...EFFORT_ORDER].reverse().find((level) => supported.has(level)) ?? fallback;
}

function claudeModels(models) {
  return (Array.isArray(models) ? models : []).flatMap((model) => {
    const id = String(model?.value ?? "").trim();
    if (!id || id === "default") return [];
    return [{
      id,
      label: String(model.displayName ?? id),
      description: String(model.description ?? "Claude model"),
      maxEffort: maxEffort(model.supportedEffortLevels, model.supportsEffort ? "high" : "low"),
      efforts: Array.isArray(model.supportedEffortLevels)
        ? model.supportedEffortLevels.filter((level) => EFFORT_ORDER.includes(level))
        : [],
      contextWindow: contextWindow(model.description, id),
    }];
  });
}

function codexModels(models) {
  return (Array.isArray(models) ? models : []).flatMap((model) => {
    const id = String(model?.model ?? model?.id ?? "").trim();
    if (!id || model?.hidden === true) return [];
    return [{
      id,
      label: String(model.displayName ?? id),
      description: String(model.description ?? "Codex model"),
      maxEffort: maxEffort((model.supportedReasoningEfforts ?? []).map((entry) => entry?.reasoningEffort)),
      efforts: (model.supportedReasoningEfforts ?? [])
        .map((entry) => entry?.reasoningEffort)
        .filter((level) => EFFORT_ORDER.includes(level)),
      contextWindow: Number.isFinite(model.contextWindow) ? model.contextWindow : null,
    }];
  });
}

async function withTimeout(promise, timeoutMs, close) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          close?.();
          reject(new Error("Native capability discovery timed out."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function probeClaude({ cwd, env, timeoutMs = 3_500 }) {
  async function* idleInput() { await new Promise(() => {}); }
  const query = agentQuery({
    prompt: idleInput(),
    options: {
      cwd: cwd ?? process.cwd(),
      env,
      // Capability reads must not execute project/user hooks. Project/user skills are read
      // separately below; this initialization is only the SDK-owned catalog.
      settingSources: [],
      permissionMode: "plan",
    },
  });
  try {
    const initialized = await withTimeout(query.initializationResult(), timeoutMs, () => query.close());
    return {
      models: claudeModels(initialized.models),
      slashCommands: (initialized.commands ?? []).map((command) => ({
        name: command.name,
        description: command.description || command.argumentHint || null,
        reference: `/${command.name}`,
      })),
    };
  } finally {
    query.close();
  }
}

export function probeCodex({
  cwd,
  env,
  timeoutMs = 1_000,
  spawnProcess = spawn,
  findBinary = findCodexBinary,
}) {
  const binary = findBinary(env);
  if (!binary.ok) return Promise.reject(new Error(binary.reason ?? "Codex is unavailable."));
  return new Promise((resolve, reject) => {
    const child = spawnProcess(binary.path, ["app-server", "--stdio"], {
      cwd: cwd ?? process.cwd(),
      env,
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    let buffer = "";
    let models = null;
    let skills = null;
    let settled = false;
    let timer;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill("SIGTERM"); } catch { /* already exited */ }
      if (error) reject(error);
      else resolve({
        models: codexModels(models),
        skills: (skills ?? []).flatMap((entry) => entry?.skills ?? []).flatMap((skill) => (
          skill?.enabled !== false && skill?.name
            ? [{
              name: skill.name,
              description: skill.interface?.shortDescription ?? skill.shortDescription ?? skill.description ?? null,
              reference: `$${skill.name}`,
            }]
            : []
        )),
      });
    };
    const writeRequest = (message) => {
      if (settled) return;
      if (!child.stdin?.writable || child.stdin.destroyed || child.stdin.writableEnded) {
        finish(new Error("Codex capability discovery closed before its request could be sent."));
        return;
      }
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
          if (error) finish(error);
        });
      } catch (error) {
        finish(error);
      }
    };
    timer = setTimeout(() => finish(new Error("Codex capability discovery timed out.")), timeoutMs);
    child.once("error", finish);
    child.stdin?.on("error", finish);
    child.once("exit", (code) => {
      if (!settled && (models === null || skills === null)) {
        finish(new Error(`Codex capability discovery exited before its reply (${code ?? "unknown"}).`));
      }
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && message.result) {
          writeRequest({ method: "model/list", id: 2, params: { includeHidden: false } });
          writeRequest({ method: "skills/list", id: 3, params: { cwds: cwd ? [cwd] : [], forceReload: false } });
        } else if (message.id === 2) models = message.result?.data ?? [];
        else if (message.id === 3) skills = message.result?.data ?? [];
        if (models !== null && skills !== null) finish();
      }
    });
    writeRequest({
      method: "initialize",
      id: 1,
      params: { clientInfo: { name: "drover", title: "Drover", version: "0.3.4" } },
    });
  });
}

function installedClaudeVersion(metadataProbe) {
  try {
    const metadata = metadataProbe
      ? metadataProbe()
      : JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve("@anthropic-ai/claude-agent-sdk")), "package.json"), "utf8"));
    if (typeof metadata?.version !== "string" || !metadata.version.trim()) return null;
    const sdk = `Agent SDK ${metadata.version.trim()}`;
    return typeof metadata.claudeCodeVersion === "string" && metadata.claudeCodeVersion.trim()
      ? `${sdk} · Claude Code ${metadata.claudeCodeVersion.trim()}`
      : sdk;
  } catch {
    return null;
  }
}

function versionFor(runtimeId, env, versionProbe, metadataProbe) {
  if (runtimeId === "claude-code") return installedClaudeVersion(metadataProbe);
  const binary = findCodexBinary(env);
  if (!binary.ok) return null;
  const probe = versionProbe ?? ((command, args) => spawnSync(command, args, {
    encoding: "utf8", timeout: 1_500, windowsHide: true,
  }));
  try {
    const result = probe(binary.path, ["--version"]);
    return result?.status === 0 ? String(result.stdout ?? "").trim() || null : null;
  } catch {
    return null;
  }
}

export function nativeCapabilities(runtimeId, {
  cwd = null,
  env = process.env,
  home = os.homedir(),
  versionProbe,
  metadataProbe,
} = {}) {
  const claude = runtimeId === "claude-code";
  const providerRoot = claude ? ".claude" : ".codex";
  const skillReference = claude ? (name) => `/${name}` : (name) => `$${name}`;
  const skillRoots = [
    cwd ? path.join(cwd, providerRoot, "skills") : null,
    path.join(home, providerRoot, "skills"),
  ].filter(Boolean);
  const skills = unique(skillRoots.flatMap((root) => markdownEntries(root, skillReference)));
  const slashCommands = claude
    ? unique([
      ...(cwd ? markdownEntries(path.join(cwd, ".claude", "commands"), (name) => `/${name}`) : []),
      ...markdownEntries(path.join(home, ".claude", "commands"), (name) => `/${name}`),
    ])
    : [];
  return {
    version: versionFor(runtimeId, env, versionProbe, metadataProbe),
    models: MODELS[runtimeId] ?? [],
    skills,
    slashCommands,
    interactionModes: claude
      ? [{ id: "default", label: "Act" }, { id: "plan", label: "Plan", description: "Use Claude's native read-only plan mode." }]
      : [{ id: "default", label: "Act" }],
    planSupported: claude,
    update: {
      state: "unknown",
      detail: "This headless runtime does not advertise update availability.",
    },
    discovery: {
      state: "partial",
      detail: "Models come from the adapter contract; installed project and user skills are discovered from provider-native folders.",
    },
  };
}

export async function discoverNativeCapabilities(runtimeId, options = {}) {
  const base = nativeCapabilities(runtimeId, options);
  const key = `${runtimeId}:${options.cwd ?? ""}`;
  if (!liveDiscovery.has(key)) {
    const supplied = runtimeId === "claude-code" ? options.claudeProbe : options.codexProbe;
    liveDiscovery.set(key, Promise.resolve().then(() => (
      supplied ? supplied({ cwd: options.cwd, env: options.env ?? process.env })
        : runtimeId === "claude-code" ? probeClaude(options) : probeCodex(options)
    )).catch(() => null));
  }
  const live = await liveDiscovery.get(key);
  if (!live) return base;
  return {
    ...base,
    models: live.models?.length ? live.models : base.models,
    skills: unique([...(base.skills ?? []), ...(live.skills ?? [])]),
    slashCommands: unique([...(base.slashCommands ?? []), ...(live.slashCommands ?? [])]),
    discovery: {
      state: "complete",
      detail: "Models and native entries were read from the installed provider; project and user references remain provider-owned.",
    },
  };
}

export function clearNativeCapabilityDiscoveryForTest() {
  liveDiscovery.clear();
}
