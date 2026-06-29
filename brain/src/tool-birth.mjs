// E7.2 — Tool-birth as a gated mutation.
//
// A self-built tool is born exactly like any graph change: PROPOSED, never live. This is the wall —
// "vibe up to the gate, never past it" — applied to the self-building loop. The model may compose a
// tool's code and test, but the tool is inert until a founder explicitly approves it. There is NO
// code path here that yields a callable tool without that explicit approve.

import crypto from "node:crypto";

// "pending" is the earliest stage: a crystallization candidate was detected but no code/test has
// been authored yet, so it is NOT a real proposed tool — it is a birth proposal awaiting authoring
// and a founder gate. "proposed" means a full spec (code + test) exists and is at the gate.
const STATUSES = new Set(["pending", "proposed", "approved", "rejected"]);

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function newId(name) {
  const slug = String(name || "tool").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "tool";
  return `tool-${slug}-${crypto.randomBytes(3).toString("hex")}`;
}

// Propose a tool from a spec. ALWAYS returns status "proposed" — a freshly proposed tool can never
// be born live. A valid spec must carry a name, description, code, and a test (a self-built tool
// without its own test is not a tool, it is an unverified guess and is refused). Provenance defaults
// to "self-built"; a founder-shipped tool may pass provenance: "founder-shipped".
export function proposeTool(spec = {}) {
  const name = requireString(spec.name, "Tool name");
  const description = requireString(spec.description, "Tool description");
  const code = requireString(spec.code, "Tool code");
  const test = requireString(spec.test, "Tool test");
  return {
    id: spec.id ? requireString(spec.id, "Tool id") : newId(name),
    name,
    description,
    code,
    test,
    provenance: spec.provenance === "founder-shipped" ? "founder-shipped" : "self-built",
    signature: typeof spec.signature === "string" ? spec.signature : null,
    status: "proposed", // the wall — never "live", never "approved" at birth
    proposedAt: new Date().toISOString(),
  };
}

// The founder gate. "approve" -> status "approved"; anything else recorded as a decision -> still no
// callable tool unless it was an explicit approve. We only honor the two real decisions and refuse
// an unknown verb rather than silently leaving the tool in an ambiguous state.
export function gateToolBirth(proposedTool, decision) {
  if (!proposedTool || typeof proposedTool !== "object") {
    throw new Error("gateToolBirth requires a proposed tool object.");
  }
  if (!STATUSES.has(proposedTool.status)) {
    throw new Error(`Tool has an unexpected status: ${proposedTool.status}`);
  }
  const verb = typeof decision === "string" ? decision : decision?.decision;
  if (verb !== "approve" && verb !== "reject") {
    throw new Error('gateToolBirth decision must be "approve" or "reject".');
  }
  // The wall, reinforced: a tool can never be approved into a callable state without authored code
  // AND a test. A "pending" crystallization candidate carries neither, so it cannot be approved
  // directly — it must first be authored into a full spec through proposeTool. A founder MAY still
  // reject a pending candidate to dismiss it.
  if (verb === "approve") {
    const hasCode = typeof proposedTool.code === "string" && proposedTool.code.trim();
    const hasTest = typeof proposedTool.test === "string" && proposedTool.test.trim();
    if (!hasCode || !hasTest) {
      throw new Error("A tool cannot be approved without authored code and a test — author it through proposeTool first.");
    }
  }
  const note = typeof decision === "object" && decision?.note ? String(decision.note) : null;
  return {
    ...proposedTool,
    status: verb === "approve" ? "approved" : "rejected",
    decidedAt: new Date().toISOString(),
    ...(note ? { decisionNote: note } : {}),
  };
}

// The single predicate the rest of the system asks before invoking a self-built tool. A tool is
// callable ONLY when it has been explicitly approved at the gate. Proposed and rejected tools are
// inert by construction.
export function isCallable(tool) {
  return Boolean(tool) && tool.status === "approved";
}

// Derive a STABLE, slugged id from the candidate signature so re-detecting the same deterministic
// procedure on a later run yields the SAME proposal id (idempotent), not a fresh duplicate each run.
function birthIdFromSignature(signature) {
  const slug = String(signature || "candidate")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "candidate";
  return `toolbirth-${slug}`;
}

// E7.1 -> E7.2 bridge. Turn one crystallization SUGGESTION (a detected, repeated deterministic
// procedure) into a PENDING tool-birth proposal. This is the missing link the audit flagged: the
// detector found a candidate, but nothing carried it toward birth. A pending proposal is NOT a tool —
// it has no authored code or test yet, so it deliberately cannot pass proposeTool (which rightly
// refuses a codeless tool) and is inert by construction (isCallable only ever returns true for an
// explicitly approved tool). The model authors the code+test later; the founder gates after that.
// Nothing here registers or runs anything.
export function proposeToolBirthFromCandidate(suggestion = {}) {
  const signature = requireString(suggestion.signature, "Candidate signature");
  return {
    id: birthIdFromSignature(signature),
    status: "pending", // a detected candidate awaiting model-authored code+test and a founder gate
    signature,
    reason: typeof suggestion.reason === "string" && suggestion.reason.trim()
      ? suggestion.reason
      : `The deterministic procedure "${signature}" recurred enough to be worth crystallizing into a tool.`,
    count: Number.isInteger(suggestion.count) ? suggestion.count : 0,
    sample: suggestion.sample ?? null,
    provenance: "self-built",
    proposedAt: new Date().toISOString(),
  };
}
