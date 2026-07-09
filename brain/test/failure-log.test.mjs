// Tests for the self-observing failure-log CORE (brain/src/failure-log.mjs).
//
// Every test isolates the queue in a fresh tmp dir via options.queueDir, pins options.now for a
// deterministic timestamp, and pins options.gitSha so no test touches the real repo queue or shells out
// to git — the same isolation friction.test.mjs uses.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  failureSignature,
  classifyErrorKind,
  classifyFault,
  buildFailureContext,
  logFailure,
  safeLogFailure,
  FAILURE_CATEGORIES,
} from "../src/failure-log.mjs";
import { listFrictionQueue } from "../src/friction.mjs";

function tmpQueue() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "failure-log-queue-"));
}

// The base options every logFailure/safeLogFailure call threads: an isolated queue dir + a pinned clock
// and git sha so the written frontmatter is fully deterministic.
function opts(queueDir, now = "2026-07-09T12:00:00.000Z") {
  return { queueDir, now, gitSha: "sha-test" };
}

// ─── failureSignature — the stable dedup key ────────────────────────────────────

describe("failureSignature — the dedup key", () => {
  it("identical inputs produce an identical signature (dedup collides)", () => {
    const a = failureSignature({ category: "node-error", errorKind: "code_throw", nodeKind: "agent", nodeLabel: "Draft outreach", graphId: "g1" });
    const b = failureSignature({ category: "node-error", errorKind: "code_throw", nodeKind: "agent", nodeLabel: "Draft outreach", graphId: "g1" });
    assert.equal(a, b, "the same broken node failing the same way must yield the same signature");
  });

  it("a different graphId gives a different signature (two pipelines, two bugs)", () => {
    const a = failureSignature({ category: "node-error", errorKind: "code_throw", nodeKind: "agent", nodeLabel: "Draft", graphId: "g1" });
    const b = failureSignature({ category: "node-error", errorKind: "code_throw", nodeKind: "agent", nodeLabel: "Draft", graphId: "g2" });
    assert.notEqual(a, b, "a failure in a different pipeline is a distinct bug");
  });

  it("two different agent steps failing the same way stay distinct (label slug suffix)", () => {
    const draft = failureSignature({ category: "node-error", errorKind: "code_throw", nodeKind: "agent", nodeLabel: "Draft outreach", graphId: "g1" });
    const enrich = failureSignature({ category: "node-error", errorKind: "code_throw", nodeKind: "agent", nodeLabel: "Enrich the list", graphId: "g1" });
    assert.notEqual(draft, enrich, "a generic kind (agent) is suffixed with the label slug so two steps don't merge");
    assert.match(draft, /agent:draft-outreach/);
    assert.match(enrich, /agent:enrich-the-list/);
  });

  it("a crash/stall with no node uses the literal 'session' for the node part; no graph uses 'session'", () => {
    const sig = failureSignature({ category: "run-crash", errorKind: "code_throw" });
    const parts = sig.split("|");
    assert.equal(parts.length, 4);
    assert.equal(parts[2], "session", "no node → node part is the literal 'session'");
    assert.equal(parts[3], "session", "no graph → graph part is 'session'");
  });

  it("empty/whitespace parts normalize to 'unknown', never silently merging two distinct failures", () => {
    const sig = failureSignature({ category: "   ", errorKind: "", nodeKind: null, graphId: undefined });
    const parts = sig.split("|");
    assert.equal(parts[0], "unknown", "an empty category becomes 'unknown', not the empty string");
    assert.equal(parts[1], "unknown", "an empty errorKind becomes 'unknown'");
    // node/graph default to the literal "session" when absent.
    assert.equal(parts[2], "session");
    assert.equal(parts[3], "session");
  });

  it("normalizes case and whitespace so cosmetically-different-but-same failures collide", () => {
    const a = failureSignature({ category: "Node-Error", errorKind: "CODE_THROW", nodeKind: "AGENT", nodeLabel: "Draft", graphId: "G1" });
    const b = failureSignature({ category: "node-error", errorKind: "code_throw", nodeKind: "agent", nodeLabel: "Draft", graphId: "g1" });
    assert.equal(a, b, "case is normalized so the same failure collides");
  });
});

// ─── classifyErrorKind — raw error/meta → normalized token ──────────────────────

describe("classifyErrorKind — raw error/meta → token", () => {
  it("meta.errorKind of unparseable_output / empty_output wins (the bad-output path)", () => {
    assert.equal(classifyErrorKind("anything", { errorKind: "unparseable_output" }), "unparseable_output");
    assert.equal(classifyErrorKind(null, { errorKind: "empty_output" }), "empty_output");
  });

  it("meta.errorKind of max_turns / max_budget / limit is preserved", () => {
    assert.equal(classifyErrorKind("", { errorKind: "max_turns" }), "max_turns");
    assert.equal(classifyErrorKind("", { errorKind: "max_budget" }), "max_budget");
    assert.equal(classifyErrorKind("", { errorKind: "limit" }), "limit");
  });

  it("meta.timedOut === true → 'timeout'", () => {
    assert.equal(classifyErrorKind("the node ran long", { timedOut: true }), "timeout");
  });

  it("message-text fallbacks map plain thrown messages to a token", () => {
    assert.equal(classifyErrorKind("usage limit reached, reset in 3h"), "limit");
    assert.equal(classifyErrorKind("fetch failed: ECONNREFUSED"), "network");
    assert.equal(classifyErrorKind('No connector "clay" registered for category "enrich".'), "no_connector");
    assert.equal(classifyErrorKind('No step runtime for kind "agent".'), "no_step_runtime");
    assert.equal(classifyErrorKind("Cannot read properties of undefined (reading 'name')"), "code_throw");
  });

  it("an empty/blank message with no signal → 'unknown'", () => {
    assert.equal(classifyErrorKind(""), "unknown");
    assert.equal(classifyErrorKind(null), "unknown");
    assert.equal(classifyErrorKind("   "), "unknown");
  });

  it("reads an Error object's message", () => {
    assert.equal(classifyErrorKind(new Error("socket hang up")), "network");
    assert.equal(classifyErrorKind(new Error("boom in the drafter")), "code_throw");
  });

  // A provider overload / 5xx is the most common REAL transient model failure. It must be recognized as a
  // model_error (transient), never fall through to code_throw and get filed as a self-inflicted bug.
  it("an Anthropic overload / 5xx model error → 'model_error', not 'code_throw'", () => {
    assert.equal(classifyErrorKind("Overloaded"), "model_error", "an Anthropic 529 overload is transient, not a bug");
    assert.equal(classifyErrorKind("API error: 500 Internal server error"), "model_error");
    assert.equal(classifyErrorKind("503 Service Unavailable"), "model_error");
    assert.equal(classifyErrorKind("Too Many Requests"), "model_error");
    // A 5xx status IS recognized when a real HTTP/status cue sits next to it.
    assert.equal(classifyErrorKind("HTTP 500"), "model_error");
    assert.equal(classifyErrorKind("status 503"), "model_error");
    assert.equal(classifyErrorKind("error code 502"), "model_error");
  });

  // Regression: a bare 500–599 number inside a genuine JS-exception message must NOT be read as a provider
  // 5xx. A stack frame, a JSON parse offset, an array bound, a source location, or a plain count all carry
  // three-digit 5xx-range numbers; filing them as transient would bury a real code-throw bug behind the
  // transient filter — the exact opposite of self-inflicted-bug detection.
  it("a bare 5xx-range number in a code-throw message stays 'code_throw' (self_inflicted), never transient", () => {
    for (const message of [
      "at line 523",
      "Unexpected token < in JSON at position 512",
      "index 512 out of bounds",
      "  at parseItems (foo.js:512:8)",
      "500 characters exceeded",
      "550 malformed rows",
    ]) {
      assert.equal(classifyErrorKind(message), "code_throw", `"${message}" is a real bug, not a 5xx`);
      assert.equal(classifyFault(classifyErrorKind(message), "node-error"), "self_inflicted", `"${message}" must surface as self_inflicted`);
    }
  });

  it("classifyAgentError's generic kind:'error' bucket maps to model_error (a provider error, not our code)", () => {
    assert.equal(classifyErrorKind("Overloaded", { errorKind: "error" }), "model_error");
    // Even an unrecognized generic provider-error message stays model_error, never code_throw — the SDK is
    // not our code, so an is_error result we could not name is treated as a provider-side model error.
    assert.equal(classifyErrorKind("some provider hiccup", { errorKind: "error" }), "model_error");
    // But a real transient token inside a generic error is pulled out to its precise kind.
    assert.equal(classifyErrorKind("rate limit reached", { errorKind: "error" }), "limit");
    assert.equal(classifyErrorKind("fetch failed", { errorKind: "error" }), "network");
  });

  it("a structured model_error / network errorKind is honored straight", () => {
    assert.equal(classifyErrorKind("anything", { errorKind: "model_error" }), "model_error");
    assert.equal(classifyErrorKind("anything", { errorKind: "network" }), "network");
  });

  it("the bad-output OBSERVATION signal (meta.badOutput) classifies without any errorKind flip", () => {
    assert.equal(classifyErrorKind("", { badOutput: "empty_output" }), "empty_output");
    assert.equal(classifyErrorKind("", { badOutput: "unparseable_output" }), "unparseable_output");
  });

  // A genuine JS exception must STILL be a code_throw — the model_error carve-out must not swallow real bugs.
  it("a genuine JS exception is still code_throw (the model_error branch never swallows a real bug)", () => {
    assert.equal(classifyErrorKind("Cannot read properties of undefined (reading 'name')"), "code_throw");
    assert.equal(classifyErrorKind("x is not a function"), "code_throw");
  });
});

// ─── classifyFault — the self-inflicted vs transient split (HARD REQ #2) ─────────

describe("classifyFault — self_inflicted vs transient", () => {
  it("transient kinds map to transient", () => {
    for (const kind of ["max_turns", "max_budget", "limit", "timeout", "network", "model_error"]) {
      assert.equal(classifyFault(kind, "node-error"), "transient", `${kind} is a retry-clears-it failure`);
    }
  });

  it("a provider overload (model_error) is transient — a wait-it-out outage, never a self-inflicted bug", () => {
    assert.equal(classifyFault("model_error", "node-error"), "transient");
    assert.equal(classifyFault("model_error", "run-crash"), "transient", "an overload mid-drive is a limit to wait out");
  });

  it("real bugs map to self_inflicted", () => {
    for (const kind of ["code_throw", "unparseable_output", "empty_output", "no_connector", "no_step_runtime", "missing_env_key", "unknown"]) {
      assert.equal(classifyFault(kind, "node-error"), "self_inflicted", `${kind} is a real bug to fix`);
    }
  });

  it("category override: run-stall is ALWAYS transient (even with a code_throw kind)", () => {
    assert.equal(classifyFault("code_throw", "run-stall"), "transient");
    assert.equal(classifyFault("unparseable_output", "run-stall"), "transient");
  });

  it("category override: run-crash is self_inflicted UNLESS its errorKind is transient (a quota crash stays transient)", () => {
    assert.equal(classifyFault("code_throw", "run-crash"), "self_inflicted", "a code throw mid-drive is a real bug");
    assert.equal(classifyFault("limit", "run-crash"), "transient", "a quota crash mid-drive is a limit to wait out, not a bug");
  });

  it("BOTH classes are produced and tagged distinctly (both are logged)", () => {
    const selfInflicted = classifyFault("code_throw", "node-error");
    const transient = classifyFault("timeout", "node-error");
    assert.equal(selfInflicted, "self_inflicted");
    assert.equal(transient, "transient");
    assert.notEqual(selfInflicted, transient, "the two classes are distinct tags, not merged");
  });
});

// ─── buildFailureContext — the rich reproducible context (HARD REQ #3) ───────────

describe("buildFailureContext — rich reproducible context", () => {
  it("pulls pipeline id+label, step id+label+kind, and the error snippet", () => {
    const ctx = buildFailureContext({
      category: "node-error",
      node: { id: "draft-1", kind: "agent", label: "Draft outreach" },
      result: { error: "the drafter blew up" },
      graphId: "g-outbound",
      graphLabel: "Outbound to WNY operators",
    });
    assert.equal(ctx.contextObject.pipeline.id, "g-outbound");
    assert.equal(ctx.contextObject.pipeline.label, "Outbound to WNY operators");
    assert.deepEqual(ctx.contextObject.step, { id: "draft-1", label: "Draft outreach", kind: "agent" });
    assert.equal(ctx.errorKind, "code_throw");
    assert.equal(ctx.failureClass, "self_inflicted");
    assert.match(ctx.errorSnippet, /the drafter blew up/);
  });

  it("summarizes upstream input as a count + safe name, never the raw item bodies", () => {
    const ctx = buildFailureContext({
      category: "node-error",
      node: { id: "d", kind: "agent", label: "Draft" },
      result: { error: "x" },
      graphId: "g1",
      inputItems: [
        { name: "Jane Doe", draft: "SECRET OUTBOUND BODY that must never leak" },
        { name: "Sam Roe", draft: "ANOTHER SECRET DRAFT" },
      ],
    });
    const serialized = JSON.stringify(ctx.contextObject);
    assert.match(ctx.contextObject.inputSummary, /2 items/);
    assert.match(ctx.contextObject.inputSummary, /Jane Doe/);
    assert.ok(!serialized.includes("SECRET OUTBOUND BODY"), "an item body must never reach the context");
    assert.ok(!serialized.includes("ANOTHER SECRET DRAFT"), "no item draft leaks into the summary");
  });

  it("a missing piece stays null/absent, never invented", () => {
    const ctx = buildFailureContext({ category: "run-crash", error: "the drive loop threw" });
    assert.equal(ctx.contextObject.step, null, "no node → step is null, not a fabricated placeholder");
    assert.equal(ctx.contextObject.pipeline.id, null);
    assert.equal(ctx.contextObject.pipeline.label, null);
    assert.equal(ctx.contextObject.sessionId, null);
    assert.equal(ctx.contextObject.inputSummary, "no upstream items");
  });

  it("resolves the graph id and session id off the session when not passed directly", () => {
    const ctx = buildFailureContext({
      category: "run-crash",
      error: "boom",
      session: { id: "sess-9", graphId: "g-from-session", goal: "Ship the referral pipeline" },
    });
    assert.equal(ctx.graphId, "g-from-session");
    assert.equal(ctx.contextObject.sessionId, "sess-9");
    assert.equal(ctx.contextObject.pipeline.label, "Ship the referral pipeline");
  });

  it("a bad-output result (meta.errorKind) is classified from the structured signal", () => {
    const ctx = buildFailureContext({
      category: "bad-output",
      node: { id: "d", kind: "agent", label: "Draft" },
      result: { ok: false, error: "model returned no parseable items", meta: { errorKind: "unparseable_output" } },
      graphId: "g1",
    });
    assert.equal(ctx.errorKind, "unparseable_output");
    assert.equal(ctx.failureClass, "self_inflicted", "garbage model output is a real bug, not transient");
  });
});

// ─── logFailure — write + DEDUP bump (HARD REQ #1) ──────────────────────────────

describe("logFailure — write + dedup bump", () => {
  let queueDir;
  beforeEach(() => { queueDir = tmpQueue(); });
  afterEach(() => fs.rmSync(queueDir, { recursive: true, force: true }));

  it("a fresh signature writes ONE new queue file with full observability frontmatter", () => {
    const out = logFailure(
      { category: "node-error", node: { id: "d", kind: "agent", label: "Draft" }, result: { error: "boom" }, graphId: "g1" },
      opts(queueDir),
    );
    assert.equal(out.bumped, false);
    assert.equal(out.occurrences, 1);

    const files = fs.readdirSync(queueDir).filter((f) => f.endsWith(".md"));
    assert.equal(files.length, 1, "exactly one queue file lands for a fresh failure");

    const text = fs.readFileSync(path.join(queueDir, files[0]), "utf8");
    assert.match(text, new RegExp(`signature: ${out.signature.replace(/[|]/g, "\\|")}`));
    assert.match(text, /category: node-error/);
    assert.match(text, /failure_class: self_inflicted/);
    assert.match(text, /occurrences: 1/);
    assert.match(text, /first_seen: 2026-07-09T12:00:00\.000Z/);
    assert.match(text, /last_seen: 2026-07-09T12:00:00\.000Z/);
    assert.match(text, /## What broke/);
    assert.match(text, /boom/);
    assert.match(text, /## Context/);
  });

  it("a SECOND matching-signature failure BUMPS occurrences instead of creating a new file", () => {
    const input = { category: "node-error", node: { id: "d", kind: "agent", label: "Draft" }, result: { error: "boom" }, graphId: "g1" };
    logFailure(input, opts(queueDir, "2026-07-09T12:00:00.000Z"));
    const second = logFailure(input, opts(queueDir, "2026-07-09T13:30:00.000Z"));

    assert.equal(second.bumped, true, "the second identical failure is a dedup bump, not a new entry");
    assert.equal(second.occurrences, 2);

    const files = fs.readdirSync(queueDir).filter((f) => f.endsWith(".md"));
    assert.equal(files.length, 1, "still ONE file — an identical failure does not spam the queue");

    const text = fs.readFileSync(path.join(queueDir, files[0]), "utf8");
    assert.match(text, /occurrences: 2/, "occurrences advanced to 2");
    assert.match(text, /last_seen: 2026-07-09T13:30:00\.000Z/, "last_seen advanced to the recurrence");
    assert.match(text, /first_seen: 2026-07-09T12:00:00\.000Z/, "first_seen stayed at the original");
    assert.match(text, /## Recurrences/, "a Recurrences bullet was appended");
  });

  it("N identical failures collapse to one file with occurrences = N", () => {
    const input = { category: "node-error", node: { id: "d", kind: "agent", label: "Draft" }, result: { error: "boom" }, graphId: "g1" };
    for (let i = 0; i < 5; i += 1) {
      logFailure(input, opts(queueDir, `2026-07-09T12:0${i}:00.000Z`));
    }
    const files = fs.readdirSync(queueDir).filter((f) => f.endsWith(".md"));
    assert.equal(files.length, 1);
    const { reports } = listFrictionQueue({ queueDir });
    assert.equal(reports[0].occurrences, 5, "five identical failures → occurrences 5 on one entry");
  });

  it("a different signature writes a separate file", () => {
    logFailure({ category: "node-error", node: { id: "d", kind: "agent", label: "Draft" }, result: { error: "boom" }, graphId: "g1" }, opts(queueDir));
    logFailure({ category: "node-error", node: { id: "e", kind: "agent", label: "Enrich" }, result: { error: "boom" }, graphId: "g1" }, opts(queueDir));
    const files = fs.readdirSync(queueDir).filter((f) => f.endsWith(".md"));
    assert.equal(files.length, 2, "two distinct failures → two files");
  });

  it("dedup keys on OPEN status: once an entry is resolved, the same failure opens a fresh entry", () => {
    const input = { category: "node-error", node: { id: "d", kind: "agent", label: "Draft" }, result: { error: "boom" }, graphId: "g1" };
    const first = logFailure(input, opts(queueDir));
    // Mark the entry resolved (a founder closing it), then the same failure recurs.
    const filePath = path.join(queueDir, first.file);
    const text = fs.readFileSync(filePath, "utf8").replace(/status: open/, "status: resolved");
    fs.writeFileSync(filePath, text);

    const reopened = logFailure(input, opts(queueDir, "2026-07-10T09:00:00.000Z"));
    assert.equal(reopened.bumped, false, "a resolved entry is not bumped — the failure opens a fresh one");
    const files = fs.readdirSync(queueDir).filter((f) => f.endsWith(".md"));
    assert.equal(files.length, 2, "the resolved file plus a fresh open entry");
  });

  it("the four capture categories are the observability taxonomy, not a GTM enum", () => {
    // A sanity pin on the exported taxonomy so a hook using one of these never silently misfiles.
    assert.deepEqual(FAILURE_CATEGORIES, ["run-crash", "run-stall", "node-error", "bad-output"]);
  });
});

// ─── safeLogFailure — NEVER THROWS (HARD REQ #4) ────────────────────────────────

describe("safeLogFailure — never throws", () => {
  it("swallows a logging failure on an unwritable queue dir (no throw, no crash into the caller)", () => {
    // Point the queue at a path whose parent is a FILE, so mkdirSync inside reportFriction throws.
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "failure-log-poison-"));
    const blocker = path.join(parent, "not-a-dir");
    fs.writeFileSync(blocker, "i am a file, not a directory");
    const poisonedQueueDir = path.join(blocker, "queue");

    let threw = false;
    try {
      safeLogFailure(
        { category: "node-error", node: { id: "d", kind: "agent", label: "Draft" }, result: { error: "boom" }, graphId: "g1" },
        { queueDir: poisonedQueueDir, now: "2026-07-09T12:00:00.000Z", gitSha: "sha" },
      );
    } catch {
      threw = true;
    }
    assert.equal(threw, false, "safeLogFailure must swallow a write failure — a run must not see it");
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("swallows a malformed input without throwing", () => {
    let threw = false;
    try {
      // A wildly malformed input (null, a non-object) must be swallowed, never thrown. Every call is
      // pinned to an isolated queue — even the undefined-input case, so a swallowed malformed log can
      // never leak an entry into the real repo dogfood/queue while asserting the never-throws contract.
      safeLogFailure(null, { queueDir: tmpQueue() });
      safeLogFailure(undefined, { queueDir: tmpQueue() });
      safeLogFailure({ category: 123, node: "not-a-node", result: 999 }, { queueDir: tmpQueue() });
    } catch {
      threw = true;
    }
    assert.equal(threw, false, "a malformed input is swallowed silently");
  });

  it("the run behaves identically whether logging succeeds or fails — a poisoned dir writes nothing observable", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "failure-log-noeffect-"));
    const blocker = path.join(parent, "blocker-file");
    fs.writeFileSync(blocker, "x");
    const poisonedQueueDir = path.join(blocker, "queue");

    const before = fs.existsSync(poisonedQueueDir);
    safeLogFailure(
      { category: "run-crash", error: "boom", session: { id: "s1" } },
      { queueDir: poisonedQueueDir, now: "2026-07-09T12:00:00.000Z", gitSha: "sha" },
    );
    // No queue was created; the caller's world is unchanged.
    assert.equal(fs.existsSync(poisonedQueueDir), before, "a failed log leaves no queue side effect");
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("on a healthy queue it delegates to logFailure and the entry lands", () => {
    const queueDir = tmpQueue();
    safeLogFailure(
      { category: "node-error", node: { id: "d", kind: "agent", label: "Draft" }, result: { error: "boom" }, graphId: "g1" },
      opts(queueDir),
    );
    const files = fs.readdirSync(queueDir).filter((f) => f.endsWith(".md"));
    assert.equal(files.length, 1, "the happy path still writes — never-throws is a guard, not a no-op");
    fs.rmSync(queueDir, { recursive: true, force: true });
  });
});
