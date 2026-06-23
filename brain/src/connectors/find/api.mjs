// HTTP API input. Read-only by default: GET a JSON endpoint and normalize either
// an array response or a configured array field into workflow items.

export const meta = {
  id: "api",
  name: "HTTP API input",
  category: "source",
  description: "Pulls structured JSON items from a configured HTTP API.",
  envKey: null,
  stub: false,
  sourceOfTruth: ["contacts", "signals"],
};

function normalize(body, field) {
  const value = field
    ? String(field).split(".").filter(Boolean).reduce((current, key) => current?.[key], body)
    : body;
  if (!Array.isArray(value)) throw new Error(field
    ? `API response field "${field}" is not an array.`
    : "API response must be an array or configure an array field.");
  return value.filter((item) => item && typeof item === "object").map((item, index) => ({
    type: item.type || "input",
    id: item.id || item.email || item.url || `api-${index + 1}`,
    ...item,
  }));
}

export async function run(node) {
  const endpoint = String(node.config?.endpoint || "").trim();
  if (!/^https?:\/\//i.test(endpoint)) throw new Error("API input requires a valid http(s) endpoint.");
  const method = String(node.config?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") throw new Error("API input method must be GET or POST.");
  const fetchImpl = node.config?.fetchImpl || globalThis.fetch;
  const auth = process.env.GTM_IDE_INPUT_AUTH;
  const response = await fetchImpl(endpoint, {
    method,
    headers: {
      Accept: "application/json",
      ...(auth ? { Authorization: auth } : {}),
      ...(node.config?.headers && typeof node.config.headers === "object" ? node.config.headers : {}),
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(node.config?.body ?? {}) } : {}),
  });
  if (!response.ok) throw new Error(`API input returned HTTP ${response.status}.`);
  const body = await response.json();
  const items = normalize(body, node.config?.arrayField);
  return { ok: true, items, meta: { count: items.length, source: "api", endpoint } };
}
