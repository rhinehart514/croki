// Local founder authority is minted once per Drover process. Founder-only decisions require the
// HttpOnly browser cookie; model and MCP traffic is refused even if it somehow carries that cookie.

import crypto from "node:crypto";

const SESSION_COOKIE = "gtm_session";
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
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Strict`);
  claimAttempts = 0;
  claimWindowStartedAt = now;
  return true;
}

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
