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

// The data-free venture stream notification the brain pushes over the bridge. Declared here (the
// one contract file both the preload and the renderer check against) so this file needs no imports
// from the UI graph; product-gtm.ts re-exports it as FirmStreamEvent for renderer call sites.
type DroverVentureStreamEvent = {
  ventureId: string;
  kind: "lens" | "conversation" | "drive" | "wall" | "outcome" | "timeline" | "system" | "release";
  at: string;
  betId?: string;
  threadRef?: string;
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
