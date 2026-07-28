import { Readable } from "node:stream";
import { dispatchRequest } from "./request-dispatcher.mjs";
import { abortAllActiveDrives, listActiveDrives } from "./firm/active-drives.mjs";
import { driveSnapshot, subscribeDriveDeltas } from "./firm/drive-stream.mjs";
import { recoverStaleBuilds } from "./feature-builder.mjs";
import { reclaimCommittedCodingWorktrees, recoverInterruptedCodingWorkspaces } from "./firm/code-workspace.mjs";
import { cleanupExpiredJourneyImports } from "./firm/journey-import.mjs";
import { subscribeFirmEvents } from "./firm/firm-events.mjs";
import { listVentures } from "./firm/venture-store.mjs";
import { restartableWorkScopes } from "./firm/work-scopes.mjs";
import {
  acceptDesktopWorkCommand,
  subscribeToWork as subscribeToOrderedWork,
  workHandshake,
} from "./firm/work-protocol-desktop.mjs";
import { executeDesktopWorkRequest } from "./firm/work-command-routes.mjs";
import { recoverWorkJournals } from "./firm/work-journal-runtime.mjs";
import { drainAllRunWorkers } from "./firm/run-worker.mjs";
import { driveTeammate } from "./firm/work-loop.mjs";
import { recoverInterruptedWork, recoveryDriveInput } from "./firm/work-recovery.mjs";

class DesktopResponse {
  constructor(resolve) {
    this.resolve = resolve;
    this.statusCode = 200;
    this.headers = new Map();
    this.chunks = [];
    this.ended = false;
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), String(value));
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }

  writeHead(status, headers = {}) {
    this.statusCode = status;
    for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
    return this;
  }

  write(chunk = "") {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return true;
  }

  end(chunk = "") {
    if (this.ended) return this;
    if (chunk !== "") this.write(chunk);
    this.ended = true;
    this.resolve({
      status: this.statusCode,
      headers: Object.fromEntries(this.headers),
      body: Buffer.concat(this.chunks).toString("utf8"),
    });
    return this;
  }
}

function desktopRequest({ path, method = "GET", headers = {}, body = "" }) {
  const req = Readable.from(body ? [body] : []);
  req.method = String(method).toUpperCase();
  req.url = path;
  req.headers = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
  );
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}

function dispatchDesktopRequest(input) {
  return new Promise((resolve, reject) => {
    const req = desktopRequest(input);
    const res = new DesktopResponse(resolve);
    dispatchRequest(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end(JSON.stringify({ error: "Route not found." }));
      else if (!res.ended) reject(new Error(`Desktop request did not complete: ${req.method} ${req.url}`));
    }).catch(reject);
  });
}

export function invokeBrain(input) {
  return executeDesktopWorkRequest(input, {
    acceptCommand: acceptDesktopWorkCommand,
    dispatch: dispatchDesktopRequest,
  });
}

export function subscribeToVenture(ventureId, listener) {
  return subscribeFirmEvents(ventureId, listener);
}

// Ordered Work is a separate payload-carrying protocol. Product/Canvas continue to use the canonical
// venture store and existing event surface; this stream projects only WorkIndex and an exact Thread.
export function subscribeToWork(input, listener) {
  return subscribeToOrderedWork(input, listener);
}

export { acceptDesktopWorkCommand, workHandshake };
export { recoverWorkJournals };

// The desktop half of the drive delta stream. The shipped surface has no HTTP port, so the SSE route
// (handleDriveDeltaStream) is unreachable from Electron; without this the desktop transcript would move
// only on durable events while the browser harness streamed tokens — the product surface strictly worse
// than the test surface. This carries the same frames in the same order over IPC.
//
// Venture isolation is enforced exactly as the route enforces it: the drive must be live in the venture
// the caller named, so another venture's drive id (and a settled one) is refused rather than streamed.
// The listener receives the same { frame } union the SSE client parses, starting with one snapshot.
export function subscribeToDriveStream(ventureId, driveId, listener) {
  if (!listActiveDrives(ventureId).some((drive) => drive.id === driveId)) {
    throw Object.assign(new Error(`No such active drive in this venture: ${driveId}`), { status: 404 });
  }
  listener({ frame: "snapshot", snapshot: driveSnapshot(driveId) });
  return subscribeDriveDeltas(driveId, (delta) => listener({ frame: "delta", delta }));
}

// The desktop shell's graceful-quit handshake: stop live provider work before Electron exits.
// Persistence in this brain is synchronous per mutation, so aborting the drives is the whole
// teardown; durable work records remain for recoverDesktopWork on the next launch.
export async function shutdownDesktopWork() {
  const abortedDrives = abortAllActiveDrives();
  const drainedRunWorkers = await drainAllRunWorkers();
  return { abortedDrives, drainedRunWorkers };
}

export async function recoverDesktopWork(options = {}, deps = {}) {
  const expiredJourneyImports = cleanupExpiredJourneyImports();
  const recoveredBuilds = recoverStaleBuilds();
  const interruptedRuns = await recoverInterruptedWork(options, {
    ...deps,
    resumeRun: deps.resumeRun ?? ((plan) => driveTeammate(recoveryDriveInput(plan, options, deps.driveDeps))),
  });
  const recoveredWorkspaces = await recoverInterruptedCodingWorkspaces(options);
  const reclaimedWorktrees = reclaimCommittedCodingWorktrees(options);
  // Reading the journal projections validates their durable hash chain and deterministically rebuilds
  // stale/missing derived rows. A corrupt or future-schema journal stays read-only and returns the exact
  // preservation path; recovery never silently starts provider work through that boundary.
  const workJournals = recoverWorkJournals(options);
  const authorizedScopes = listVentures(options).flatMap((venture) => restartableWorkScopes(venture.id, [], options).map((scope) => ({
    ventureId: venture.id,
    scopeId: scope.id,
    originThreadRef: scope.originThreadRef,
    objective: scope.objective,
    branchRefs: scope.branchRefs,
    canResumeAutomatically: Boolean(scope.spendPolicyRef),
    pauseReason: scope.spendPolicyRef ? null : "An exact spend policy is required before provider work resumes.",
  })));
  return { recoveredBuilds, recoveredWorkspaces, reclaimedWorktrees, authorizedScopes, expiredJourneyImports, workJournals, interruptedRuns };
}
