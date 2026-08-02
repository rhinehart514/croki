#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const MIGRATED_STATE_ENTRIES = [
  "attachments",
  "clerk-tokens.json",
  "client-settings.json",
  "connection-catalog.json",
  "desktop-settings.json",
  "keybindings.json",
  "saved-environments.json",
  "settings.json",
] as const;

export interface CrokiStandaloneMigrationResult {
  readonly sourceStateDir: string;
  readonly targetStateDir: string;
  readonly migratedEntries: readonly string[];
  readonly migratedDatabase: boolean;
}

async function pathExists(path: string): Promise<boolean> {
  return NodeFSP.access(path).then(
    () => true,
    () => false,
  );
}

function sqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runSqlite(sourceDatabase: string, statement: string): string {
  const result = NodeChildProcess.spawnSync("/usr/bin/sqlite3", [sourceDatabase, statement], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`SQLite migration failed${details ? `: ${details}` : "."}`);
  }
  return result.stdout.trim();
}

/**
 * Creates a fresh Croki-owned state directory from the current T3 desktop state.
 * SQLite is copied through its online backup API so a live WAL cannot produce a
 * torn database. Runtime IDs, logs, caches, and transient process files are not
 * copied, allowing Croki and Croki to coexist after the migration.
 */
export async function migrateLegacyT3State(input: {
  readonly sourceRoot: string;
  readonly targetRoot: string;
}): Promise<CrokiStandaloneMigrationResult> {
  const sourceStateDir = NodePath.join(input.sourceRoot, "userdata");
  const targetStateDir = NodePath.join(input.targetRoot, "userdata");
  if (!(await pathExists(sourceStateDir))) {
    throw new Error(`Legacy T3 state does not exist at ${sourceStateDir}.`);
  }
  if (await pathExists(targetStateDir)) {
    throw new Error(`Croki state already exists at ${targetStateDir}; refusing to overwrite it.`);
  }

  await NodeFSP.mkdir(input.targetRoot, { recursive: true });
  const temporaryStateDir = await NodeFSP.mkdtemp(NodePath.join(input.targetRoot, ".migrating-"));

  try {
    const migratedEntries: string[] = [];
    for (const entry of MIGRATED_STATE_ENTRIES) {
      const sourcePath = NodePath.join(sourceStateDir, entry);
      if (!(await pathExists(sourcePath))) continue;
      await NodeFSP.cp(sourcePath, NodePath.join(temporaryStateDir, entry), {
        recursive: true,
        preserveTimestamps: true,
      });
      migratedEntries.push(entry);
    }

    const sourceDatabase = NodePath.join(sourceStateDir, "state.sqlite");
    const targetDatabase = NodePath.join(temporaryStateDir, "state.sqlite");
    const migratedDatabase = await pathExists(sourceDatabase);
    if (migratedDatabase) {
      runSqlite(sourceDatabase, `.backup ${sqliteString(targetDatabase)}`);
      const integrity = runSqlite(targetDatabase, "PRAGMA integrity_check;");
      if (integrity !== "ok") {
        throw new Error("Migrated Croki database failed its integrity check.");
      }
    }

    await NodeFSP.writeFile(
      NodePath.join(temporaryStateDir, "croki-migration.json"),
      `${JSON.stringify(
        {
          version: 1,
          source: "croki-userdata",
          migratedEntries,
          migratedDatabase,
          intentionallyRegenerated: [
            "anonymous-id",
            "browser-artifacts",
            "environment-id",
            "logs",
            "secrets",
            "server-runtime.json",
          ],
        },
        null,
        2,
      )}\n`,
    );
    await NodeFSP.rename(temporaryStateDir, targetStateDir);

    return {
      sourceStateDir,
      targetStateDir,
      migratedEntries,
      migratedDatabase,
    };
  } catch (error) {
    await NodeFSP.rm(temporaryStateDir, { recursive: true, force: true });
    throw error;
  }
}

async function main(): Promise<void> {
  const homeDirectory = NodeOS.homedir();
  const result = await migrateLegacyT3State({
    sourceRoot: NodePath.join(homeDirectory, ".t3"),
    targetRoot: NodePath.join(homeDirectory, ".croki"),
  });
  process.stdout.write(
    `Migrated Croki state to ${result.targetStateDir} (${result.migratedEntries.length} entries, database: ${result.migratedDatabase ? "yes" : "no"}).\n`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === NodeURL.pathToFileURL(invokedPath).href) {
  await main();
}
