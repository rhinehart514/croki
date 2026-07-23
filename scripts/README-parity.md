# Streaming-parity baseline

`scripts/parity-baseline.mjs` measures whether talking to Claude/Codex through Croki feels like talking to
them natively, so a streaming change has a before/after number instead of an impression.

```
node scripts/parity-baseline.mjs --legs claude,codex,croki --brain http://127.0.0.1:4317
node scripts/parity-baseline.mjs --help    # usage; spawns nothing
```

Each leg runs the same short prompt once (`--runs N` to repeat; every run spends provider credits, and the
command prints what it is about to spend before it starts). Output is a markdown table on stdout plus a
frame-level trace at `artifacts/parity/<iso-timestamp>.json`. Exit code is 1 when any leg failed.

## Legs

| Leg | What it drives |
|---|---|
| `claude` | `claude -p "<prompt>" --output-format stream-json --verbose --include-partial-messages` |
| `codex` | `codex exec --json --skip-git-repo-check "<prompt>"` |
| `croki` | `POST /api/ventures/:id/conversation/reply`, then `GET /api/ventures/:id/events` (SSE) and `GET /api/ventures/:id/threads/:threadId/timeline` — the same routes the desktop renderer uses |

`--include-partial-messages` is on by default so the native Claude leg reports a real token-delta TTFT;
`--no-partial-messages` measures whole-message frames instead. Do not compare numbers across that switch.

## Metrics

- **TTFT ms** — first frame that moved readable assistant text forward.
- **Gap p50 / p95 / max** — distribution between *visible* frames. Protocol chatter between two visible
  updates is not motion a founder perceives; a stall between them is exactly what "not native" feels like.
- **Frames / Visible / Bytes** — every observation the client had to read, and how many were worth reading.
- **Refetches / SSE / Deltas** (Croki only) — venture stream events received, full timeline re-reads they
  forced, and frames from the per-drive delta stream (`GET /api/ventures/:id/drives/:driveId/stream`) when
  the brain exposes it. The firm event stream is data-free by design (`brain/src/firm/firm-events.mjs`), so
  each notification costs a whole-timeline read; that count is the cost a native stream does not pay.

Both Croki channels feed the same visible-frame accounting, so whichever delivers readable text first owns
TTFT. When the delta stream is open the run therefore reports the *best available* path, not the refetch path
alone — the trace keeps every frame's `kind` (`timeline-refetch`, `delta:text`, `sse:<kind>`) and a
`deltaStream: "open" | "unavailable"` marker so either channel can be scored on its own afterwards.

## Croki leg prerequisites

A brain must already be listening (`npm run app`, or `PORT=4317 node brain/src/server.mjs`) with at least one
venture, and it must accept a founder write: start it with `DROVER_DEV_FOUNDER=1` (loopback development
hatch), or export the desktop host's `GTM_IDE_FOUNDER_CAPABILITY` so the harness signs its own capability
claim. Without a reachable brain, venture, or accepted write, the leg fails loudly and reports no numbers —
it never estimates.

Add `--runtime claude-code` (or `codex`) to send the turn as a Work-mode composer turn against a specific SDK,
which is the closest comparison to the native legs. Without it the firm routes the direction itself, and a
reply that classifies as something other than a new direction returns no Thread to measure — the leg says so.
