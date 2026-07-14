import { json, readBody } from "./util.mjs";
import { authorizeFounderWriteForRequest } from "./session-guard.mjs";
import {
  listCredentials,
  removeCredential,
  setCredential,
  setOAuthCredential,
} from "../credential-store.mjs";
import { runLoopbackConnect } from "../connectors/execute/gmail-oauth.mjs";

export default async function handle({ req, res, url }) {
  if (url.pathname === "/api/credentials" && req.method === "GET") {
    json(res, 200, { credentials: listCredentials() });
    return true;
  }

  if (url.pathname === "/api/credentials" && req.method === "POST") {
    try {
      authorizeFounderWriteForRequest(req, "Saving a credential");
      const body = await readBody(req);
      const credential = setCredential(body);
      json(res, 200, { credential, credentials: listCredentials() });
    } catch (error) {
      json(res, Number.isInteger(error?.status) ? error.status : 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  if (url.pathname === "/api/credentials/gmail/connect" && req.method === "POST") {
    try {
      authorizeFounderWriteForRequest(req, "Connecting Gmail");
      const body = await readBody(req);
      const clientId = String(body?.clientId ?? "").trim();
      const clientSecret = String(body?.clientSecret ?? "").trim();
      if (!clientId || !clientSecret) throw new Error("A Google OAuth client id and secret are required.");
      const { refreshToken } = await runLoopbackConnect({ clientId, clientSecret });
      const credential = setOAuthCredential({
        provider: "gmail",
        clientId,
        clientSecret,
        refreshToken,
        label: "Gmail (OAuth)",
      });
      json(res, 200, { credential, credentials: listCredentials() });
    } catch (error) {
      json(res, Number.isInteger(error?.status) ? error.status : 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  const credentialMatch = url.pathname.match(/^\/api\/credentials\/([^/]+)$/);
  if (credentialMatch && req.method === "DELETE") {
    try {
      authorizeFounderWriteForRequest(req, "Removing a credential");
      const removed = removeCredential(decodeURIComponent(credentialMatch[1]));
      json(res, 200, { removed, credentials: listCredentials() });
    } catch (error) {
      json(res, Number.isInteger(error?.status) ? error.status : 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  return false;
}
