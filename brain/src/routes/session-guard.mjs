// ── Browser-minted session capability ─────────────────────────────────────────────────────────
// The gate-safety seam, moved verbatim out of server.mjs. Logic is byte-identical — only its home
// changed. The prior guard (A4) refused an approval stamped `x-gtm-actor: agent`, but that trusts the
// caller to incriminate itself with the header. A capable agent holding raw loopback HTTP can POST an
// approval with NO header and be treated as the founder — the brain server has no auth otherwise. This
// closes that residual hole with a capability the founder explicitly claims using the one-time code shown
// in the Drover terminal. A successful claim receives an HttpOnly, SameSite=Strict cookie. No GET or API
// read emits the token. An approval must carry it or it is refused, independently of the agent header.
//
// This composes with the agent stamp: agent-stamped traffic is refused even if it somehow obtains the
// founder cookie. The separate terminal code is the authentication boundary for the loopback service.
import crypto from "node:crypto";

const SESSION_COOKIE = "gtm_session";
// Minted once per server process. For a local single-founder desktop app the process IS the session; a raw
// caller that never loaded a page in this process lifetime never received the cookie. This module is
// imported once at startup, so the token is minted exactly once — the same "once per process" guarantee.
const SESSION_TOKEN = crypto.randomBytes(32).toString("hex");
const FOUNDER_CODE = String(process.env.GTM_IDE_FOUNDER_CODE || crypto.randomBytes(6).toString("hex")).trim();
const CLAIM_WINDOW_MS = 60_000;
const CLAIM_LIMIT = 8;
let claimWindowStartedAt = 0;
let claimAttempts = 0;

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

export function founderBootstrapCode() {
  return FOUNDER_CODE;
}

function sameSecret(left, right) {
  const a = Buffer.from(String(left ?? ""));
  const b = Buffer.from(String(right ?? ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// A founder capability is claimed through a separate local code shown in the terminal that launched
// Drover. No GET, health probe, asset request, or model fetch ever receives it. This is an actual
// authentication boundary for the otherwise unauthenticated loopback service, not a browser-shape guess.
export function claimFounderSession(req, res, code) {
  const isAgent = String(req?.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase() === "agent";
  if (isAgent) return false;
  const now = Date.now();
  if (!claimWindowStartedAt || now - claimWindowStartedAt > CLAIM_WINDOW_MS) {
    claimWindowStartedAt = now;
    claimAttempts = 0;
  }
  claimAttempts += 1;
  if (claimAttempts > CLAIM_LIMIT || !sameSecret(code, FOUNDER_CODE)) return false;
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Strict`,
  );
  claimAttempts = 0;
  claimWindowStartedAt = now;
  return true;
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

// Immediate form for other founder-only local mutations (discarding an isolated worktree,
// reviewing/applying/reverting a code revision). Same two-factor local boundary as a gate:
// sanctioned agent traffic is refused even if it somehow carries a cookie, and raw tokenless
// loopback traffic is refused even when it omits the agent header.
export function authorizeFounderWriteForRequest(req, action = "This decision") {
  const isAgent = String(req?.headers?.["x-gtm-actor"] ?? "").trim().toLowerCase() === "agent";
  if (!isAgent && requestHasSessionToken(req)) return;
  const error = new Error(isAgent
    ? `${action} is founder-only. A model or MCP session cannot make this decision.`
    : `${action} must come from the Drover page. This request carries no founder browser session.`);
  error.code = "founder_decision_forbidden";
  error.status = 403;
  throw error;
}
