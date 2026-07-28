import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";

import {
  clearNativeCapabilityDiscoveryForTest,
  discoverNativeCapabilities,
  nativeCapabilities,
  probeCodex,
} from "../src/runtimes/native-capabilities.mjs";

function write(file, source = "---\ndescription: Native fixture\n---\n") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
}

describe("native runtime capability inventory", () => {
  it("discovers only Claude-native references and reads installed SDK metadata through the live probe", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-claude-capabilities-"));
    const home = path.join(root, "home");
    const cwd = path.join(root, "repo");
    write(path.join(cwd, ".claude", "skills", "review", "SKILL.md"));
    write(path.join(home, ".claude", "commands", "ship.md"));

    const capabilities = nativeCapabilities("claude-code", {
      cwd,
      home,
      metadataProbe: () => ({ version: "9.8.7", claudeCodeVersion: "6.5.4" }),
    });

    assert.equal(capabilities.version, "Agent SDK 9.8.7 · Claude Code 6.5.4");
    assert.deepEqual(capabilities.skills.map((entry) => entry.reference), ["/review"]);
    assert.deepEqual(capabilities.slashCommands.map((entry) => entry.reference), ["/ship"]);
    assert.equal(capabilities.planSupported, true);
    assert.deepEqual(capabilities.interactionModes.map((mode) => mode.id), ["default", "plan"]);
    assert.ok(capabilities.models.every((model) => model.contextWindow === null));
  });

  it("does not advertise Claude commands or plan mode to Codex", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-codex-capabilities-"));
    const home = path.join(root, "home");
    const cwd = path.join(root, "repo");
    write(path.join(cwd, ".codex", "skills", "audit", "SKILL.md"));
    write(path.join(cwd, ".claude", "commands", "ship.md"));

    const capabilities = nativeCapabilities("codex", {
      cwd,
      home,
      env: { PATH: "/fixture" },
      versionProbe: () => ({ status: 0, stdout: "codex-cli 5.6.1\n" }),
    });

    assert.equal(capabilities.version, "codex-cli 5.6.1");
    assert.deepEqual(capabilities.skills.map((entry) => entry.reference), ["$audit"]);
    assert.deepEqual(capabilities.slashCommands, []);
    assert.equal(capabilities.planSupported, false);
    assert.deepEqual(capabilities.interactionModes.map((mode) => mode.id), ["default"]);
  });

  it("reports unavailable Claude metadata instead of presenting a stale version", () => {
    assert.equal(nativeCapabilities("claude-code", {
      metadataProbe: () => { throw new Error("missing package"); },
    }).version, null);
  });

  it("replaces the compatibility catalog with the installed Claude SDK catalog", async () => {
    clearNativeCapabilityDiscoveryForTest();
    const capabilities = await discoverNativeCapabilities("claude-code", {
      cwd: "/fixture/claude-project",
      metadataProbe: () => ({ version: "9.8.7" }),
      claudeProbe: async () => ({
        models: [{
          id: "opus[1m]",
          label: "Opus",
          description: "Opus with 1M context",
          maxEffort: "max",
          contextWindow: 1_000_000,
        }],
        slashCommands: [{
          name: "verify",
          description: "Verify the current change",
          reference: "/verify",
        }],
      }),
    });
    assert.deepEqual(capabilities.models.map((model) => model.id), ["opus[1m]"]);
    assert.equal(capabilities.models[0].contextWindow, 1_000_000);
    assert.deepEqual(capabilities.slashCommands.map((entry) => entry.reference), ["/verify"]);
    assert.equal(capabilities.discovery.state, "complete");
  });

  it("uses Codex's live model effort and skill inventory without offering stale entries", async () => {
    clearNativeCapabilityDiscoveryForTest();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-codex-live-capabilities-"));
    try {
      const capabilities = await discoverNativeCapabilities("codex", {
        cwd: "/fixture/codex-project",
        home,
        env: { PATH: "/fixture" },
        versionProbe: () => ({ status: 0, stdout: "codex-cli 5.6.1\n" }),
        codexProbe: async () => ({
          models: [{
            id: "gpt-live",
            label: "GPT Live",
            description: "Installed catalog",
            maxEffort: "ultra",
            contextWindow: null,
          }],
          skills: [{
            name: "audit",
            description: "Audit this repository",
            reference: "$audit",
          }],
        }),
      });
      assert.deepEqual(capabilities.models.map((model) => model.id), ["gpt-live"]);
      assert.equal(capabilities.models[0].maxEffort, "ultra");
      assert.deepEqual(capabilities.skills.map((entry) => entry.reference), ["$audit"]);
      assert.equal(capabilities.discovery.state, "complete");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("degrades a closed Codex capability pipe without crashing the Brain", async () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    const discovery = probeCodex({
      cwd: "/fixture/codex-project",
      env: {},
      timeoutMs: 100,
      findBinary: () => ({ ok: true, path: "/fixture/codex" }),
      spawnProcess: () => child,
    });

    const pipeError = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    child.stdin.destroy(pipeError);
    child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);

    await assert.rejects(discovery, /EPIPE|closed before/);
  });
});
