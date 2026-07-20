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
type DroverTerminalExit = { sessionId: string; exitCode: number; signal?: number };
type DroverTerminalOpen = { sessionId: string; snapshot: string; exit: DroverTerminalExit | null };

type DroverPreviewBounds = { x: number; y: number; width: number; height: number };
type DroverPreviewState = {
  workspaceId: string;
  status: "loading" | "ready" | "failed";
  url: string;
  error: string | null;
};

type DroverDesktopBridge = {
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
    show: (input: { workspaceId: string; url: string; bounds: DroverPreviewBounds }) => Promise<void>;
    setBounds: (bounds: DroverPreviewBounds) => Promise<void>;
    navigate: (url: string) => Promise<void>;
    reload: () => Promise<void>;
    hide: () => Promise<void>;
    onState: (listener: (event: DroverPreviewState) => void) => () => void;
  };
};

interface Window {
  droverDesktop?: DroverDesktopBridge;
}
