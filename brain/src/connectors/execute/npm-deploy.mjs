import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { verifyDeployContract } from "../../firm/deploy-contract.mjs";

const DEPLOY_TIMEOUT_MS = 15 * 60 * 1000;

function safeEnvironment() {
  const env = { ...process.env, DROVER_DEPLOY: "1" };
  delete env.GTM_IDE_FOUNDER_CAPABILITY;
  delete env.DROVER_BRAIN_URL;
  return env;
}

function outputDigest(result) {
  return crypto.createHash("sha256").update(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).digest("hex");
}

export function executeNpmDeploy({ effect, ventureId }, options = {}, deps = {}) {
  const verified = verifyDeployContract(ventureId, effect, options);
  if (!verified.ok) return verified;
  const run = deps.spawnSync ?? spawnSync;
  const result = run("npm", ["run", verified.contract.script], {
    cwd: verified.venture.repository,
    encoding: "utf8",
    env: safeEnvironment(),
    shell: false,
    timeout: deps.timeoutMs ?? DEPLOY_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) return { ok: false, error: `Deploy command could not run: ${result.error.message}` };
  if (result.status !== 0) return { ok: false, error: `Deploy command exited with status ${result.status}. Nothing was recorded as deployed.` };
  return {
    ok: true,
    deploymentId: null,
    detail: {
      command: verified.contract.command,
      destination: verified.contract.destination,
      completedAt: new Date().toISOString(),
      outputDigest: outputDigest(result),
    },
  };
}
