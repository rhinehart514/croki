import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import { createVenture, setVentureDoc } from "../../../brain/src/firm/venture-store.mjs";
import { driveTeammate } from "../../../brain/src/firm/work-loop.mjs";
import { openCodingWorkspace } from "../../../brain/src/firm/code-workspace.mjs";
import { prepareOutwardAction, prepareOutwardMaterial } from "../../../brain/src/firm/outward-actions.mjs";
import {
  getSemanticModel,
  mutateSemanticModel,
  recordRun,
} from "../../../brain/src/firm/semantic-model-store.mjs";
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

export async function seedNativeCoding({ root, flagshipReadiness = false }) {
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
  let outwardAction = null;
  let priorEvidence = null;
  let nextTurn = null;
  const interruptedRunId = `drive-browser-interrupted-${crypto.createHash("sha256").update(root).digest("hex").slice(0, 10)}`;
  if (flagshipReadiness) {
    const decision = {
      id: "flagship-outward-approval",
      ventureId: venture.id,
      betId: null,
      workRef: completed.codingWorkspace.id,
      purpose: "release",
      blocksBet: true,
      effect: {
        kind: "message",
        to: "flagship-readiness@example.invalid",
        subject: "Croki flagship readiness draft",
        body: "This deterministic draft proves only the founder gate. It must not be sent.",
      },
      parkedAt: new Date().toISOString(),
      decision: null,
      decidedAt: null,
      decidedBy: null,
      note: null,
      releasedAt: null,
      deployAuthorizedAt: null,
      deployAuthorizedBy: null,
    };
    setVentureDoc(venture.id, "decisions", decision.id, decision, options);
    const preparedMaterial = prepareOutwardMaterial({
      ventureId: venture.id,
      kind: "message",
      preparedMaterial: decision.effect,
    }, options);
    outwardAction = prepareOutwardAction({
      ventureId: venture.id,
      kind: "message",
      subjectRefs: ["object:page-croki-shell"],
      workRefs: [`work:${completed.codingWorkspace.id}`],
      decisionRef: `decision:${decision.id}`,
      preparedMaterial,
      expectedReturn: {
        source: "gmail-thread",
        purpose: "Observe only a reply to the exact prepared message.",
        windowHours: 24,
        returnConditions: [{ type: "reply-present" }],
      },
      actor: { authority: "agent", id: "codex" },
    }, options);

    // This is deliberately a prior local rehearsal, not a return from outwardAction. It exercises
    // evidence projection and evidence-driven continuation without fabricating causality across the
    // still-unexecuted founder gate above.
    priorEvidence = {
      id: "flagship-prior-local-rehearsal",
      type: "outcome",
      ventureId: venture.id,
      betId: null,
      workRef: completed.codingWorkspace.id,
      outcomeKind: "local-readiness-rehearsal",
      summary: "Prior local readiness evidence",
      from: "deterministic Electron fixture",
      body: "A prior local rehearsal returned to this Thread; no message was sent and no world action occurred.",
      source: "deterministic-local-fixture",
      channel: "local",
      observedAt: "2026-07-26T12:00:00.000Z",
      attribution: "fixture-rehearsal",
      joined: false,
      structural: { channel: "local", outcomeKind: "local-readiness-rehearsal", joined: false },
      identifying: { betId: null, workRef: completed.codingWorkspace.id },
    };
    setVentureDoc(venture.id, "outcomes", priorEvidence.id, priorEvidence, options);
    recordRun(venture.id, {
      id: "flagship-prior-local-rehearsal",
      threadRef: completed.codingWorkspace.threadRef,
      outcomeRefs: [`outcome:${priorEvidence.id}`],
      properties: { source: "deterministic-local-fixture", worldAction: false },
      createdAt: priorEvidence.observedAt,
      completedAt: priorEvidence.observedAt,
    }, { at: priorEvidence.observedAt }, options);
  }
  const interrupted = flagshipReadiness
    ? (await driveTeammate({
        ventureId: venture.id,
        teammateRef: "codex",
        goal: "Implement the next Product correction from the prior local rehearsal evidence. Do not ship or contact anyone.",
        initiatedBy: "founder",
        target: {
          threadRef: completed.codingWorkspace.threadRef,
          subjectRefs: [`outcome:${priorEvidence.id}`],
        },
        options: { ...options, nativeCodingHostVerification: false },
        deps: {
          runtime: {
            id: "codex", label: "Codex", supportsAbort: true, costReporting: "none",
            async drive(ctx) {
              ctx.onRuntimeSession("browser-next-turn-session");
              fs.writeFileSync(path.join(ctx.cwd, "flagship-next-product-correction.txt"), "began from explicit prior local rehearsal evidence\n");
              ctx.onToolStart("command_execution", { summary: "Checking the evidence-driven correction" });
              ctx.onCommand(commandReceipt(ctx.cwd, "git", ["diff", "--check"]));
              return { kind: "completed", summary: "Began the next local Product correction in this same Thread." };
            },
          },
        },
      })).codingWorkspace
    : openCodingWorkspace({
        ventureId: venture.id,
        runId: interruptedRunId,
        threadRef: completed.codingWorkspace.threadRef,
        participantRef: "claude",
        provider: "claude-code",
        repository: ROOT,
        goal: "Try another implementation approach",
      }, options);
  if (!flagshipReadiness) {
    fs.writeFileSync(path.join(interrupted.worktree, "native-coding-interrupted-proof.txt"), "retained across restart\n");
  }
  return { venture, completed: completed.codingWorkspace, interrupted, outwardAction, priorEvidence, nextTurn };
}
