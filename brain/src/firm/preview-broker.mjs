// Broker between work-loop preview tools and the desktop preview host. The desktop process (the
// same process as this brain) registers one executor; the browser/test harness registers none and
// every preview operation fails with an honest message instead of pretending a preview exists.
//
// Session-pinning invariant (ported from T3's PreviewAutomationBroker): one run drives one preview
// session so a multi-step browser interaction can never jump between independent DOM/cookie state,
// and no run ever touches another Thread's preview. A live pin that predates an operation is never
// silently moved; a dead (expired) pin is pruned and the workspace may be re-pinned.

const PIN_TTL_MS = 10 * 60 * 1000;

let host = null;
const pinsByRun = new Map(); // runId -> { workspaceId, expiresAt }

/** The desktop shell registers its executor once; re-registration replaces it (relaunch). */
export function registerPreviewHost(executor) {
  host = typeof executor === "function" ? executor : null;
  return () => { if (host === executor) host = null; };
}

export function resetPreviewBrokerForTest() {
  host = null;
  pinsByRun.clear();
}

function livePinForWorkspace(workspaceId, now) {
  for (const [runId, pin] of pinsByRun) {
    if (pin.expiresAt <= now) { pinsByRun.delete(runId); continue; }
    if (pin.workspaceId === workspaceId) return { runId, ...pin };
  }
  return null;
}

/**
 * Run one preview operation for a run against its own workspace. `open` pins the workspace to the
 * run; every other operation requires that live pin, and each use renews the lease.
 */
export async function invokePreview({ runId, workspaceId, worktree = null, operation, input = {} }, { now = Date.now } = {}) {
  if (!host) {
    throw new Error("The preview is only available while the Drover desktop app is running.");
  }
  const run = String(runId ?? "").trim();
  const workspace = String(workspaceId ?? "").trim();
  if (!run || !workspace) throw new Error("Preview operations need the run and its workspace.");
  const at = now();

  const existing = pinsByRun.get(run);
  if (existing && existing.expiresAt > at && existing.workspaceId !== workspace) {
    throw new Error("This run already drives a different preview session; one run drives one preview.");
  }
  const otherPin = livePinForWorkspace(workspace, at);
  if (otherPin && otherPin.runId !== run) {
    throw new Error("Another active run is driving this workspace's preview.");
  }
  if (operation === "open") {
    pinsByRun.set(run, { workspaceId: workspace, expiresAt: at + PIN_TTL_MS });
  } else if (operation !== "status") {
    const pin = pinsByRun.get(run);
    if (!pin || pin.expiresAt <= at || pin.workspaceId !== workspace) {
      throw new Error("Open the preview first with preview_open.");
    }
    pin.expiresAt = at + PIN_TTL_MS;
  }
  return host({ operation, workspaceId: workspace, worktree, input });
}

/** A finished run releases its pin so the next run on this Thread can drive the preview. */
export function releasePreviewPin(runId) {
  pinsByRun.delete(String(runId ?? "").trim());
}
