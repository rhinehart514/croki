// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { discoverObsidianVaultsFromConfig } from "./ObsidianVaultDiscovery.ts";

const tempDirectories: string[] = [];

function makeTempDirectory(): string {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "croki-obsidian-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Obsidian vault discovery", () => {
  it("returns valid vaults in active and recent order", () => {
    const root = makeTempDirectory();
    const first = NodePath.join(root, "First Vault");
    const second = NodePath.join(root, "Second Vault");
    NodeFS.mkdirSync(NodePath.join(first, ".obsidian"), { recursive: true });
    NodeFS.mkdirSync(NodePath.join(second, ".obsidian"), { recursive: true });
    const configPath = NodePath.join(root, "obsidian.json");
    NodeFS.writeFileSync(
      configPath,
      JSON.stringify({
        vaults: {
          first: { path: first, ts: 100 },
          second: { path: encodeURIComponent(second), ts: 50, open: true },
          missing: { path: NodePath.join(root, "Missing"), ts: 500 },
        },
      }),
    );

    expect(discoverObsidianVaultsFromConfig(configPath)).toEqual([
      {
        id: "second",
        name: "Second Vault",
        path: NodeFS.realpathSync(second),
        lastOpenedAt: 50,
        isOpen: true,
      },
      {
        id: "first",
        name: "First Vault",
        path: NodeFS.realpathSync(first),
        lastOpenedAt: 100,
        isOpen: false,
      },
    ]);
  });

  it("fails closed for missing or malformed configuration", () => {
    const root = makeTempDirectory();
    expect(discoverObsidianVaultsFromConfig(NodePath.join(root, "missing.json"))).toEqual([]);
    const malformed = NodePath.join(root, "obsidian.json");
    NodeFS.writeFileSync(malformed, "not json");
    expect(discoverObsidianVaultsFromConfig(malformed)).toEqual([]);
  });
});
