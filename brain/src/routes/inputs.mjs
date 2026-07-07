// Clarity pins + the world-signal inbox (capture, CSV drop, GitHub pull-signals, and the explicit
// route door). Moved verbatim out of server.mjs. Ingestion NEVER sends, runs, routes, or auto-approves
// — capture is the front door of the inbox, not a trigger; only the explicit route call acts, and the
// only run it can start is an ambient wake to the founder gate.
import { json, readBody, readRawBody } from "./util.mjs";
import { loadClarity, addClarity, removeClarity } from "../clarity-store.mjs";
import { appendInput, listInputs, markRouted } from "../inputs-store.mjs";
import { routeUnroutedInputs } from "../input-routing.mjs";

// Split one CSV line into fields, honoring double-quoted cells that contain commas or escaped quotes
// (`""`). A small, dependency-free parser — enough for a founder dropping an export, not a full RFC.
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      fields.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

// Parse a CSV drop into a list of input descriptors — one per data row. The header row names the
// columns; each row becomes payload. A `kind`/`source` column overrides the route defaults per-row, so
// one file can carry mixed signals. Rows are NEVER routed or run here — the route appends them as
// 'unrouted' and stops. Returns the descriptors; an empty/headers-only file yields none.
function parseInputsCsv(text, { kind: defaultKind, source: defaultSource } = {}) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    header.forEach((col, i) => { if (col) row[col] = cells[i] ?? ""; });
    const kind = (row.kind || defaultKind || "").trim();
    const source = (row.source || defaultSource || "").trim();
    const payload = { ...row };
    delete payload.kind;
    delete payload.source;
    return { kind, source, payload };
  });
}

// Map one repo-signal emitted by the gtm-signal-github scout into an input descriptor. The host hook for
// that agent's output: a stargazer / forker / issue-opener becomes a captured world signal, provenance
// stamped source='gtm-signal-github' so the routing layer knows where it came from. ALWAYS lands
// unrouted — ingesting a pull-signal never replies, sends, or runs.
function githubSignalToInput(signal = {}, { runId } = {}) {
  const kind = String(signal.kind || signal.action || "repo-signal").trim() || "repo-signal";
  const source = String(signal.source || "github").trim() || "github";
  return {
    kind,
    source,
    payload: signal,
    provenance: {
      source: "gtm-signal-github",
      agent: "gtm-signal-github",
      ...(runId ? { runId } : {}),
      ...(signal.provenance && typeof signal.provenance === "object" ? signal.provenance : {}),
    },
  };
}

export default async function handle({ req, res, url }) {
  // Clarity — the durable output of an Ideate thinking-posture conversation, pinned onto the canvas by
  // the founder as a claim / direction / icp / question. Real GTM state captured from the founder's
  // own pins, never seeded. List, pin one, unpin one.
  const projectClarityMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/clarity$/);
  if (req.method === "GET" && projectClarityMatch) {
    try {
      const projectId = decodeURIComponent(projectClarityMatch[1]);
      json(res, 200, { items: loadClarity(projectId) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }
  if (req.method === "POST" && projectClarityMatch) {
    try {
      const body = await readBody(req);
      const projectId = decodeURIComponent(projectClarityMatch[1]);
      json(res, 200, { item: addClarity(projectId, body ?? {}) });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  const projectClarityItemMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/clarity\/([^/]+)$/);
  if (req.method === "DELETE" && projectClarityItemMatch) {
    try {
      const projectId = decodeURIComponent(projectClarityItemMatch[1]);
      const itemId = decodeURIComponent(projectClarityItemMatch[2]);
      const removed = removeClarity(projectId, itemId);
      if (!removed) { json(res, 404, { error: `Clarity object not found: ${itemId}` }); return true; }
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Inputs — the world-signal inbox (inputs-store.mjs). These routes only CAPTURE: a captured input lands
  // 'unrouted' and nothing more happens. Routing it into a run, a person, or an experiment is a separate,
  // downstream founder/operator act that still hits the gate. Ingestion NEVER sends, runs, routes, or
  // auto-approves — it is the front door of the inbox, not a trigger.
  const projectInputsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/inputs$/);
  if (req.method === "GET" && projectInputsMatch) {
    try {
      const projectId = decodeURIComponent(projectInputsMatch[1]);
      const status = url.searchParams.get("status") || undefined;
      const kind = url.searchParams.get("kind") || undefined;
      const source = url.searchParams.get("source") || undefined;
      json(res, 200, { projectId, inputs: listInputs(projectId, { status, kind, source }) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Webhook — append ONE world signal (a commit, a signup, a reply, a star). Body names the kind and
  // source; provenance defaults to a webhook stamp. The record lands 'unrouted'; appendInput forces that
  // status, so a webhook can never push a signal past the inbox into a run.
  if (req.method === "POST" && projectInputsMatch) {
    try {
      const projectId = decodeURIComponent(projectInputsMatch[1]);
      const body = await readBody(req);
      const input = appendInput(projectId, {
        kind: body?.kind,
        source: body?.source,
        payload: body?.payload ?? {},
        provenance: body?.provenance ?? { source: "webhook", via: "POST /api/projects/:id/inputs" },
        receivedAt: body?.receivedAt,
      });
      json(res, 201, { input });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // CSV drop — parse a dropped/pasted spreadsheet into N inputs, one per data row. Body is raw CSV text;
  // default kind/source come from the query string (`?kind=signup&source=landing-page`), a per-row
  // kind/source column overrides them. Every row lands 'unrouted' — a 500-row file imports 500 captured
  // signals and triggers nothing.
  const projectInputsCsvMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/inputs\/csv$/);
  if (req.method === "POST" && projectInputsCsvMatch) {
    try {
      const projectId = decodeURIComponent(projectInputsCsvMatch[1]);
      const text = await readRawBody(req);
      const descriptors = parseInputsCsv(text, {
        kind: url.searchParams.get("kind") || undefined,
        source: url.searchParams.get("source") || "csv-import",
      });
      if (!descriptors.length) { json(res, 400, { error: "No CSV data rows found (need a header row plus at least one row)." }); return true; }
      const provenance = { source: "csv-drop", via: "POST /api/projects/:id/inputs/csv" };
      const inputs = descriptors.map((d) => appendInput(projectId, { ...d, provenance }));
      json(res, 201, { count: inputs.length, inputs });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // GitHub pull-signals — the host hook for the gtm-signal-github scout's output. The agent lists recent
  // stargazers / forkers / issue-openers on the founder's repos (read-only, never sends); its found
  // signals POST here and become captured inputs stamped provenance source='gtm-signal-github'. Each lands
  // 'unrouted' — ingesting a pull-signal never replies to it, never runs a workflow, never routes.
  const projectGithubSignalsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/inputs\/github-signals$/);
  if (req.method === "POST" && projectGithubSignalsMatch) {
    try {
      const projectId = decodeURIComponent(projectGithubSignalsMatch[1]);
      const body = await readBody(req);
      const signals = Array.isArray(body?.signals) ? body.signals : (Array.isArray(body) ? body : []);
      if (!signals.length) { json(res, 400, { error: "No github signals provided (expected { signals: [...] })." }); return true; }
      const inputs = signals.map((signal) =>
        appendInput(projectId, githubSignalToInput(signal, { runId: body?.runId })));
      json(res, 201, { count: inputs.length, inputs });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Route the inbox — the EXPLICIT, separate door that turns captured signals into action. It is its own
  // route precisely so ingestion stays pure: capturing a signal never routes it; only this call does. For
  // each still-unrouted input the pure router decides one of three things and the actor (input-routing.mjs)
  // acts: a channel match is recorded against the channel, an ambient-wake drives a standing-brief operator
  // session TO THE FOUNDER GATE and stops, and anything else is set aside. THE WALL HOLDS: the only run this
  // can start is an ambient wake, which composes and runs only to the gate — nothing sends, deploys, or
  // auto-approves. (No model-backed wake scorer is wired here, so the router's blank default refuses to
  // wake; a flow match or an ignore is all this door does until a scorer is injected.)
  const projectInputsRouteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/inputs\/route$/);
  if (req.method === "POST" && projectInputsRouteMatch) {
    try {
      const projectId = decodeURIComponent(projectInputsRouteMatch[1]);
      const body = await readBody(req);
      // Per-input founder decision: the inbox's quiet "route this one to a channel/flow, or set it
      // aside." markRouted ONLY records the decision on the append-only record — it never runs, sends,
      // or auto-approves. Any run a routed signal later feeds still hits the founder gate. With no
      // inputId the call falls through to the bulk router below (unchanged).
      if (body && typeof body.inputId === "string" && body.inputId.trim()) {
        const target = body.ignore === true ? "ignored" : body.routedTo;
        const input = markRouted(projectId, body.inputId, target);
        json(res, 200, { input });
        return true;
      }
      const results = routeUnroutedInputs(projectId);
      json(res, 200, {
        count: results.length,
        results: results.map((r) => ({ inputId: r.input.id, route: r.decision.route, sessionId: r.sessionId ?? null })),
      });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
