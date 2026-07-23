// Drive token stream (streaming parity, W1): the payload-carrying half of the live seam.
//
// `subscribeVentureEvents` pushes data-free "something changed" notifications and a listener re-reads
// the surface. That is correct for durable state and wrong for tokens: a reply streaming at ~8 pings a
// second used to cost a full `getThreadTimeline` refetch per ping. This stream carries the payload
// itself — one snapshot, then append-only deltas — so the forming reply paints without any per-token
// server work, and the timeline refetch survives only for durable changes.
//
// Frames (server contract): `event: snapshot` carries the whole forming state, `event: delta` carries one
// stamped change, and `retry: 3000` plus a 25s `: ping` heartbeat keep the connection honest. A fresh
// connection opens with a snapshot; a `?since=<seq>` reconnect inside the server's replay window is
// answered with only the deltas it missed, and falls back to a snapshot when that window has passed. The
// caller handles both, so neither behaviour can duplicate or lose painted text.

export type DriveStreamTodo = { content: string; status: string };
export type DriveStreamTool = { name: string; partialInput: string };

// One live delta. `child` nests another delta under the subagent tool call that produced it, so a
// subagent's activity stays attributed instead of being merged into the parent's forming reply.
export type DriveStreamDelta =
  | { seq?: number; kind: "text"; text: string }
  | { seq?: number; kind: "tool"; name: string | null; partialInput?: string }
  | { seq?: number; kind: "tool-result"; name: string; target?: string | null; status?: string | null; detail?: string | null }
  | { seq?: number; kind: "thinking"; state: "start" | "stop"; durationMs?: number | null }
  | { seq?: number; kind: "todo"; items: DriveStreamTodo[] }
  | { seq?: number; kind: "child"; parentToolUseId: string; delta: DriveStreamDelta };

export type DriveStreamSnapshot = {
  seq?: number;
  text?: string;
  tool?: DriveStreamTool | null;
  thinking?: { state?: "start" | "stop"; durationMs?: number | null } | null;
  todos?: DriveStreamTodo[] | null;
  children?: unknown;
};

export type DriveStreamFrame =
  | { frame: "snapshot"; snapshot: DriveStreamSnapshot }
  | { frame: "delta"; delta: DriveStreamDelta };

// Whether this runtime can carry stream payload at all. Both surfaces can: the desktop bridge over
// IPC (the shipped product), the browser/dev harness over EventSource. Only a runtime with neither
// falls back to the degraded refresh.
export function driveStreamSupported(): boolean {
  if (window.droverDesktop?.api?.subscribeDrive) return true;
  return typeof EventSource !== "undefined";
}

// The desktop transport. It carries the same frames in the same order, so the caller's fold is
// identical; it has no `since` because the bridge never drops and reconnects mid-drive — the host
// holds one live subscription for as long as the renderer keeps it.
function subscribeDriveBridge(
  ventureId: string,
  driveId: string,
  onFrame: (frame: DriveStreamFrame) => void,
  onStateChange?: (state: "open" | "closed") => void,
): () => void {
  let stop: (() => void) | null = null;
  let closed = false;
  void window.droverDesktop!.api.subscribeDrive!(ventureId, driveId, (frame) => {
    if (!closed && frame) onFrame(frame as unknown as DriveStreamFrame);
  }).then((unsubscribe) => {
    if (closed) unsubscribe();
    else {
      stop = unsubscribe;
      onStateChange?.("open");
    }
    // A drive that settled between render and subscribe reads as a 404 here. That is the ordinary
    // race, not a failure: the durable timeline already carries the reply.
  }).catch(() => { if (!closed) onStateChange?.("closed"); });
  return () => {
    if (closed) return;
    closed = true;
    stop?.();
    onStateChange?.("closed");
  };
}

export function subscribeDriveStream(
  ventureId: string,
  driveId: string,
  onFrame: (frame: DriveStreamFrame) => void,
  onStateChange?: (state: "open" | "closed") => void,
  since?: number | null,
): () => void {
  if (window.droverDesktop?.api?.subscribeDrive) {
    return subscribeDriveBridge(ventureId, driveId, onFrame, onStateChange);
  }
  if (!driveStreamSupported()) {
    onStateChange?.("closed");
    return () => {};
  }
  const resume = typeof since === "number" && since > 0 ? `?since=${encodeURIComponent(String(since))}` : "";
  const source = new EventSource(
    `/api/ventures/${encodeURIComponent(ventureId)}/drives/${encodeURIComponent(driveId)}/stream${resume}`,
  );
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    source.close();
    onStateChange?.("closed");
  };
  const parse = (message: MessageEvent) => {
    try {
      return JSON.parse(message.data) as Record<string, unknown>;
    } catch {
      // A malformed frame is dropped. The next frame or a reconnect snapshot restores the truth.
      return null;
    }
  };
  source.addEventListener("snapshot", ((message: MessageEvent) => {
    const snapshot = parse(message);
    if (snapshot) onFrame({ frame: "snapshot", snapshot: snapshot as DriveStreamSnapshot });
  }) as EventListener);
  source.addEventListener("delta", ((message: MessageEvent) => {
    const delta = parse(message);
    if (delta) onFrame({ frame: "delta", delta: delta as DriveStreamDelta });
  }) as EventListener);
  source.onopen = () => onStateChange?.("open");
  // EventSource would retry this exact URL by itself, which would drop `?since` and replay from the
  // start. Close instead and let the caller reconnect with the sequence it actually reached.
  source.onerror = () => close();
  return close;
}
