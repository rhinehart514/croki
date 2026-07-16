import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Individual tests create many isolated venture roots. Give the entire run one owned temp root so
// fixture directories cannot accumulate as thousands of siblings in the user's temp folder.
const suiteTemp = fs.mkdtempSync(path.join(os.tmpdir(), "drover-brain-suite-"));

try {
  const result = spawnSync(process.execPath, [
    "--import",
    "./test/helpers/founder-capability.mjs",
    "--test",
    "--test-concurrency=1",
    "--test-force-exit",
  ], {
    cwd: process.cwd(),
    env: { ...process.env, TMPDIR: suiteTemp },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(suiteTemp, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
}
