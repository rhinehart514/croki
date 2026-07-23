#!/usr/bin/env node
// parity-baseline.mjs — the streaming-parity measurement harness (workstream W0).
//
// The question this answers with numbers rather than impressions: does talking to Claude/Codex THROUGH
// Croki feel like talking to them natively? It runs one short, deterministic prompt three ways and
// records a timing trace for each leg:
//
//   claude  →  `claude -p "<prompt>" --output-format stream-json --verbose` — one timestamp per stdout line.
//   codex   →  `codex exec --json "<prompt>"`                              — one timestamp per stdout JSONL line.
//   croki   →  POST /api/ventures/:id/conversation/reply on a RUNNING brain, then live on
//              GET /api/ventures/:id/events (SSE) and re-read
//              GET /api/ventures/:id/threads/:threadId/timeline exactly the way the desktop client does.
//
// The Croki leg is shaped like the real client, not like a private fast path: firm-events.mjs is data-free by
// construction, so every "something changed" ping costs the client a FULL timeline re-read, and that refetch
// count is itself a parity metric. When the brain exposes the payload-carrying drive delta stream, this
// harness follows it too — whichever channel delivers readable text first owns time-to-first-visible-token.
//
// The Croki leg never fabricates numbers: no brain, no venture, a refused founder write, or a missing route
// each fail LOUDLY with the exact thing to fix. Cost is announced before anything is spawned.

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PROMPT = "In three sentences, explain what a git worktree is.";
const ALL_LEGS = ["claude", "codex", "croki"];

const USAGE = `parity-baseline.mjs — measure Croki streaming parity against native Claude and Codex.

Usage
  node scripts/parity-baseline.mjs [options]

Options
  --prompt "<text>"     Prompt sent to every leg (default: ${JSON.stringify(DEFAULT_PROMPT)})
  --legs a,b,c          Legs to run: claude, codex, croki (default: all three)
  --runs N              Runs per leg (default: 1 — each run spends provider credits)
  --brain <url>         Running brain base URL (default: http://127.0.0.1:${process.env.PORT || 4317})
  --venture <id>        Venture for the Croki leg (default: the first venture the brain lists)
  --runtime <id>        Croki composer runtime, e.g. claude-code or codex (default: let the firm route)
  --model <id>          Croki composer model (only meaningful with --runtime)
  --timeout-ms N        Per-run ceiling (default: 120000)
  --no-partial-messages Drop --include-partial-messages from the native Claude leg
  --out <dir>           Trace directory (default: artifacts/parity)
  --help                Print this and exit without spawning anything

Croki leg prerequisites
  A brain must already be listening (npm run app, or PORT=4317 node brain/src/server.mjs) and it must
  accept a founder write: either start it with DROVER_DEV_FOUNDER=1 (loopback development hatch) or export
  the desktop host's GTM_IDE_FOUNDER_CAPABILITY secret so this harness can sign its own capability claim.

Output
  A markdown table on stdout plus the full frame-level trace at <out>/<iso-timestamp>.json`;

// Arguments

function parseArgs(argv) {
  const args = {
    prompt: DEFAULT_PROMPT, legs: [...ALL_LEGS], runs: 1, brain: `http://127.0.0.1:${process.env.PORT || 4317}`,
    venture: null, runtime: null, model: null, timeoutMs: 120_000, partialMessages: true,
    out: path.join(REPO_ROOT, "artifacts", "parity"), help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      if (argv[index + 1] === undefined) throw new Error(`${flag} needs a value.`);
      index += 1;
      return argv[index];
    };
    switch (flag) {
      case "--help": case "-h": args.help = true; break;
      case "--prompt": args.prompt = value(); break;
      case "--legs": args.legs = value().split(",").map((leg) => leg.trim()).filter(Boolean); break;
      case "--runs": args.runs = Number(value()); break;
      case "--brain": args.brain = value().replace(/\/+$/, ""); break;
      case "--venture": args.venture = value(); break;
      case "--runtime": args.runtime = value(); break;
      case "--model": args.model = value(); break;
      case "--timeout-ms": args.timeoutMs = Number(value()); break;
      case "--no-partial-messages": args.partialMessages = false; break;
      case "--out": args.out = path.resolve(value()); break;
      default: throw new Error(`Unknown option: ${flag}`);
    }
  }
  const unknownLegs = args.legs.filter((leg) => !ALL_LEGS.includes(leg));
  if (unknownLegs.length) throw new Error(`Unknown leg(s): ${unknownLegs.join(", ")}. Known legs: ${ALL_LEGS.join(", ")}.`);
  if (!Number.isInteger(args.runs) || args.runs < 1) throw new Error("--runs must be a positive integer.");
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1_000) throw new Error("--timeout-ms must be at least 1000.");
  return args;
}

// Metrics

// A frame is one observation the founder could have seen: a native stdout line, a timeline re-read, or a
// drive delta. `visible` marks the frames that moved readable assistant text forward — the only kind of
// frame a founder perceives as streaming.
function frame({ startedAt, bytes = 0, visible = false, kind }) {
  return { at: Math.round(performance.now() - startedAt), bytes, visible, kind };
}

function percentile(sortedValues, fraction) {
  if (!sortedValues.length) return null;
  const rank = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(fraction * sortedValues.length) - 1));
  return sortedValues[rank];
}

// Gaps are measured between VISIBLE frames on purpose: protocol chatter between two visible updates is not
// perceived as motion, and a stall between them is exactly what "does not feel native" means.
function summarize(run) {
  const frames = run.frames ?? [];
  const visible = frames.filter((entry) => entry.visible);
  const gaps = visible.slice(1).map((entry, index) => entry.at - visible[index].at).sort((a, b) => a - b);
  return {
    ok: run.ok === true, error: run.error ?? null,
    ttftMs: visible.length ? visible[0].at : null,
    totalMs: run.totalMs ?? (frames.length ? frames[frames.length - 1].at : null),
    frames: frames.length, visibleFrames: visible.length,
    bytes: frames.reduce((total, entry) => total + (entry.bytes ?? 0), 0),
    gapP50Ms: percentile(gaps, 0.5), gapP95Ms: percentile(gaps, 0.95),
    gapMaxMs: gaps.length ? gaps[gaps.length - 1] : null,
    timelineRefetches: run.timelineRefetches ?? null, streamEvents: run.streamEvents ?? null,
    deltaFrames: run.deltaFrames ?? null, replyChars: run.replyChars ?? null,
  };
}

// Native legs

function resolveBinary(name) {
  const lookup = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(lookup, [name], { encoding: "utf8" });
  const resolved = found.status === 0 ? String(found.stdout).split("\n")[0].trim() : "";
  return resolved || null;
}

// Claude's stream-json is JSONL. With --include-partial-messages it carries real token deltas; without it the
// first visible frame is a whole assistant message, so the two modes are comparable only within themselves.
function claudeVisibleText(event) {
  if (event?.type === "stream_event") {
    const delta = event.event?.delta;
    if (event.event?.type === "content_block_delta" && (delta?.type === "text_delta" || delta?.type === "thinking_delta")) {
      return String(delta.text ?? delta.thinking ?? "");
    }
    return "";
  }
  const content = event?.type === "assistant" ? event.message?.content : null;
  if (Array.isArray(content)) return content.filter((block) => block?.type === "text").map((block) => String(block.text ?? "")).join("");
  if (event?.type === "result" && typeof event.result === "string") return event.result;
  return "";
}

// Codex's JSONL is decoded the defensive way brain/src/runtimes/codex.mjs decodes it: keep the families that
// carry readable agent text, and tolerate a client version that adds delta events.
function codexVisibleText(event) {
  const item = event?.item ?? {};
  if (event?.type === "item.completed" && item.type === "agent_message") return String(item.text ?? item.content ?? "");
  if ((event?.type === "item.updated" || event?.type === "item.delta") && /agent_message/.test(String(item.type ?? event?.item_type ?? ""))) {
    return String(event.delta ?? item.delta ?? item.text ?? "");
  }
  if (event?.type === "turn.completed" && event.summary) return String(event.summary);
  return "";
}

async function runNativeLeg({ leg, binary, args, visibleText, timeoutMs, cwd }) {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const frames = [];
    let pending = "";
    let stderr = "";
    let replyChars = 0;
    let settled = false;
    const child = spawn(binary, args, { cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ leg, binary, args, frames, replyChars, totalMs: Math.round(performance.now() - startedAt), ...result });
    };
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish({ ok: false, error: `${leg} exceeded --timeout-ms (${timeoutMs}ms).` }); }, timeoutMs);
    const consume = (line) => {
      if (!line.trim()) return;
      let event = null;
      try { event = JSON.parse(line); } catch { /* a non-JSON line is still a frame the client had to read */ }
      const text = event ? visibleText(event) : "";
      if (text) replyChars += text.length;
      frames.push(frame({ startedAt, bytes: Buffer.byteLength(line, "utf8"), visible: Boolean(text), kind: event?.type ?? "raw" }));
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) consume(line);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish({ ok: false, error: `${leg} could not spawn ${binary}: ${error.message}` }));
    child.on("close", (code) => {
      if (pending.trim()) consume(pending);
      if (code === 0) finish({ ok: true, error: null });
      else finish({ ok: false, error: `${leg} exited ${code}. ${stderr.trim().slice(-400) || "(no stderr)"}` });
    });
  });
}

// Croki leg — the real brain, over the real routes

const transportFor = (url) => (url.protocol === "https:" ? https : http);

function brainRequest(base, { method = "GET", route, body = null }) {
  const url = new URL(route, base);
  const payload = body == null ? null : Buffer.from(JSON.stringify(body), "utf8");
  const headers = { Accept: "application/json" };
  if (payload) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(payload.length);
  }
  // The desktop host signs a narrow method+path claim per founder write (brain/src/routes/founder-authority.mjs).
  // With that secret exported this harness signs the same claim; without it the write fails closed and says so.
  const secret = String(process.env.GTM_IDE_FOUNDER_CAPABILITY ?? "").trim();
  if (secret && method !== "GET") {
    const issuedAt = Date.now();
    const nonce = crypto.randomUUID();
    const claimPath = url.pathname + url.search;
    const signature = crypto.createHmac("sha256", secret)
      .update(`${method.toUpperCase()}\n${claimPath}\n${issuedAt}\n${nonce}`).digest("base64url");
    headers["x-drover-founder-capability"] = `v1.${issuedAt}.${nonce}.${signature}`;
  }
  return new Promise((resolve, reject) => {
    const request = transportFor(url).request(url, { method, headers }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { /* a non-JSON body is surfaced verbatim below */ }
        resolve({ status: response.statusCode ?? 0, body: parsed, text, bytes: Buffer.byteLength(text, "utf8") });
      });
    });
    request.on("error", (error) => reject(new Error(`${method} ${url.href} failed: ${error.message}`)));
    if (payload) request.write(payload);
    request.end();
  });
}

// EventSource-equivalent over plain http, used for both live brain streams: frames are `event: <kind>` +
// `data: <json>` blocks separated by a blank line, with `: ping` comment heartbeats.
function openEventStream(base, route, onEvent) {
  const url = new URL(route, base);
  return new Promise((resolve, reject) => {
    const request = transportFor(url).get(url, { headers: { Accept: "text/event-stream" } }, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`${url.href} refused the stream: ${response.statusCode}`)); return; }
      let buffer = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        buffer += chunk;
        let split = buffer.indexOf("\n\n");
        while (split !== -1) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const kind = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? null;
          let data = null;
          try { data = JSON.parse(/^data:\s*([\s\S]+)$/m.exec(block)?.[1] ?? "null"); } catch { /* keep the frame, drop the payload */ }
          onEvent({ kind, data, bytes: Buffer.byteLength(block, "utf8") + 2, comment: block.trimStart().startsWith(":") });
          split = buffer.indexOf("\n\n");
        }
      });
      resolve({ close: () => { request.destroy(); response.destroy(); } });
    });
    request.on("error", (error) => reject(new Error(`Could not open ${url.href}: ${error.message}`)));
  });
}

// Everything the founder can read as assistant prose in this thread: durable teammate turns plus the
// live streaming turn the timeline projects from the active drive's liveText.
function assistantChars(timeline) {
  const items = Array.isArray(timeline?.items) ? timeline.items : [];
  return items
    .filter((item) => item.kind === "message" && item.role === "teammate")
    .reduce((total, item) => total + String(item.content ?? "").length, 0);
}

async function runCrokiLeg({ base, prompt, ventureId, runtime, model, timeoutMs }) {
  const startedAt = performance.now();
  const frames = [];
  let streamEvents = 0;
  let timelineRefetches = 0;

  const ventures = await brainRequest(base, { route: "/api/ventures" }).catch((error) => {
    throw new Error(`No brain answered at ${base}. Start one (npm run app, or PORT=4317 node brain/src/server.mjs) before the croki leg. ${error.message}`);
  });
  if (ventures.status !== 200) throw new Error(`GET /api/ventures returned ${ventures.status} — the croki leg cannot run against this brain.`);
  const list = ventures.body?.ventures ?? [];
  const venture = ventureId ? list.find((entry) => entry.id === ventureId) : list[0];
  if (!venture) {
    throw new Error(ventureId
      ? `This brain has no venture "${ventureId}". Known: ${list.map((entry) => entry.id).join(", ") || "(none)"}.`
      : "This brain has no ventures, so there is no Thread to drive. Create one in the desktop app first.");
  }

  // Subscribe BEFORE sending, like the client: an event firing between send and subscription would be
  // invisible and would inflate TTFT. The handler binds through a mutable hook so the stream opens once.
  let onStreamEvent = () => {};
  const stream = await openEventStream(base, `/api/ventures/${encodeURIComponent(venture.id)}/events`, (event) => onStreamEvent(event));
  let driveStream = null;

  try {
    const send = await brainRequest(base, {
      method: "POST",
      route: `/api/ventures/${encodeURIComponent(venture.id)}/conversation/reply`,
      body: { message: prompt, ...(runtime ? { mode: "work", runtime, ...(model ? { model } : {}) } : {}) },
    });
    const detail = send.body?.error ?? send.text.slice(0, 200);
    if (send.status === 403 || send.status === 503) throw new Error(`The brain refused the founder write (${send.status}: ${detail}). Restart it with DROVER_DEV_FOUNDER=1, or export GTM_IDE_FOUNDER_CAPABILITY from the desktop host.`);
    if (send.status !== 200 && send.status !== 202) throw new Error(`POST /api/ventures/${venture.id}/conversation/reply returned ${send.status}: ${detail}`);
    const threadRef = send.body?.threadRef ?? null;
    if (!threadRef) throw new Error(`The reply was accepted as act "${send.body?.act ?? "unknown"}" but returned no threadRef, so there is no Thread timeline to measure. Try --runtime claude-code (or codex) so the turn dispatches as a new direction.`);
    const threadId = String(threadRef).replace(/^thread:/, "");
    const timelineRoute = `/api/ventures/${encodeURIComponent(venture.id)}/threads/${encodeURIComponent(threadId)}/timeline`;

    // Exactly the client's loop: an event says "something changed", and the client re-reads the whole
    // timeline to find out what. Refetches are serialized so an overlapping read cannot distort a gap.
    // The first read only SEEDS the assistant-text baseline — an existing Thread already holds teammate
    // prose, and counting it as the first visible frame would report a fictional zero-millisecond TTFT.
    let maxChars = 0;
    let seeded = false;
    let deltaChars = 0;
    let deltaFrames = 0;
    let running = true;
    let refetching = false;
    let queued = false;
    let settle = null;
    const done = new Promise((resolve) => { settle = resolve; });

    // The payload-carrying half of the seam (brain/src/firm/drive-stream.mjs, when this brain has it): one
    // live drive's token deltas, the path that does NOT cost a whole-timeline read. A brain without that
    // route still measures fine — the leg just reports deltaStream "unavailable".
    let following = false;
    const followDrive = async (runRef) => {
      if (following || !runRef) return;
      following = true;
      const driveId = String(runRef).replace(/^run:/, "");
      driveStream = await openEventStream(base, `/api/ventures/${encodeURIComponent(venture.id)}/drives/${encodeURIComponent(driveId)}/stream`, (event) => {
        if (event.comment || !event.kind || !running) return;
        const text = event.kind === "snapshot" ? String(event.data?.text ?? "") : (event.data?.kind === "text" ? String(event.data.text ?? "") : "");
        const chars = event.kind === "snapshot" ? Math.max(deltaChars, text.length) : deltaChars + text.length;
        const grew = chars > deltaChars;
        deltaChars = chars;
        deltaFrames += 1;
        frames.push(frame({ startedAt, bytes: event.bytes, visible: grew, kind: `delta:${event.data?.kind ?? event.kind}` }));
      }).catch(() => null);
    };

    const refetch = async () => {
      if (!running) return;
      if (refetching) { queued = true; return; }
      refetching = true;
      try {
        const response = await brainRequest(base, { route: timelineRoute });
        timelineRefetches += 1;
        if (response.status !== 200) {
          settle({ ok: false, error: `GET ${timelineRoute} returned ${response.status}: ${response.body?.error ?? ""}` });
          return;
        }
        const timeline = response.body?.timeline ?? null;
        const chars = assistantChars(timeline);
        const grew = seeded && chars > maxChars;
        maxChars = Math.max(maxChars, chars);
        seeded = true;
        frames.push(frame({ startedAt, bytes: response.bytes, visible: grew, kind: "timeline-refetch" }));
        const agents = Array.isArray(timeline?.agents) ? timeline.agents : [];
        await followDrive(agents.find((agent) => agent.runRef)?.runRef ?? null);
        const durableReply = (timeline?.items ?? []).some((item) => item.kind === "message" && item.role === "teammate" && item.streaming !== true);
        if (agents.length === 0 && durableReply) settle({ ok: true, error: null });
      } catch (error) {
        settle({ ok: false, error: error.message });
      } finally {
        refetching = false;
        if (queued && running) { queued = false; void refetch(); }
      }
    };

    onStreamEvent = (event) => {
      if (event.comment || !event.kind) return;
      streamEvents += 1;
      frames.push(frame({ startedAt, bytes: event.bytes, visible: false, kind: `sse:${event.kind}` }));
      if (["drive", "conversation", "timeline"].includes(event.kind)) void refetch();
    };

    const timer = setTimeout(() => settle({ ok: false, error: `The croki leg exceeded --timeout-ms (${timeoutMs}ms) before the reply settled.` }), timeoutMs);
    timer.unref?.();
    void refetch(); // the send itself is a change the client would already be re-reading
    const outcome = await done;
    running = false;
    clearTimeout(timer);
    return {
      leg: "croki", ventureId: venture.id, threadRef, runtime: runtime ?? "(firm-routed)", model: model ?? null,
      frames, streamEvents, timelineRefetches, deltaFrames,
      deltaStream: driveStream ? "open" : "unavailable",
      replyChars: Math.max(maxChars, deltaChars),
      totalMs: Math.round(performance.now() - startedAt), ...outcome,
    };
  } finally {
    stream.close();
    driveStream?.close();
  }
}

// Report

const cell = (value) => (value === null || value === undefined ? "—" : String(value));

function markdownTable(rows) {
  const header = ["Leg", "Run", "OK", "TTFT ms", "Total ms", "Frames", "Visible", "Gap p50", "Gap p95", "Gap max", "Bytes", "Refetches", "SSE", "Deltas", "Reply chars"];
  const columns = ["ttftMs", "totalMs", "frames", "visibleFrames", "gapP50Ms", "gapP95Ms", "gapMaxMs", "bytes", "timelineRefetches", "streamEvents", "deltaFrames", "replyChars"];
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${[row.leg, row.run, row.metrics.ok ? "yes" : "NO", ...columns.map((key) => cell(row.metrics[key]))].join(" | ")} |`),
  ].join("\n");
}

// Main

// One leg is one recipe. The two native legs differ only in which binary they spawn, the argv that puts it
// in JSONL streaming mode, and how a decoded line reveals readable assistant text.
function nativeLegPlan(leg, args) {
  if (leg === "claude") {
    return {
      binary: "claude",
      argv: ["-p", args.prompt, "--output-format", "stream-json", "--verbose", ...(args.partialMessages ? ["--include-partial-messages"] : [])],
      visibleText: claudeVisibleText,
    };
  }
  return { binary: "codex", argv: ["exec", "--json", "--skip-git-repo-check", args.prompt], visibleText: codexVisibleText };
}

async function runLeg(leg, args) {
  if (leg === "croki") {
    return runCrokiLeg({ base: args.brain, prompt: args.prompt, ventureId: args.venture, runtime: args.runtime, model: args.model, timeoutMs: args.timeoutMs })
      .catch((error) => ({ leg, ok: false, error: error.message, frames: [] }));
  }
  const plan = nativeLegPlan(leg, args);
  const binary = resolveBinary(plan.binary);
  if (!binary) return { leg, ok: false, error: `The \`${plan.binary}\` CLI was not found on PATH.`, frames: [] };
  return runNativeLeg({ leg, binary, args: plan.argv, visibleText: plan.visibleText, timeoutMs: args.timeoutMs, cwd: REPO_ROOT });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const providerLegs = args.legs.filter((leg) => leg !== "croki");
  const totalProviderRuns = providerLegs.length * args.runs + (args.legs.includes("croki") ? args.runs : 0);
  process.stdout.write([
    "About to spend real provider credits.",
    `  Legs:    ${args.legs.join(", ")}`,
    `  Runs:    ${args.runs} per leg (${totalProviderRuns} billed model turns in total)`,
    `  Prompt:  ${JSON.stringify(args.prompt)}`,
    `  Brain:   ${args.legs.includes("croki") ? args.brain : "(croki leg not selected)"}`, "",
  ].join("\n"));

  const rows = [];
  const runs = [];
  for (const leg of args.legs) {
    for (let run = 1; run <= args.runs; run += 1) {
      process.stdout.write(`→ ${leg} run ${run}/${args.runs}…\n`);
      const result = await runLeg(leg, args);
      const metrics = summarize(result);
      if (!metrics.ok) process.stderr.write(`   FAILED: ${metrics.error}\n`);
      rows.push({ leg, run, metrics });
      runs.push({ leg, run, ...result, metrics });
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync(args.out, { recursive: true });
  const tracePath = path.join(args.out, `${stamp}.json`);
  fs.writeFileSync(tracePath, `${JSON.stringify({
    at: new Date().toISOString(), prompt: args.prompt, legs: args.legs, runs: args.runs, brain: args.brain,
    partialMessages: args.partialMessages, node: process.version, platform: process.platform, results: runs,
  }, null, 2)}\n`, "utf8");

  process.stdout.write(`\n${markdownTable(rows)}\n\nGaps are measured between VISIBLE frames only; "Refetches" is the number of full timeline re-reads the\nCroki client had to make because the venture event stream carries no data.\nTrace: ${tracePath}\n`);
  return rows.every((row) => row.metrics.ok) ? 0 : 1;
}

main().then(
  (code) => { process.exitCode = code; },
  (error) => { process.stderr.write(`${error?.message ?? error}\n`); process.exitCode = 2; },
);
