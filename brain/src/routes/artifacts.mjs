// The GTM-engineering artifact editor (subagents + skills) and the BYO sender credentials the founder
// pastes to connect a sender. Moved verbatim out of server.mjs. Connecting a sender does NOT loosen the
// wall: the founder gate still governs every send; this only supplies the key an approved send will use.
import { json, readBody } from "./util.mjs";
import { loadProject } from "../project-store.mjs";
import { listArtifacts, listCapabilities, readArtifact, writeArtifact } from "../artifact-store.mjs";
import { setCredential, setOAuthCredential, listCredentials, removeCredential } from "../credential-store.mjs";
import { runLoopbackConnect } from "../connectors/execute/gmail-oauth.mjs";

export default async function handle({ req, res, url }) {
  // Artifacts — the real GTM-engineering files (subagents + skills). Full markdown
  // editing: the raw .md is the source of truth. This is the P3 authoring surface.
  if (req.method === "GET" && url.pathname === "/api/artifacts") {
    json(res, 200, listArtifacts()); return true;
  }
  // The live capability inventory the UI lane consumes: agents ∪ skills ∪ connected MCP tools, each
  // tool tagged with the lane it sits in. The same inventory injected into the compose prompt (Wave 4).
  if (req.method === "GET" && url.pathname === "/api/capabilities") {
    json(res, 200, listCapabilities()); return true;
  }
  if (req.method === "GET" && url.pathname === "/api/artifact") {
    const type = url.searchParams.get("type");
    const ref = url.searchParams.get("ref");
    if (type !== "agent" && type !== "skill") { json(res, 400, { error: "type must be 'agent' or 'skill'." }); return true; }
    try { json(res, 200, readArtifact(type, ref)); }
    catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/artifact/save") {
    try {
      const body = await readBody(req);
      if (body.type !== "agent" && body.type !== "skill") throw new Error("type must be 'agent' or 'skill'.");
      const saved = writeArtifact(body.type, body.ref, body.content);
      json(res, 200, saved);
    } catch (err) { json(res, 400, { error: err instanceof Error ? err.message : String(err) }); }
    return true;
  }

  // ── Sender credentials (BYO keys the founder pastes to connect a sender) ───────────────────────
  // The founder connects their OWN Gmail as the sender by pasting one credential — no OAuth app to
  // register, no key in the environment. It is stored per active project (credential-store), redacted
  // on every read, and NEVER echoed. Connecting a sender does NOT loosen the wall: the founder gate
  // still governs every send; this only supplies the key an already-approved send will use.
  if (req.method === "GET" && url.pathname === "/api/credentials") {
    try {
      const project = loadProject();
      json(res, 200, { credentials: listCredentials(project.id) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/credentials") {
    try {
      const body = await readBody(req);
      const project = loadProject();
      // setCredential returns the REDACTED credential (never the token) — safe to hand back to the UI.
      const credential = setCredential(project.id, {
        provider: body.provider,
        token: body.token,
        label: body.label,
      });
      json(res, 200, { credential, credentials: listCredentials(project.id) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Durable Gmail connect — the BYO-OAuth-client loopback flow. The founder pastes their Google "Desktop
  // app" client id + secret ONCE; this opens Google's consent in their browser, catches the loopback
  // callback, banks a REFRESH token (never an expiring access token), and stores it for this project. From
  // then on a send mints a fresh access token itself, so the founder never re-pastes. This connects a
  // sender; it does NOT loosen the wall — every send still waits for the founder at the gate.
  if (req.method === "POST" && url.pathname === "/api/credentials/gmail/connect") {
    try {
      const body = await readBody(req);
      const clientId = String(body.clientId ?? "").trim();
      const clientSecret = String(body.clientSecret ?? "").trim();
      if (!clientId || !clientSecret) throw new Error("Paste your Google OAuth client id and secret to connect Gmail.");
      const project = loadProject();
      // Blocks until the founder completes (or cancels) consent in their browser; the loopback listener
      // is what waits. On success we bank ONLY the refresh token (+ client id/secret) — never echoed back.
      const { refreshToken } = await runLoopbackConnect({ clientId, clientSecret });
      const credential = setOAuthCredential(project.id, { provider: "gmail", clientId, clientSecret, refreshToken, label: "Gmail (OAuth)" });
      json(res, 200, { credential, credentials: listCredentials(project.id) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const credentialMatch = url.pathname.match(/^\/api\/credentials\/([^/]+)$/);
  if (req.method === "DELETE" && credentialMatch) {
    try {
      const project = loadProject();
      const removed = removeCredential(project.id, decodeURIComponent(credentialMatch[1]));
      json(res, 200, { removed, credentials: listCredentials(project.id) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
