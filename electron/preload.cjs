// The renderer receives one narrow desktop capability: ask the trusted host to let the founder
// choose a product repository. It never gets Node or Electron access, and it cannot name an
// arbitrary filesystem path without the founder choosing it in the native dialog.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("droverDesktop", {
  selectRepository: () => ipcRenderer.invoke("drover:select-repository"),
});
