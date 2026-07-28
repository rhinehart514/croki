// @ts-check
// The renderer receives one narrow desktop capability surface. It never gets Node or Electron
// access, and it cannot name an arbitrary filesystem path without the founder choosing it in the
// native dialog. The whole exposure is checked against the one shared contract the renderer also
// compiles against (ui/src/desktop.d.ts, enforced by `tsc -p electron`); channel names are stable.

const { contextBridge, ipcRenderer } = require("electron");

let nextVentureSubscriptionId = 0;

/**
 * @param {string} channel
 * @returns {(listener: (payload: any) => void) => () => void}
 */
function subscription(channel) {
  return (listener) => {
    const handler = (/** @type {unknown} */ _event, /** @type {any} */ payload) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

/** @satisfies {DroverDesktopBridge} */
const droverDesktopBridge = {
  platform: /** @type {DroverDesktopBridge["platform"]} */ (process.platform),
  engine: {
    status: () => ipcRenderer.invoke("drover:engine-status"),
    retry: () => ipcRenderer.invoke("drover:engine-retry"),
    onState: subscription("drover:engine-state"),
  },
  update: {
    status: () => ipcRenderer.invoke("drover:update-status"),
  },
  api: {
    request: (input) => ipcRenderer.invoke("drover:brain-request", input),
    subscribe: async (ventureId, listener) => {
      const subscriptionId = `venture:${Date.now()}:${++nextVentureSubscriptionId}`;
      const handler = (
        /** @type {unknown} */ _event,
        /** @type {{ subscriptionId?: string, event?: any }} */ payload,
      ) => {
        if (payload?.subscriptionId === subscriptionId) listener(payload.event);
      };
      ipcRenderer.on("drover:venture-event", handler);
      try {
        await ipcRenderer.invoke("drover:events-subscribe", { ventureId, subscriptionId });
      } catch (error) {
        ipcRenderer.removeListener("drover:venture-event", handler);
        throw error;
      }
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        ipcRenderer.removeListener("drover:venture-event", handler);
        void ipcRenderer.invoke("drover:events-unsubscribe", subscriptionId);
      };
    },
    // The payload-carrying twin of `subscribe`: one drive's forming reply, tool calls, and plan, so
    // the desktop transcript streams instead of refetching the whole timeline per token. It teardown
    // through the same unsubscribe channel because the host keeps both in one subscription registry.
    subscribeDrive: async (ventureId, driveId, listener) => {
      const subscriptionId = `drive:${Date.now()}:${++nextVentureSubscriptionId}`;
      const handler = (
        /** @type {unknown} */ _event,
        /** @type {{ subscriptionId?: string, frame?: any }} */ payload,
      ) => {
        if (payload?.subscriptionId === subscriptionId) listener(payload.frame);
      };
      ipcRenderer.on("drover:drive-delta", handler);
      try {
        await ipcRenderer.invoke("drover:drive-stream-subscribe", { ventureId, driveId, subscriptionId });
      } catch (error) {
        ipcRenderer.removeListener("drover:drive-delta", handler);
        throw error;
      }
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        ipcRenderer.removeListener("drover:drive-delta", handler);
        void ipcRenderer.invoke("drover:events-unsubscribe", subscriptionId);
      };
    },
    subscribeWork: async (input, listener) => {
      const subscriptionId = `work:${Date.now()}:${++nextVentureSubscriptionId}`;
      const handler = (
        /** @type {unknown} */ _event,
        /** @type {{ subscriptionId?: string, frame?: any }} */ payload,
      ) => {
        if (payload?.subscriptionId === subscriptionId) listener(payload.frame);
      };
      ipcRenderer.on("drover:work-frame", handler);
      try {
        await ipcRenderer.invoke("drover:work-subscribe", { ...input, subscriptionId });
      } catch (error) {
        ipcRenderer.removeListener("drover:work-frame", handler);
        throw error;
      }
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        ipcRenderer.removeListener("drover:work-frame", handler);
        void ipcRenderer.invoke("drover:events-unsubscribe", subscriptionId);
      };
    },
  },
  selectRepository: () => ipcRenderer.invoke("drover:select-repository"),
  terminal: {
    open: (target) => ipcRenderer.invoke("drover:terminal-open", target),
    inspect: (ventureId, workspaceId) => ipcRenderer.invoke("drover:terminal-inspect", ventureId, workspaceId),
    write: (sessionId, data) => ipcRenderer.invoke("drover:terminal-write", sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.invoke("drover:terminal-resize", sessionId, cols, rows),
    restart: (sessionId) => ipcRenderer.invoke("drover:terminal-restart", sessionId),
    close: (sessionId) => ipcRenderer.invoke("drover:terminal-close", sessionId),
    onData: subscription("drover:terminal-data"),
    onExit: subscription("drover:terminal-exit"),
  },
  preview: {
    attach: (ventureId, workspaceId, webContentsId) => ipcRenderer.invoke("drover:preview-attach", { ventureId, workspaceId, webContentsId }),
    detach: (workspaceId) => ipcRenderer.invoke("drover:preview-detach", workspaceId),
    inspect: (ventureId, workspaceId) => ipcRenderer.invoke("drover:preview-inspect", { ventureId, workspaceId }),
    control: (ventureId, workspaceId, operation, input = {}) => ipcRenderer.invoke("drover:preview-control", {
      ventureId,
      workspaceId,
      operation,
      ...input,
    }),
    startPick: (workspaceId) => ipcRenderer.invoke("drover:preview-start-pick", workspaceId),
    cancelPick: (workspaceId) => ipcRenderer.invoke("drover:preview-cancel-pick", workspaceId),
    onOpenRequest: subscription("drover:preview-open"),
    onState: subscription("drover:preview-state"),
    onAnnotation: subscription("drover:preview-annotation"),
  },
};

contextBridge.exposeInMainWorld("droverDesktop", droverDesktopBridge);
