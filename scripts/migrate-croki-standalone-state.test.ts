// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, assert, describe, expect, it } from "vite-plus/test";

import { migrateLegacyT3State } from "./migrate-croki-standalone-state.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => NodeFS.rm(root, { recursive: true, force: true })),
  );
});

async function makeRoot(): Promise<string> {
  const root = await NodeFS.mkdtemp(NodePath.join(NodeOS.tmpdir(), "croki-migration-test-"));
  temporaryRoots.push(root);
  return root;
}

describe("standalone Croki migration", () => {
  it("copies durable state through a valid SQLite snapshot and regenerates runtime identity", async () => {
    const root = await makeRoot();
    const sourceRoot = NodePath.join(root, ".t3");
    const targetRoot = NodePath.join(root, ".croki");
    const sourceStateDir = NodePath.join(sourceRoot, "userdata");
    await NodeFS.mkdir(NodePath.join(sourceStateDir, "secrets"), { recursive: true });
    await NodeFS.writeFile(
      NodePath.join(sourceStateDir, "settings.json"),
      '{"provider":"codex"}\n',
    );
    await NodeFS.writeFile(NodePath.join(sourceStateDir, "secrets", "provider"), "encrypted");
    await NodeFS.writeFile(NodePath.join(sourceStateDir, "environment-id"), "legacy-id");
    const databasePath = NodePath.join(sourceStateDir, "state.sqlite");
    NodeChildProcess.execFileSync("/usr/bin/sqlite3", [
      databasePath,
      "CREATE TABLE threads (id TEXT); INSERT INTO threads VALUES ('thread-1');",
    ]);

    const result = await migrateLegacyT3State({ sourceRoot, targetRoot });

    assert.equal(result.migratedDatabase, true);
    assert.deepEqual(result.migratedEntries, ["settings.json"]);
    assert.equal(
      NodeChildProcess.execFileSync(
        "/usr/bin/sqlite3",
        [NodePath.join(targetRoot, "userdata", "state.sqlite"), "SELECT id FROM threads;"],
        { encoding: "utf8" },
      ).trim(),
      "thread-1",
    );
    await expect(
      NodeFS.access(NodePath.join(targetRoot, "userdata", "environment-id")),
    ).rejects.toThrow();
    await expect(NodeFS.access(NodePath.join(targetRoot, "userdata", "secrets"))).rejects.toThrow();
  });

  it("refuses to overwrite an existing Croki state directory", async () => {
    const root = await makeRoot();
    const sourceRoot = NodePath.join(root, ".t3");
    const targetRoot = NodePath.join(root, ".croki");
    await NodeFS.mkdir(NodePath.join(sourceRoot, "userdata"), { recursive: true });
    await NodeFS.mkdir(NodePath.join(targetRoot, "userdata"), { recursive: true });

    await expect(migrateLegacyT3State({ sourceRoot, targetRoot })).rejects.toThrow(
      /refusing to overwrite/u,
    );
  });
});
