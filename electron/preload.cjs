// The renderer receives one narrow desktop capability: ask the trusted host to let the founder
// choose a product repository. It never gets Node or Electron access, and it cannot name an
// arbitrary filesystem path without the founder choosing it in the native dialog.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("droverDesktop", {
  platform: process.platform,
  api: {
    request: (input) => ipcRenderer.invoke("drover:brain-request", input),
    subscribe: async (ventureId, listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on("drover:venture-event", handler);
      try {
        await ipcRenderer.invoke("drover:events-subscribe", ventureId);
      } catch (error) {
        ipcRenderer.removeListener("drover:venture-event", handler);
        throw error;
      }
      return () => {
        ipcRenderer.removeListener("drover:venture-event", handler);
        void ipcRenderer.invoke("drover:events-unsubscribe");
      };
    },
  },
  selectRepository: () => ipcRenderer.invoke("drover:select-repository"),
  terminal: {
    open: (target) => ipcRenderer.invoke("drover:terminal-open", target),
    write: (sessionId, data) => ipcRenderer.invoke("drover:terminal-write", sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.invoke("drover:terminal-resize", sessionId, cols, rows),
    restart: (sessionId) => ipcRenderer.invoke("drover:terminal-restart", sessionId),
    close: (sessionId) => ipcRenderer.invoke("drover:terminal-close", sessionId),
    onData: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on("drover:terminal-data", handler);
      return () => ipcRenderer.removeListener("drover:terminal-data", handler);
    },
    onExit: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on("drover:terminal-exit", handler);
      return () => ipcRenderer.removeListener("drover:terminal-exit", handler);
    },
  },
  preview: {
    show: (input) => ipcRenderer.invoke("drover:preview-show", input),
    setBounds: (bounds) => ipcRenderer.invoke("drover:preview-bounds", bounds),
    navigate: (url) => ipcRenderer.invoke("drover:preview-navigate", url),
    reload: () => ipcRenderer.invoke("drover:preview-reload"),
    hide: () => ipcRenderer.invoke("drover:preview-hide"),
    onState: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on("drover:preview-state", handler);
      return () => ipcRenderer.removeListener("drover:preview-state", handler);
    },
  },
});
