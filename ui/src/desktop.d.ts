type DroverRepositorySelection = {
  path: string;
  name: string;
};

type DroverTerminalTarget = {
  ventureId: string;
  workspaceId: string;
  terminalId?: string;
  name?: string;
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
type DroverTerminalOpen = {
  sessionId: string;
  terminalId: string;
  name: string;
  snapshot: string;
  exit: DroverTerminalExit | null;
  lastExit: DroverTerminalExit | null;
};
type DroverTerminalInspection = {
  sessionId: string;
  terminalId: string;
  name: string;
  running: boolean;
  exit: DroverTerminalExit | null;
  lastExit: DroverTerminalExit | null;
  transcriptBytes: number;
};

type DroverPreviewAnnotationEvent = {
  workspaceId: string;
  annotation: unknown;
  screenshot: { mimeType: string; data: string; size: number } | null;
  control?: DroverPreviewControl | null;
};

type DroverPreviewControl = {
  kind: "founder" | "run";
  runId: string | null;
  at: string;
};

type DroverPreviewInspection = {
  workspaceId: string;
  url: string | null;
  title: string | null;
  loading: boolean;
  reachable: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  control: DroverPreviewControl | null;
  suggestions: Array<{ port: number; url: string; label: string }>;
};

// The <webview> tag Electron adds to the renderer; the browser build never renders one.
// Its JSX intrinsic lives in webview.d.ts (a module, so it augments React instead of replacing it).
type DroverWebviewElement = HTMLElement & {
  src: string;
  getWebContentsId: () => number;
  reload: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  setZoomFactor: (factor: number) => void;
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

type DroverWorkSnapshot = {
  ventureId: string;
  cursor: number;
  threadRevision: number;
  workRevision: number;
  thread: unknown;
  work: unknown;
};

type DroverWorkFrame =
  | {
      frame: "handshake";
      schemaVersion: number;
      minSchemaVersion: number;
      serverInstanceId: string;
      ventureId: string;
      cursor: number;
      mode: "resume" | "snapshot";
      projectionRevision: number;
      snapshot?: DroverWorkSnapshot;
    }
  | {
      frame: "push";
      schemaVersion: number;
      ventureId: string;
      threadId?: string;
      runId?: string;
      sequence: number;
      projection: "thread" | "work" | "bundle";
      projectionRevision: number;
      payload: unknown;
    };

type DroverEngineState = {
  phase: "ui-ready" | "engine-starting" | "engine-ready" | "degraded" | "failed";
  at: string;
  attempt: number;
  message: string | null;
};

type DroverDesktopBridge = {
  platform: "darwin" | "win32" | "linux";
  engine: {
    status: () => Promise<DroverEngineState>;
    retry: () => Promise<DroverEngineState>;
    onState: (listener: (state: DroverEngineState) => void) => () => void;
  };
  update: {
    status: () => Promise<{
      mode: "source" | "manual-download" | "coordinated";
      channel: "development" | "production";
      currentVersion: string;
      canCheck: boolean;
      automaticCheck: boolean;
      automaticInstall: boolean;
      configured: boolean;
      reason: string | null;
      lastCheckedAt: string | null;
      requiresDeveloperIdForAutomaticInstall: boolean;
      requiresHttpsFeed: boolean;
      installBoundary: "durable-quiescence-or-explicit-founder-drain";
    }>;
  };
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
    subscribeWork: (
      input: {
        ventureId: string;
        threadId?: string;
        runId?: string;
        cursor?: number | null;
        schemaVersion?: number | null;
      },
      listener: (frame: DroverWorkFrame) => void,
    ) => Promise<() => void>;
  };
  selectRepository: () => Promise<DroverRepositorySelection | null>;
  terminal: {
    open: (target: DroverTerminalTarget) => Promise<DroverTerminalOpen>;
    inspect: (ventureId: string, workspaceId: string) => Promise<DroverTerminalInspection[]>;
    write: (sessionId: string, data: string) => Promise<void>;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
    restart: (sessionId: string) => Promise<void>;
    close: (sessionId: string) => Promise<void>;
    onData: (listener: (event: DroverTerminalData) => void) => () => void;
    onExit: (listener: (event: DroverTerminalExit) => void) => () => void;
  };
  preview: {
    attach: (ventureId: string, workspaceId: string, webContentsId: number) => Promise<{ attached: boolean }>;
    detach: (workspaceId: string) => Promise<{ detached: boolean }>;
    inspect: (ventureId: string, workspaceId: string) => Promise<DroverPreviewInspection>;
    control: (
      ventureId: string,
      workspaceId: string,
      operation: "navigate" | "back" | "forward" | "reload" | "open_external" | "zoom" | "capture",
      input?: { url?: string; zoom?: number },
    ) => Promise<DroverPreviewInspection>;
    startPick: (workspaceId: string) => Promise<{ picking: boolean }>;
    cancelPick: (workspaceId: string) => Promise<{ picking: boolean }>;
    onOpenRequest: (listener: (event: { workspaceId: string; url: string }) => void) => () => void;
    onState: (listener: (event: { workspaceId: string; url: string | null; control: DroverPreviewControl }) => void) => () => void;
    onAnnotation: (listener: (event: DroverPreviewAnnotationEvent) => void) => () => void;
  };
};

interface Window {
  droverDesktop?: DroverDesktopBridge;
}
