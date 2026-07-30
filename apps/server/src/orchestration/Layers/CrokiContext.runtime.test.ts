// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";

import { expect, it } from "vite-plus/test";

it("loads the shared Croki context entry through the Node runtime", () => {
  const result = NodeChildProcess.spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'const context = await import("@t3tools/shared/crokiContext"); process.stdout.write(String(context.CROKI_CONTEXT_VERSION));',
    ],
    {
      encoding: "utf8",
    },
  );

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("1");
});
