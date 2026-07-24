type DroverRepositorySelection = {
  path: string;
  name: string;
};

type DroverTerminalTarget = {
  ventureId: string;
  workspaceId: string;
  cols: number;
  rows: number;
};

type DroverTerminalData = { sessionId: string; data: string };
type DroverTerminalExit = {
  sessionId: string;
  exitCode: number;
  signal?: number;
  terminal: "completed" | "failed" | "cancelled";
};
type DroverTerminalOpen = { sessionId: string; snapshot: string; exit: DroverTerminalExit | null };

type DroverPreviewAnnotationEvent = {
  workspaceId: string;
  annotation: unknown;
  screenshot: { mimeType: string; data: string; size: number } | null;
};

// The <webview> tag Electron adds to the renderer; the browser build never renders one.
// Its JSX intrinsic lives in webview.d.ts (a module, so it augments React instead of replacing it).
type DroverWebviewElement = HTMLElement & {
  src: string;
  getWebContentsId: () => number;
  reload: () => void;
};

// One typed work delta — the safe factual shape of live work the brain pushes for a focused node
// (Reshape decisions 27/28). A small discriminated union: it carries a tool-step label, an optional
// source ref, a status, a step id to correlate started/finished, and a measured duration — NEVER
// chain-of-thought, prose, secrets, or content. brain/src/firm/work-delta.mjs owns the authoritative
// normalization; this is the renderer's compile-time mirror.
type DroverWorkDelta =
  | { type: "step-started"; stepId: string; label: string }
  | { type: "step-finished"; stepId: string; label: string; status: string; durationMs: number | null }
  | { type: "source-consulted"; label: string; ref: string | null }
  | { type: "status-changed"; status: string; previous: string | null };

// The venture stream notification the brain pushes over the bridge. Declared here (the one contract file
// both the preload and the renderer check against) so this file needs no imports from the UI graph;
// product-gtm.ts re-exports it as FirmStreamEvent for renderer call sites. Every kind but `work-delta` is
// a data-free invalidation ("something changed, re-read the owning route"); `work-delta` is the one
// additive kind that carries a typed `delta` payload. Old consumers never subscribed to it and ignore it.
type DroverVentureStreamEvent = {
  ventureId: string;
  kind: "lens" | "conversation" | "drive" | "wall" | "outcome" | "timeline" | "system" | "release" | "work-delta";
  at: string;
  betId?: string;
  threadRef?: string;
  delta?: DroverWorkDelta;
};

// One frame of a drive's live stream over the bridge. The shape matches the SSE frames the browser
// harness parses byte for byte (ui/src/api/drive-stream.ts owns the delta union), so one caller reads
// both transports. Typed loosely here on purpose: this contract file imports nothing from the UI graph.
type DroverDriveStreamFrame =
  | { frame: "snapshot"; snapshot: Record<string, unknown> }
  | { frame: "delta"; delta: Record<string, unknown> };

type DroverDesktopBridge = {
  platform: "darwin" | "win32" | "linux";
  api: {
    request: (input: { path: string; method: string; headers: Record<string, string>; body: string }) => Promise<{
      status: number;
      headers: Record<string, string>;
      body: string;
    }>;
    subscribe: (ventureId: string, listener: (event: DroverVentureStreamEvent) => void) => Promise<() => void>;
    subscribeDrive: (
      ventureId: string,
      driveId: string,
      listener: (frame: DroverDriveStreamFrame) => void,
    ) => Promise<() => void>;
  };
  selectRepository: () => Promise<DroverRepositorySelection | null>;
  terminal: {
    open: (target: DroverTerminalTarget) => Promise<DroverTerminalOpen>;
    write: (sessionId: string, data: string) => Promise<void>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
    restart: (sessionId: string) => Promise<void>;
    close: (sessionId: string) => Promise<void>;
    onData: (listener: (event: DroverTerminalData) => void) => () => void;
    onExit: (listener: (event: DroverTerminalExit) => void) => () => void;
  };
  preview: {
    attach: (workspaceId: string, webContentsId: number) => Promise<{ attached: boolean }>;
    detach: (workspaceId: string) => Promise<{ detached: boolean }>;
    startPick: (workspaceId: string) => Promise<{ picking: boolean }>;
    cancelPick: (workspaceId: string) => Promise<{ picking: boolean }>;
    onOpenRequest: (listener: (event: { workspaceId: string; url: string }) => void) => () => void;
    onAnnotation: (listener: (event: DroverPreviewAnnotationEvent) => void) => () => void;
  };
};

interface Window {
  droverDesktop?: DroverDesktopBridge;
}
