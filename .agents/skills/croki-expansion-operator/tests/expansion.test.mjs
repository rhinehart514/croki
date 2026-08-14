import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
import * as NodeURL from "node:url";

const TEST_DIRECTORY = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const SKILL_DIRECTORY = NodePath.resolve(TEST_DIRECTORY, "..");
const CLI = NodePath.resolve(SKILL_DIRECTORY, "scripts/expansion.mjs");
const USAGE_FIXTURE = NodePath.resolve(SKILL_DIRECTORY, "fixtures/usage.ndjson");
const ACCOUNT_FIXTURE = NodePath.resolve(SKILL_DIRECTORY, "fixtures/accounts.ndjson");
const POLICY_FILE = NodePath.resolve(SKILL_DIRECTORY, "config/triggers.json");

function execute(argumentsList, options = {}) {
  const result = NodeChildProcess.spawnSync(process.execPath, [CLI, ...argumentsList], {
    cwd: options.cwd ?? SKILL_DIRECTORY,
    encoding: "utf8",
  });
  if (options.expectFailure) {
    NodeAssert.notEqual(result.status, 0, "command unexpectedly succeeded");
    return result;
  }
  NodeAssert.equal(result.status, 0, result.stderr);
  return result;
}

function executeJson(argumentsList, options) {
  return JSON.parse(execute(argumentsList, options).stdout);
}

NodeTest.test("nominates evidence-backed opportunities and resumes without duplication", () => {
  const state = NodeFS.mkdtempSync(NodePath.resolve(NodeOS.tmpdir(), "croki-expansion-test-"));
  try {
    const initialized = executeJson(["init", "--state", state]);
    NodeAssert.equal(initialized.initialized, true);

    executeJson(["ingest-accounts", "--state", state, "--input", ACCOUNT_FIXTURE]);
    const firstImport = executeJson(["ingest-usage", "--state", state, "--input", USAGE_FIXTURE]);
    NodeAssert.equal(firstImport.inserted, 10);

    const repeatedImport = executeJson([
      "ingest-usage",
      "--state",
      state,
      "--input",
      USAGE_FIXTURE,
    ]);
    NodeAssert.equal(repeatedImport.inserted, 0);
    NodeAssert.equal(repeatedImport.duplicates, 10);

    const firstEvaluation = executeJson([
      "evaluate",
      "--state",
      state,
      "--now",
      "2026-08-12T12:00:00.000Z",
    ]);
    NodeAssert.equal(firstEvaluation.opportunities_nominated, 3);

    const firstQueue = executeJson(["queue", "--state", state]);
    NodeAssert.equal(firstQueue.length, 3);
    NodeAssert.equal(
      firstQueue.some((item) => item.account.account_id === "acct-noise"),
      false,
    );
    NodeAssert.equal(
      firstQueue.some((item) => item.trigger.rule_id === "managed-tunnel-capacity-pressure"),
      true,
    );
    NodeAssert.equal(
      firstQueue.every((item) => item.readiness.delivery_implemented === false),
      true,
    );

    const secondEvaluation = executeJson([
      "evaluate",
      "--state",
      state,
      "--now",
      "2026-08-12T12:00:00.000Z",
    ]);
    NodeAssert.equal(secondEvaluation.opportunities_nominated, 3);
    NodeAssert.equal(executeJson(["queue", "--state", state]).length, 3);

    const status = executeJson(["status", "--state", state]);
    NodeAssert.equal(status.counts.source_events, 10);
    NodeAssert.equal(status.capabilities.delivery, false);
    NodeAssert.equal(status.offer_status, "open");
  } finally {
    NodeFS.rmSync(state, { recursive: true, force: true });
  }
});

NodeTest.test(
  "gates drafts on advancement, confirmed offer, contact reference, and evidence",
  () => {
    const state = NodeFS.mkdtempSync(
      NodePath.resolve(NodeOS.tmpdir(), "croki-expansion-gate-test-"),
    );
    try {
      executeJson(["init", "--state", state]);
      executeJson(["ingest-accounts", "--state", state, "--input", ACCOUNT_FIXTURE]);
      executeJson(["ingest-usage", "--state", state, "--input", USAGE_FIXTURE]);
      executeJson(["evaluate", "--state", state, "--now", "2026-08-12T12:00:00.000Z"]);
      const opportunity = executeJson(["queue", "--state", state]).find(
        (item) => item.trigger.rule_id === "multi-environment-remote-workflow",
      );
      NodeAssert.ok(opportunity);

      const draftFile = NodePath.resolve(state, "draft.txt");
      NodeFS.writeFileSync(
        draftFile,
        "You are operating Croki across multiple environments. I would like to understand what broader use would require.",
        "utf8",
      );
      const beforeDecision = execute(
        [
          "prepare-action",
          "--state",
          state,
          "--id",
          opportunity.opportunity_id,
          "--channel",
          "email",
          "--content-file",
          draftFile,
          "--evidence",
          opportunity.evidence[0].event_id,
          "--by",
          "fixture-reviewer",
        ],
        { expectFailure: true },
      );
      NodeAssert.match(beforeDecision.stderr, /offer is open/iu);

      executeJson([
        "decide",
        "--state",
        state,
        "--id",
        opportunity.opportunity_id,
        "--verdict",
        "advance",
        "--reason",
        "The fixture contains repeated multi-environment behavior.",
        "--by",
        "fixture-reviewer",
      ]);

      const stillOpen = execute(
        [
          "prepare-action",
          "--state",
          state,
          "--id",
          opportunity.opportunity_id,
          "--channel",
          "email",
          "--content-file",
          draftFile,
          "--evidence",
          opportunity.evidence[0].event_id,
          "--by",
          "fixture-reviewer",
        ],
        { expectFailure: true },
      );
      NodeAssert.match(stillOpen.stderr, /offer is open/iu);

      const confirmedPolicy = JSON.parse(NodeFS.readFileSync(POLICY_FILE, "utf8"));
      confirmedPolicy.policy_version = "fixture-confirmed";
      confirmedPolicy.offer_status = "confirmed";
      const confirmedPolicyFile = NodePath.resolve(state, "confirmed-policy.json");
      NodeFS.writeFileSync(confirmedPolicyFile, JSON.stringify(confirmedPolicy, null, 2), "utf8");

      const wrongEvidence = execute(
        [
          "prepare-action",
          "--state",
          state,
          "--policy",
          confirmedPolicyFile,
          "--id",
          opportunity.opportunity_id,
          "--channel",
          "email",
          "--content-file",
          draftFile,
          "--evidence",
          "noise-01",
          "--by",
          "fixture-reviewer",
        ],
        { expectFailure: true },
      );
      NodeAssert.match(wrongEvidence.stderr, /outside the opportunity/iu);

      const prepared = executeJson([
        "prepare-action",
        "--state",
        state,
        "--policy",
        confirmedPolicyFile,
        "--id",
        opportunity.opportunity_id,
        "--channel",
        "email",
        "--content-file",
        draftFile,
        "--evidence",
        opportunity.evidence[0].event_id,
        "--by",
        "fixture-reviewer",
      ]);
      NodeAssert.equal(prepared.status, "action-drafted");
      NodeAssert.equal(prepared.delivery_implemented, false);

      const absentSender = execute(["send", "--state", state], { expectFailure: true });
      NodeAssert.match(absentSender.stderr, /Unknown command/iu);
    } finally {
      NodeFS.rmSync(state, { recursive: true, force: true });
    }
  },
);

NodeTest.test("normalizes bounded Axiom exports and skips unresolved or irrelevant spans", () => {
  const state = NodeFS.mkdtempSync(
    NodePath.resolve(NodeOS.tmpdir(), "croki-expansion-axiom-test-"),
  );
  try {
    const exportFile = NodePath.resolve(state, "axiom.ndjson");
    NodeFS.writeFileSync(
      exportFile,
      [
        JSON.stringify({
          _time: "2026-08-11T10:00:00.000Z",
          span_id: "span-link",
          requestMethod: "POST",
          path: "/v1/client/environment-links",
          statusCode: 200,
          userId: "acct-axiom",
          environmentId: "env-a",
        }),
        JSON.stringify({
          _time: "2026-08-11T11:00:00.000Z",
          span_id: "span-limit",
          requestMethod: "POST",
          path: "/v1/client/environment-links",
          statusCode: 409,
          userId: "acct-axiom",
          environmentId: "env-d",
          errorType: "ManagedTunnelLimitExceeded",
        }),
        JSON.stringify({
          _time: "2026-08-11T12:00:00.000Z",
          span_id: "span-health",
          requestMethod: "GET",
          path: "/health",
          statusCode: 200,
          userId: "acct-axiom",
        }),
        JSON.stringify({
          _time: "2026-08-11T13:00:00.000Z",
          span_id: "span-no-user",
          requestMethod: "POST",
          path: "/v1/mobile/devices",
          statusCode: 200,
        }),
      ].join("\n"),
      "utf8",
    );
    const result = executeJson(["ingest-axiom", "--state", state, "--input", exportFile]);
    NodeAssert.equal(result.inserted, 2);
    NodeAssert.equal(result.skipped.unmapped_span, 1);
    NodeAssert.equal(result.skipped.unresolved_account, 1);

    const evaluation = executeJson([
      "evaluate",
      "--state",
      state,
      "--now",
      "2026-08-12T12:00:00.000Z",
    ]);
    NodeAssert.equal(evaluation.opportunities_nominated, 1);
    const packet = executeJson(["queue", "--state", state])[0];
    NodeAssert.equal(packet.trigger.rule_id, "managed-tunnel-capacity-pressure");
    NodeAssert.equal(packet.evidence.length, 1);
    NodeAssert.deepEqual(Object.keys(packet.evidence[0].properties).sort(), [
      "endpoint",
      "environment_id",
      "error_type",
      "method",
      "path",
      "source_name",
      "status_code",
    ]);
  } finally {
    NodeFS.rmSync(state, { recursive: true, force: true });
  }
});
