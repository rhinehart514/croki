// Integration tests for the four self-observing failure CAPTURE PATHS — the run path actually filing a
// failure into the queue through safeLogFailure — plus the anti-cage guarantee.
//
// SCAFFOLD (lane: TESTS). Empty on purpose; the cases each test covers are listed below. Follow
// operator-runtime.test.mjs for driving a session with an isolated store root + injected stepRuntime, and
// friction.test.mjs for asserting the queue file that lands (isolated queueDir via options.queueDir).
//
// The wiring under test (already built — these tests verify it end to end):
//   (a) RUN CRASH  — operator-runtime.mjs session try/catch calls safeLogFailure({ category: "run-crash" }).
//   (b) RUN STALL  — operator-runtime.mjs watchdog calls safeLogFailure({ category: "run-stall" }).
//   (c) NODE ERROR — graph.mjs runGraph aggregate calls the injected onFailure; operator-tool-exec.mjs
//                    injects it → safeLogFailure({ category: "node-error" }).
//   (d) BAD OUTPUT — same onFailure injection, tagged "bad-output" when result.meta.errorKind is
//                    unparseable_output / empty_output (the model returned garbage, not a code throw).
//
// CASES TO COVER:
//
// (a) run-crash
//   - drive a session whose runtime THROWS in the drive loop → exactly one "run-crash" queue file lands,
//     tagged self_inflicted for a code throw; the session's "failed" status is UNCHANGED by logging.
//
// (b) run-stall
//   - a session that goes silent past the stall window and the watchdog ends → one "run-stall" file lands,
//     tagged transient (a run-stall is always transient); the watchdog's failed status is unchanged.
//
// (c) node-error
//   - a graph with a step that returns { ok:false, error } (a real node failure, NOT blocked/pending/blind)
//     → one "node-error" file with pipeline+step context; a code-throw error is self_inflicted.
//   - a BLOCKED / pendingReview / blind result does NOT log (only genuine failures are observed).
//
// (d) bad-output
//   - a node whose result.meta.errorKind is "unparseable_output" (or "empty_output") → tagged "bad-output"
//     and self_inflicted (the model gave garbage); DISTINCT from a code throw (which is "node-error").
//
// DEDUP across the run path (HARD REQ #1)
//   - the SAME node failing the same way twice bumps ONE file's occurrences, never two files.
//
// CLASSIFICATION split reaches the surface (HARD REQ #2)
//   - a transient failure (e.g. a timeout / limit node result) lands tagged transient; buildFailureLogView
//     (routes/system.mjs) puts it in transientCount, self-inflicted in selfInflictedCount.
//
// NEVER-THROWS in the run path (HARD REQ #4)
//   - with a poisoned queueDir (logging will throw internally), a run with a failing node still completes
//     with an identical session result — the failure never reaches the run.
//
// ANTI-CAGE holds (HARD REQ #5)
//   - importing/using failure-log adds NO new required contract, NO blocking gate, NO pre-run object: a run
//     that produces NO failure writes NOTHING and behaves identically. (Cross-check: brain/test/anti-cage.test.mjs
//     stays green — this feature is pure observation, so the gate/truth/taste invariants are untouched.)
