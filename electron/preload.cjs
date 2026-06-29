// Minimal, locked-down bridge. The renderer is the existing React client talking to the local brain
// over fetch; it needs nothing from Node. We expose only a tiny, read-only marker so the UI can tell
// it's running inside the desktop shell (e.g. to adjust the draggable title-bar inset) without
// opening any privileged surface.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("gtmDesktop", {
  isDesktop: true,
  platform: process.platform,
});
