import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import { createVenture } from "../../../brain/src/firm/venture-store.mjs";
import { driveTeammate } from "../../../brain/src/firm/work-loop.mjs";
import { openCodingWorkspace } from "../../../brain/src/firm/code-workspace.mjs";
import { getSemanticModel, mutateSemanticModel } from "../../../brain/src/firm/semantic-model-store.mjs";
import { readRepositoryExcerpt } from "../../../brain/src/firm/truth.mjs";
import { ROOT } from "./browser-harness.mjs";

function commandReceipt(cwd, command, args) {
  const startedAt = new Date().toISOString();
  try {
    const output = execFileSync(command, args, { cwd, encoding: "utf8" });
    return { command: [command, ...args].join(" "), status: "passed", exitCode: 0, startedAt, completedAt: new Date().toISOString(), output: output.trim() || "Passed.", verification: true };
  } catch (error) {
    return { command: [command, ...args].join(" "), status: "failed", exitCode: error.status ?? 1, startedAt, completedAt: new Date().toISOString(), output: String(error.stderr || error.message), verification: true };
  }
}

export async function seedNativeCoding({ root }) {
  const options = { root, seedFoundingCrew: false };
  const venture = createVenture({ name: "Croki native coding", repository: ROOT }, options);
  const shellSource = readRepositoryExcerpt(ROOT, { file: "ui/src/FirmApp.tsx", startLine: 1, endLine: 40 });
  const model = getSemanticModel(venture.id, options);
  mutateSemanticModel({
    ventureId: venture.id,
    baseRevision: model.revision,
    operations: [{
      op: "create-record",
      family: "objects",
      record: {
        id: "page-croki-shell",
        type: "page",
        name: "Croki shell",
        statement: "The founder enters Croki through its desktop shell.",
        assertion: "tentative",
        provenance: { kind: "repository-page", sourceRef: shellSource.ref, actor: "page-map" },
        properties: {
          territory: "product",
          page: { route: "/", file: "ui/src/FirmApp.tsx", sourceRef: shellSource.ref },
        },
      },
    }],
    actor: { authority: "agent", id: "page-map" },
  }, options);
  const runtime = {
    id: "codex", label: "Codex", supportsAbort: true, costReporting: "none",
    async drive(ctx) {
      ctx.onRuntimeSession("browser-provider-session");
      fs.writeFileSync(path.join(ctx.cwd, "native-coding-browser-proof.txt"), "implemented in an isolated Croki workspace\n");
      ctx.onToolStart("command_execution", { summary: "Checking the exact implementation" });
      ctx.onCommand(commandReceipt(ctx.cwd, "git", ["diff", "--check"]));
      ctx.onCommand(commandReceipt(ctx.cwd, process.execPath, ["--check", "brain/src/server.mjs"]));
      return { kind: "completed", summary: "Implemented in the isolated workspace and verified." };
    },
  };
  const completed = await driveTeammate({
    ventureId: venture.id,
    teammateRef: "codex",
    goal: "Implement the native coding browser proof",
    initiatedBy: "founder",
    options: { ...options, nativeCodingHostVerification: false },
    deps: { runtime },
  });
  const interrupted = openCodingWorkspace({
    ventureId: venture.id,
    runId: `drive-browser-interrupted-${crypto.createHash("sha256").update(root).digest("hex").slice(0, 10)}`,
    threadRef: completed.codingWorkspace.threadRef,
    participantRef: "claude",
    provider: "claude-code",
    repository: ROOT,
    goal: "Try another implementation approach",
  }, options);
  fs.writeFileSync(path.join(interrupted.worktree, "native-coding-interrupted-proof.txt"), "retained across restart\n");
  return { venture, completed: completed.codingWorkspace, interrupted };
}
