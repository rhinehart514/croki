// ── Browser-minted session capability ─────────────────────────────────────────────────────────
// The gate-safety seam, moved verbatim out of server.mjs. Logic is byte-identical — only its home
// changed. The prior guard (A4) refused an approval stamped `x-gtm-actor: agent`, but that trusts the
// caller to incriminate itself with the header. A capable agent holding raw loopback HTTP can POST an
// approval with NO header and be treated as the founder — the brain server has no auth otherwise. This
// closes that residual hole with a capability the real page holds and a header-less raw caller does not:
// a per-process random token, minted server-side at startup and handed ONLY to a browser that actually
// loaded a page (delivered as an HttpOnly, SameSite=Strict cookie on GET responses). An approval must
// carry it or it is refused — INDEPENDENT of the agent header, so a blind raw-curl POST with no cookie
// cannot release.
//
// Scope: this is the header-less blind-POST defense. It is not cryptographic browser-proof against a local
// process that scripts a GET to scrape the Set-Cookie and replays it — no client-side secret can be, on an
// unauthenticated loopback, and a login system is explicitly out of scope for this single-founder desktop
// app. It composes with A4 (agent-stamped OR missing-token both refused) so the SANCTIONED agent front door
// (mcp.mjs, always stamped) is closed regardless of any token it might harvest.
import crypto from "node:crypto";

const SESSION_COOKIE = "gtm_session";
// Minted once per server process. For a local single-founder desktop app the process IS the session; a raw
// caller that never loaded a page in this process lifetime never received the cookie. This module is
// imported once at startup, so the token is minted exactly once — the same "once per process" guarantee.
const SESSION_TOKEN = crypto.randomBytes(32).toString("hex");

function parseCookies(header) {
  const jar = Object.create(null);
  if (typeof header !== "string" || !header) return jar;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name) jar[name] = part.slice(eq + 1).trim();
  }
  return jar;
}

// Does this request carry the valid browser-minted session token? (Constant-time compare on equal-length
// hex; a length mismatch is an early, safe reject.)
export function requestHasSessionToken(req) {
  const token = parseCookies(req?.headers?.cookie)[SESSION_COOKIE];
  if (typeof token !== "string" || token.length !== SESSION_TOKEN.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(SESSION_TOKEN));
  } catch {
    return false;
  }
}

// Hand the session token to a browser that actually loaded a page. Only on GET (page load / asset / read),
// and only when the request does not already carry it — so the write/approval POST never emits the token in
// its own response, steady-state requests stay cacheable, and the very first GET / establishes the cookie
// before any approval UI can exist. Set via setHeader BEFORE any handler's writeHead, which Node merges
// (writeHead wins only on fields it also sets, and none set Set-Cookie).
export function issueSessionCookie(req, res) {
  if (req.method !== "GET") return;
  if (requestHasSessionToken(req)) return;
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Strict`,
  );
}

// The release-authority guard for a raw graph run (/api/graph/run + /stream). A gate approval is a
// human-only, browser-only act. Two independent refusals, defense in depth — either one throws:
//   1. (A4) the agent front door (mcp.mjs) stamps `x-gtm-actor: agent`; an approval carrying that stamp is
//      refused, so the sanctioned agent door cannot self-approve.
//   2. (this task) an approval that does not carry the browser-minted session token is refused, so a raw
//      header-less loopback POST — which never loaded a page and so holds no token — cannot release,
//      regardless of whether it omits the agent header.
// This extends the EXISTING authorizeRelease seam runGraph already honors: the returned function fires ONLY
// when the run actually carries an approval/release intent, so an agent (or any) run that merely reaches a
// gate still works — only an APPROVAL throws. The founder's browser holds the cookie and sends no agent
// header, so the local canvas gate is unchanged (no new friction). Both throws map to 403, like the
// operator gate.
export function authorizeReleaseForRequest(req) {
  const isAgent = String(req?.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase() === "agent";
  const hasToken = requestHasSessionToken(req);
  return () => {
    if (isAgent) {
      const error = new Error(
        "Gate approval is human-only. An agent/MCP session cannot approve a founder gate — a person must approve it at the canvas gate.",
      );
      error.code = "gate_release_forbidden";
      error.status = 403;
      throw error;
    }
    if (!hasToken) {
      const error = new Error(
        "Gate approval must come from the Drover page. This request carries no browser session — approve at the canvas gate in the app.",
      );
      error.code = "gate_release_forbidden";
      error.status = 403;
      throw error;
    }
  };
}
