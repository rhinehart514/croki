function previewUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || "")); }
  catch { throw new Error("Enter a valid preview URL."); }
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("Preview URLs must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("Preview URLs cannot contain credentials.");
  return url;
}

function previewBounds(rawBounds) {
  const values = [rawBounds?.x, rawBounds?.y, rawBounds?.width, rawBounds?.height].map(Number);
  if (!values.every(Number.isFinite) || values[0] < 0 || values[1] < 0 || values[2] < 1 || values[3] < 1) {
    throw new Error("Preview bounds are invalid.");
  }
  return {
    x: Math.floor(values[0]), y: Math.floor(values[1]),
    width: Math.min(16_000, Math.floor(values[2])), height: Math.min(16_000, Math.floor(values[3])),
  };
}

function createPreviewRuntime({ WebContentsView, getWindow, shell, send }) {
  let active = null;
  const lastUrlByWorkspace = new Map();

  function emit(state) {
    if (active) send(active.ownerId, "preview-state", { workspaceId: active.workspaceId, ...state });
  }

  function createView() {
    let loadFailure = null;
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
        partition: "drover-preview",
      },
    });
    view.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const target = previewUrl(url);
        void shell.openExternal(target.toString()).catch(() => undefined);
      } catch { /* invalid destinations remain closed */ }
      return { action: "deny" };
    });
    view.webContents.on("will-navigate", (event, url) => {
      try {
        const target = previewUrl(url);
        if (active?.origin && target.origin !== active.origin) {
          event.preventDefault();
          void shell.openExternal(target.toString()).catch(() => undefined);
        }
      } catch (error) {
        event.preventDefault();
        emit({ status: "failed", url, error: error.message });
      }
    });
    view.webContents.on("did-start-loading", () => {
      loadFailure = null;
      emit({ status: "loading", url: view.webContents.getURL(), error: null });
    });
    view.webContents.on("did-stop-loading", () => {
      emit(loadFailure
        ? { status: "failed", url: loadFailure.url, error: loadFailure.error }
        : { status: "ready", url: view.webContents.getURL(), error: null });
    });
    view.webContents.on("did-navigate", (_event, url) => {
      if (!active) return;
      lastUrlByWorkspace.set(active.workspaceId, url);
      emit({ status: "ready", url, error: null });
    });
    view.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      loadFailure = { url, error: `${description} (${code})` };
      emit({ status: "failed", ...loadFailure });
    });
    return view;
  }

  async function show(ownerId, input) {
    const workspaceId = typeof input?.workspaceId === "string" ? input.workspaceId.trim() : "";
    if (!workspaceId) throw new Error("Preview requires a coding workspace.");
    const bounds = previewBounds(input.bounds);
    const resolved = previewUrl(input.url || lastUrlByWorkspace.get(workspaceId));
    const parent = getWindow(ownerId);
    if (!parent || parent.isDestroyed?.()) throw new Error("The Drover window is unavailable.");

    if (!active) active = { ownerId, workspaceId, origin: resolved.origin, view: createView() };
    else {
      const priorWindow = getWindow(active.ownerId);
      priorWindow?.contentView.removeChildView(active.view);
      active.ownerId = ownerId;
      active.workspaceId = workspaceId;
      active.origin = resolved.origin;
    }
    parent.contentView.addChildView(active.view);
    active.view.setBounds(bounds);
    const url = resolved.toString();
    lastUrlByWorkspace.set(workspaceId, url);
    emit({ status: "loading", url, error: null });
    await active.view.webContents.loadURL(url);
  }

  function bounds(ownerId, value) {
    if (!active || active.ownerId !== ownerId) return;
    active.view.setBounds(previewBounds(value));
  }

  async function navigate(ownerId, rawUrl) {
    if (!active || active.ownerId !== ownerId) throw new Error("Open the preview before navigating it.");
    const url = previewUrl(rawUrl);
    active.origin = url.origin;
    lastUrlByWorkspace.set(active.workspaceId, url.toString());
    emit({ status: "loading", url: url.toString(), error: null });
    await active.view.webContents.loadURL(url.toString());
  }

  function reload(ownerId) {
    if (!active || active.ownerId !== ownerId) throw new Error("Open the preview before reloading it.");
    active.view.webContents.reload();
  }

  function hide(ownerId) {
    if (!active || active.ownerId !== ownerId) return;
    getWindow(ownerId)?.contentView.removeChildView(active.view);
  }

  function stopOwner(ownerId) {
    if (!active || active.ownerId !== ownerId) return;
    getWindow(ownerId)?.contentView.removeChildView(active.view);
    active.view.webContents.close();
    active = null;
  }

  function stopAll() {
    if (!active) return;
    getWindow(active.ownerId)?.contentView.removeChildView(active.view);
    active.view.webContents.close();
    active = null;
  }

  return { show, setBounds: bounds, navigate, reload, hide, stopOwner, stopAll };
}

module.exports = { createPreviewRuntime, previewBounds, previewUrl };
