import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";

const ownerWriteRetries = 4;
const ownerWriteRetryDelayMs = 25;

function isAlreadyExistsError(error) {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isMissingFileError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function defaultIsProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

async function readOwner(lockPath) {
  for (let attempt = 0; attempt <= ownerWriteRetries; attempt += 1) {
    try {
      const parsed = JSON.parse(await NodeFS.promises.readFile(lockPath, "utf8"));
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        Number.isInteger(parsed.pid) &&
        parsed.pid > 0 &&
        typeof parsed.token === "string" &&
        parsed.token.length > 0
      ) {
        return parsed;
      }
    } catch (error) {
      if (isMissingFileError(error)) return undefined;
      if (!(error instanceof SyntaxError)) throw error;
    }

    if (attempt < ownerWriteRetries) {
      await NodeTimersPromises.setTimeout(ownerWriteRetryDelayMs);
    }
  }

  return undefined;
}

/**
 * Owns one development process per repository checkout. The lock is a file,
 * not a process-name scan, so separate worktrees remain independent and a
 * launcher never terminates an unrelated Electron process.
 */
export async function acquireDevProcessLock({
  lockPath,
  pid = process.pid,
  token = NodeCrypto.randomUUID(),
  isProcessRunning = defaultIsProcessRunning,
}) {
  const owner = { pid, token };

  for (;;) {
    try {
      await NodeFS.promises.mkdir(NodePath.dirname(lockPath), { recursive: true });
      await NodeFS.promises.writeFile(lockPath, `${JSON.stringify(owner)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });

      const releaseSync = () => {
        try {
          const current = JSON.parse(NodeFS.readFileSync(lockPath, "utf8"));
          if (current?.token === token) NodeFS.unlinkSync(lockPath);
        } catch (error) {
          if (!isMissingFileError(error) && !(error instanceof SyntaxError)) throw error;
        }
      };

      return { acquired: true, owner, releaseSync };
    } catch (error) {
      if (!isAlreadyExistsError(error)) throw error;

      const existingOwner = await readOwner(lockPath);
      if (existingOwner && isProcessRunning(existingOwner.pid)) {
        return { acquired: false, owner: existingOwner };
      }

      try {
        await NodeFS.promises.unlink(lockPath);
      } catch (unlinkError) {
        if (!isMissingFileError(unlinkError)) throw unlinkError;
      }
    }
  }
}
