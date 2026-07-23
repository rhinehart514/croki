// drive-stream.mjs — the payload-carrying delta channel for ONE live drive (T3 streaming parity).
//
// firm-events.mjs is data-free on purpose: a subscriber hears "something changed in this venture" and
// re-reads the venture-scoped, fail-closed route that owns the state. That contract is right for durable
// truth and wrong for token deltas — every ping made the client rebuild the whole thread timeline, so a
// reply streamed more slowly the longer its Thread had run. This bus is the other half, and it stays
// SEPARATE rather than teaching firm-events to carry content:
//
//   • It carries payload, so it is scoped to ONE drive instead of a venture, and it never becomes a second
//     venture read path: the stream below runs the venture-scoped fail-closed guard and proves the drive
//     is live in THAT venture before a single frame is written. The bus itself holds no venture knowledge,
//     so nothing here can address a drive the requesting venture does not own.
//   • Every delta is stamped with a monotonic per-drive `seq` and kept in a small replay window, so a late
//     or reconnecting subscriber catches up with `?since=` instead of falling back to a timeline refetch.
//   • It is process-local, exactly like active-drives.mjs: the forming reply is presence, and the durable
//     conversation message is the truth once the drive settles.
//   • Publishing NEVER throws into the caller's happy path — the same best-effort contract firm-events.mjs
//     keeps, because a streaming adapter must not fail because a subscriber did.
//   • A thinking frame carries SHAPE ONLY — that a model is thinking and for how long. Raw chain-of-thought
//     never enters this bus (AGENTS.md: never expose hidden chain-of-thought as activity).

import { getFirmConfiguration } from "./configuration.mjs";

const KINDS = new Set(["text", "tool", "tool-result", "thinking", "todo", "child"]);

// Caps mirror the live-presence caps in active-drives.mjs: a very long reply, a runaway tool argument, a
// huge plan, or a fan-out of subagents can never grow this process-local state without bound. Only the
// snapshot is capped — a subscriber that has been attached the whole time saw every delta.
const TEXT_CAP = 64_000;
const TOOL_INPUT_CAP = 2_000;
const TODO_CAP = 100;
const CHILD_CAP = 8;
// The replay window a `?since=` reconnect is served from. Anything older gets a full snapshot instead —
// correct, just less economical than replay.
const RETAINED_DELTAS = 512;

const streams = new Map(); // driveId -> { seq, state, retained, listeners, nextListenerId }

function emptyState() {
  return { text: "", tool: null, thinking: null, todos: [], children: {} };
}

function streamFor(driveId) {
  let stream = streams.get(driveId);
  if (!stream) {
    stream = { seq: 0, state: emptyState(), retained: [], listeners: new Map(), nextListenerId: 1 };
    streams.set(driveId, stream);
  }
  return stream;
}

// Normalize one delta into the exact shape every subscriber can trust. An unknown or empty delta is
// dropped rather than thrown: the caller is a streaming adapter, not a validation surface.
function normalize(delta) {
  const kind = String(delta?.kind ?? "");
  if (!KINDS.has(kind)) return null;
  if (kind === "text") {
    const text = String(delta.text ?? "");
    return text ? { kind, text } : null;
  }
  if (kind === "tool") {
    // A null name closes the forming call, exactly like noteDriveToolInput's clear.
    return delta.name
      ? { kind, name: String(delta.name), partialInput: String(delta.partialInput ?? "").slice(-TOOL_INPUT_CAP) }
      : { kind, name: null, partialInput: "" };
  }
  if (kind === "tool-result") {
    return {
      kind,
      name: String(delta.name ?? "").slice(0, 120) || null,
      target: String(delta.target ?? "").slice(0, 480) || null,
      status: String(delta.status ?? "ok").slice(0, 40),
      detail: String(delta.detail ?? "").slice(0, 2_000) || null,
    };
  }
  if (kind === "thinking") {
    return {
      kind,
      state: delta.state === "stop" ? "stop" : "start",
      durationMs: Number.isFinite(delta.durationMs) ? Math.max(0, Math.round(delta.durationMs)) : null,
    };
  }
  if (kind === "todo") {
    return {
      kind,
      items: (Array.isArray(delta.items) ? delta.items : []).slice(0, TODO_CAP)
        .map((item) => ({ content: String(item?.content ?? "").slice(0, 480), status: String(item?.status ?? "pending").slice(0, 40) }))
        .filter((item) => item.content),
    };
  }
  // A subagent's nested delta. It is normalized through the same path, and it may not nest again — one
  // level of children is the whole model, so a bad adapter cannot build an unbounded tree here.
  const parentToolUseId = String(delta.parentToolUseId ?? "").trim();
  const child = normalize(delta.delta);
  return parentToolUseId && child && child.kind !== "child" ? { kind, parentToolUseId, delta: child } : null;
}

function applyDelta(state, delta) {
  if (delta.kind === "text") state.text = (state.text + delta.text).slice(-TEXT_CAP);
  else if (delta.kind === "tool") state.tool = delta.name ? { name: delta.name, partialInput: delta.partialInput } : null;
  // A returned tool closes whatever call was forming. The completed tool itself belongs to the durable
  // timeline, so the snapshot keeps presence rather than growing a second result log beside it.
  else if (delta.kind === "tool-result") state.tool = null;
  else if (delta.kind === "thinking") state.thinking = { state: delta.state, durationMs: delta.durationMs };
  else if (delta.kind === "todo") state.todos = delta.items;
  else if (delta.kind === "child") {
    const known = state.children[delta.parentToolUseId];
    const child = known ?? (Object.keys(state.children).length < CHILD_CAP ? (state.children[delta.parentToolUseId] = emptyState()) : null);
    if (child) applyDelta(child, delta.delta);
  }
}

// A copy, so a caller can never mutate live presence. Children recurse through the same shape and always
// terminate: a child's own `children` stays empty by construction.
function publicState(state) {
  return {
    text: state.text,
    tool: state.tool ? { ...state.tool } : null,
    thinking: state.thinking ? { ...state.thinking } : null,
    todos: state.todos.map((item) => ({ ...item })),
    children: Object.fromEntries(Object.entries(state.children).map(([id, child]) => [id, publicState(child)])),
  };
}

// Stamp one delta with this drive's next seq, fold it into the snapshot, retain it for replay, and fan it
// out. Best-effort in every direction: an unknown delta, a missing drive id, or a throwing subscriber all
// leave the streaming adapter's happy path untouched. Returns the stamped delta (or null when ignored).
export function publishDriveDelta(driveId, delta) {
  try {
    if (!driveId) return null;
    const normalized = normalize(delta);
    if (!normalized) return null;
    const stream = streamFor(driveId);
    stream.seq += 1;
    const stamped = { ...normalized, seq: stream.seq };
    applyDelta(stream.state, stamped);
    stream.retained.push(stamped);
    if (stream.retained.length > RETAINED_DELTAS) stream.retained.splice(0, stream.retained.length - RETAINED_DELTAS);
    for (const listener of [...stream.listeners.values()]) {
      try { listener(stamped); } catch { /* a broken subscriber never breaks the drive that is streaming */ }
    }
    return stamped;
  } catch {
    return null; // live presence is never worth failing a drive over
  }
}

// Subscribe to one drive's deltas. Returns an unsubscribe function. Scoping is by construction: a
// subscriber only ever hears the drive it named, and the route above proved that drive's venture first.
export function subscribeDriveDeltas(driveId, listener) {
  if (!driveId || typeof listener !== "function") {
    throw new Error("subscribeDriveDeltas() needs a driveId and a listener.");
  }
  const stream = streamFor(driveId);
  const id = stream.nextListenerId++;
  stream.listeners.set(id, listener);
  return () => { stream.listeners.delete(id); };
}

// The full current state plus the seq it is current as of — what a late or reconnecting subscriber needs
// to catch up in one frame. An unknown drive reads as an empty snapshot rather than an error: a drive that
// settled a moment ago is a normal race, not a failure.
export function driveSnapshot(driveId) {
  const stream = streams.get(driveId);
  return stream ? { seq: stream.seq, ...publicState(stream.state) } : { seq: 0, ...emptyState() };
}

// Called where the drive settles (active-drives.mjs). The durable conversation message is the truth from
// here, so the whole buffer goes. An SSE response still open is left to its client to close — it learns
// the drive settled through the existing drive ping and the timeline read, exactly as it always has.
export function dropDriveStream(driveId) {
  streams.delete(driveId);
}

// handleDriveDeltaStream — SSE frames for one drive, venture isolation first. The same fail-closed
// venture read guard handleDialogueEventStream runs (an unknown venture throws before a byte is written),
// and then the drive must be live IN THIS venture: `drives` is the requesting venture's own live drive
// list, passed in by the route because active-drives.mjs publishes INTO this bus and the architecture
// check forbids the import cycle that reading it back here would create. Another venture's drive id —
// and a settled one — read as 404. Headers, retry, and heartbeat match handleDialogueEventStream so both
// live streams behave identically to a client.
export function handleDriveDeltaStream({ ventureId, driveId, req, res, since = null, drives = [] }) {
  getFirmConfiguration(ventureId);
  if (!drives.some((drive) => drive.id === driveId)) {
    throw Object.assign(new Error(`No such active drive in this venture: ${driveId}`), { status: 404 });
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
  res.write("retry: 3000\n\n");
  const write = (event, data) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch { /* close cleanup owns the disconnected response */ }
  };
  // A reconnect replays only what it missed. A seq older than the retained window — or one this drive
  // never reached — falls back to the full snapshot, which is always enough to catch up.
  const stream = streams.get(driveId);
  const retained = stream?.retained ?? [];
  const from = Number.parseInt(String(since ?? ""), 10);
  const replayable = Number.isInteger(from) && from >= 0 && from <= (stream?.seq ?? 0)
    && (retained.length === 0 || from >= retained[0].seq - 1);
  if (replayable) for (const delta of retained) { if (delta.seq > from) write("delta", delta); }
  else write("snapshot", driveSnapshot(driveId));
  // Subscribing after the catch-up frame is safe without a gap: nothing can publish between the two, and
  // every delta from here carries the seq that follows what was just written.
  const unsubscribe = subscribeDriveDeltas(driveId, (delta) => write("delta", delta));
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* closed */ }
  }, 25_000);
  heartbeat.unref?.();
  const close = () => { clearInterval(heartbeat); unsubscribe(); };
  req.on("close", close);
  req.on("error", close);
}

export function __resetDriveStreams() {
  streams.clear();
}
