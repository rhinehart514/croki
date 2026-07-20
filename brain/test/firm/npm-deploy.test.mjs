import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { executeNpmDeploy } from "../../src/connectors/execute/npm-deploy.mjs";
import { stampDeployContract } from "../../src/firm/deploy-contract.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-npm-deploy-"));
  const repository = path.join(root, "repository");
  fs.mkdirSync(repository);
  fs.writeFileSync(path.join(repository, "deploy.cjs"), "require('fs').writeFileSync('deployment.json', JSON.stringify({ founderCapability: process.env.GTM_IDE_FOUNDER_CAPABILITY || null }))\n");
  fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({ scripts: { deploy: "node deploy.cjs" } }, null, 2));
  const venture = createVenture({ name: "Npm deploy", repository }, { root, seedFoundingCrew: false });
  return { root, repository, venture };
}

test("the default deploy adapter runs the exact reviewed repository script", () => {
  const { root, repository, venture } = fixture();
  const previousCapability = process.env.GTM_IDE_FOUNDER_CAPABILITY;
  try {
    process.env.GTM_IDE_FOUNDER_CAPABILITY = "must-not-reach-deploy";
    const effect = stampDeployContract(venture.id, { kind: "deploy", destination: "production" }, { root });
    assert.equal(effect.deployContract.command, "npm run deploy");
    assert.equal(effect.deployContract.definition, "node deploy.cjs");
    const result = executeNpmDeploy({ ventureId: venture.id, effect }, { root });
    assert.equal(result.ok, true);
    assert.equal(result.detail.destination, "production");
    assert.equal(JSON.parse(fs.readFileSync(path.join(repository, "deployment.json"), "utf8")).founderCapability, null);
  } finally {
    if (previousCapability === undefined) delete process.env.GTM_IDE_FOUNDER_CAPABILITY;
    else process.env.GTM_IDE_FOUNDER_CAPABILITY = previousCapability;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a missing or changed deploy script fails closed", () => {
  const { root, repository, venture } = fixture();
  try {
    const unavailable = stampDeployContract(venture.id, { kind: "deploy", deployScript: "ship", destination: "production" }, { root });
    assert.match(unavailable.deployUnavailableReason, /script “ship” is unavailable/);
    const reviewed = stampDeployContract(venture.id, { kind: "deploy", destination: "production" }, { root });
    fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({ scripts: { deploy: "node changed.cjs" } }, null, 2));
    const result = executeNpmDeploy({ ventureId: venture.id, effect: reviewed }, { root });
    assert.equal(result.ok, false);
    assert.match(result.error, /changed after review/);
    assert.equal(fs.existsSync(path.join(repository, "deployment.json")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
