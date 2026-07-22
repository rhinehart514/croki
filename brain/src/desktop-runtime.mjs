import { Readable } from "node:stream";
import { dispatchRequest } from "./request-dispatcher.mjs";
import { recoverStaleBuilds } from "./feature-builder.mjs";
import { recoverInterruptedCodingWorkspaces } from "./firm/code-workspace.mjs";
import { subscribeFirmEvents } from "./firm/firm-events.mjs";
import { listVentures } from "./firm/venture-store.mjs";
import { restartableWorkScopes } from "./firm/work-scopes.mjs";

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

export function invokeBrain(input) {
  return new Promise((resolve, reject) => {
    const req = desktopRequest(input);
    const res = new DesktopResponse(resolve);
    dispatchRequest(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end(JSON.stringify({ error: "Route not found." }));
      else if (!res.ended) reject(new Error(`Desktop request did not complete: ${req.method} ${req.url}`));
    }).catch(reject);
  });
}

export function subscribeToVenture(ventureId, listener) {
  return subscribeFirmEvents(ventureId, listener);
}

export async function recoverDesktopWork() {
  const recoveredBuilds = recoverStaleBuilds();
  const recoveredWorkspaces = await recoverInterruptedCodingWorkspaces();
  const authorizedScopes = listVentures().flatMap((venture) => restartableWorkScopes(venture.id).map((scope) => ({
    ventureId: venture.id,
    scopeId: scope.id,
    originThreadRef: scope.originThreadRef,
    objective: scope.objective,
    branchRefs: scope.branchRefs,
    canResumeAutomatically: Boolean(scope.spendPolicyRef),
    pauseReason: scope.spendPolicyRef ? null : "An exact spend policy is required before provider work resumes.",
  })));
  return { recoveredBuilds, recoveredWorkspaces, authorizedScopes };
}
