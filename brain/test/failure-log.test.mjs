// Tests for the self-observing failure-log CORE (brain/src/failure-log.mjs).
//
// SCAFFOLD (lane: TESTS). This file is empty on purpose — it lists, as comments, the exact cases the TESTS
// builder writes. Follow the existing patterns in friction.test.mjs (isolated queueDir per test via a tmp
// dir + options.queueDir, deterministic options.now, options.gitSha) so no test touches the real repo queue.
//
// Import surface (all already exported from ../src/failure-log.mjs):
//   failureSignature, classifyErrorKind, classifyFault, buildFailureContext, logFailure, safeLogFailure,
//   FAILURE_CATEGORIES
//
// CASES TO COVER:
//
// failureSignature — the stable dedup key
//   - identical (category, errorKind, nodeKind, nodeLabel, graphId) → identical signature (dedup collides).
//   - a different graphId (same node/error) → a DIFFERENT signature (two pipelines, two bugs).
//   - two different agent steps failing the same way → distinct signatures (the nodeLabel slug suffix on a
//     generic kind keeps them apart).
//   - a crash/stall with no node → node part is the literal "session"; no graph → graph part is "session".
//   - empty/whitespace parts normalize to "unknown", never silently merging two distinct failures.
//
// classifyErrorKind — raw error/meta → normalized token
//   - meta.errorKind of "unparseable_output" / "empty_output" wins (the bad-output path).
//   - meta.errorKind of max_turns / max_budget / limit is preserved.
//   - meta.timedOut === true → "timeout".
//   - message-text fallbacks: limit/quota → "limit"; network (ECONN/ENOTFOUND/fetch failed) → "network";
//     "No connector … registered" → "no_connector"; a plain thrown message → "code_throw"; empty → "unknown".
//
// classifyFault — the self-inflicted vs transient split (HARD REQ #2)
//   - transient kinds (max_turns, max_budget, limit, timeout, network) → "transient".
//   - a real bug (code_throw, unparseable_output, empty_output, no_connector) → "self_inflicted".
//   - category override: run-stall is ALWAYS transient (even with a code_throw kind).
//   - category override: run-crash is self_inflicted UNLESS its errorKind is transient (a quota crash → transient).
//   - assert BOTH classes are produced and tagged distinctly (both are logged, per the requirement).
//
// buildFailureContext — the rich reproducible context (HARD REQ #3)
//   - pulls pipeline id+label, step id+label+kind, a short input SUMMARY (count + safe name, never bodies),
//     the error snippet, from node/result/graphId/session.
//   - a missing piece stays null/absent, never invented.
//   - NEVER leaks item bodies or an agent system prompt into the context (the safe-input-summary rule).
//
// logFailure — write + DEDUP bump (HARD REQ #1)
//   - a fresh signature writes ONE new queue file: occurrences 1, first_seen === last_seen, frontmatter
//     carries signature/category/failure_class/occurrences/first_seen/last_seen.
//   - a SECOND failure with a MATCHING open signature does NOT create a new file — it BUMPS occurrences to 2,
//     advances last_seen, appends a Recurrences bullet. (dedup: identical failures don't spam the queue.)
//   - a different signature writes a separate file.
//   - dedup keys on OPEN status: once an entry is marked resolved, the same failure OPENS a fresh entry.
//
// safeLogFailure — NEVER THROWS (HARD REQ #4)
//   - a logging failure (e.g. an unwritable queueDir, or a malformed input) is swallowed: the call returns
//     without throwing and without altering anything the caller can observe.
//   - the run path behaves identically whether logging succeeds or fails (assert no throw + no side effect
//     on a poisoned queueDir).
