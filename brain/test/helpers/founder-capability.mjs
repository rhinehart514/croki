import crypto from "node:crypto";

export const TEST_FOUNDER_CAPABILITY = "drover-test-founder-capability-do-not-use-in-production";
process.env.GTM_IDE_FOUNDER_CAPABILITY = TEST_FOUNDER_CAPABILITY;

export function founderHeaders({
  method = "POST",
  path = "/internal/founder-write",
  issuedAt = Date.now(),
  nonce = crypto.randomBytes(18).toString("base64url"),
  secret = TEST_FOUNDER_CAPABILITY,
  origin = null,
  host = "127.0.0.1:4317",
} = {}) {
  const normalizedMethod = String(method).toUpperCase();
  const parsed = new URL(path, "http://drover.local");
  const normalizedPath = `${parsed.pathname}${parsed.search}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${normalizedMethod}\n${normalizedPath}\n${issuedAt}\n${nonce}`)
    .digest("base64url");
  return {
    host,
    ...(origin ? { origin } : {}),
    "x-drover-founder-capability": `v1.${issuedAt}.${nonce}.${signature}`,
  };
}

export function founderRequest({ method = "POST", path = "/internal/founder-write", headers = {}, ...claim } = {}) {
  return {
    method,
    url: path,
    headers: { ...founderHeaders({ method, path, ...claim }), ...headers },
  };
}
