// The founder's manual outcome door — closing one real loop by hand (docs/harness/product-shape.md:
// "close one real loop manually first"). After a run, the founder answers two things in plain words:
// what happened (got replies / booked calls / got paid / got ignored / got objections / other, with an
// optional count) and what the market taught them. This records BOTH through the EXISTING
// outcome-ingest path — it writes a Result and its paired Learning — inventing no new store.
//
// It records what ALREADY happened. It never sends, publishes, charges, or runs anything, so the wall
// is untouched.

import { ingestOutcome, projectFlowRunReceipts } from "./outcome-ingest.mjs";
import { loadProjectRuns } from "./project-store.mjs";
import { runStore } from "./gtm-store.mjs";

// The founder's plain-words "what happened" label → an open outcome kind the ledger already speaks.
// Unknown labels pass through as their own lowercased kind (open shapes — never a closed enum).
const HAPPENED_TO_KIND = {
  "got replies": "reply",
  replies: "reply",
  "got_replies": "reply",
  "booked calls": "meeting",
  "booked_calls": "meeting",
  calls: "meeting",
  "got paid": "purchase",
  "got_paid": "purchase",
  paid: "purchase",
  "got ignored": "ignored",
  ignored: "ignored",
  "got objections": "objection",
  objections: "objection",
  other: "other",
};

function happenedLabel(happened) {
  if (typeof happened === "string") return happened.trim();
  if (happened && typeof happened === "object") return String(happened.label ?? happened.kind ?? "").trim();
  return "";
}

function happenedCount(happened) {
  if (happened && typeof happened === "object") {
    const n = Number(happened.count ?? happened.value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

// Resolve the joinKey the outcome joins on, plus a run snapshot to join against. When a real staged
// GTM run matches `runId`, we join to its first item's key so the outcome ties to what was actually
// sent. Otherwise no synthetic run is created: the receipt is stored honestly as unattributed rather
// than manufacturing a join merely to retain the lesson.
function resolveJoin(projectId, runId, options) {
  if (runId) {
    let realRun = null;
    try {
      realRun = runStore.get(runId, { ...options, projectId });
    } catch {
      realRun = null;
    }
    if (realRun && Array.isArray(realRun.items) && realRun.items.length) {
      const first = realRun.items[0];
      const joinKey = first.joinKey || realRun.id;
      return { joinKey, pathId: realRun.pathId ?? null, runsSnapshot: [realRun] };
    }
    try {
      const liveRun = projectFlowRunReceipts(loadProjectRuns(projectId, options))
        .find((candidate) => candidate.id === runId || candidate.executionRunId === runId);
      if (liveRun?.items?.length) {
        return {
          joinKey: liveRun.items[0].joinKey,
          pathId: liveRun.pathId ?? null,
          runsSnapshot: [liveRun],
        };
      }
    } catch {
      // Fall through to an honest unattributed receipt.
    }
  }
  const joinKey = runId || `founder-${Date.now()}`;
  return { joinKey, pathId: null, runsSnapshot: [] };
}

// Record one founder-entered outcome for a run. `happened` is a plain label (optionally an object with
// a count); `learned` is free text — the lesson. Returns the recorded Result + Learning and whether it
// joined back to a real staged run.
export function recordFounderOutcome(
  projectId = "default",
  {
    runId = null,
    happened,
    learned,
    questionId = null,
    productRefs = [],
    participantRefs = [],
    crewRefs = [],
    decisionRefs = [],
    decisionRef = null,
  } = {},
  options = {},
) {
  const label = happenedLabel(happened);
  const outcomeKind = HAPPENED_TO_KIND[label.toLowerCase()] ?? (label ? label.toLowerCase() : "other");
  const value = happenedCount(happened);
  const learnedText = String(learned ?? "").trim() || null;

  const { joinKey, pathId, runsSnapshot } = resolveJoin(projectId, runId, options);
  const ingested = ingestOutcome(
    {
      joinKey,
      outcomeKind,
      value,
      source: "founder-entered",
      pathId,
      body: learnedText,
      questionId,
      productRefs,
      participantRefs: [...participantRefs, ...crewRefs],
      decisionRefs,
      decisionRef,
    },
    { ...options, projectId, runs: runsSnapshot },
  );
  return { ok: true, result: ingested.result, learning: ingested.learning, joined: ingested.joined };
}
