// Measure / belief reads + the founder's outcome and experiment doors. Board, run-summary, GTM map,
// outcomes, stated experiments, and verdicts — all read-derived or post-gate. Moved verbatim out of
// server.mjs. Nothing here sends, publishes, or runs.
import { json, readBody } from "./util.mjs";
import { getBoard, getPipelineBeliefSpine, getPipelineIcpGrouping } from "../board.mjs";
import { deriveRunSummary } from "../run-summary.mjs";
import { recordFounderOutcome } from "../outcome-capture.mjs";
import {
  productTruthStore,
  marketObjectStore,
  gtmPathStore,
  measurementContractStore,
} from "../gtm-store.mjs";
import { outcomeReport, ingestOutcome, ingestBatch, OUTCOME_SOURCES } from "../outcome-ingest.mjs";
import { upsertStatedExperiment } from "../stated-experiment.mjs";
import { applyExperimentVerdict, suggestVerdictFromOutcomes } from "../belief-writeback.mjs";

export default async function handle({ req, res, url }) {
  // GTM Board — the nine belief layers (Strategy / Motion / Loop), derived purely from real state.
  // Read-only: it never writes, never triggers a run, and never gates one.
  const projectBoardMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/board$/);
  if (req.method === "GET" && projectBoardMatch) {
    try {
      const projectId = decodeURIComponent(projectBoardMatch[1]);
      // The board carries the nine belief layers PLUS the L0 ground: which ICP each pipeline tests.
      json(res, 200, { ...getBoard({ projectId }), icpGrouping: getPipelineIcpGrouping({ projectId }) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // "What happened" — the latest run's real numbers (what went out, and what joined back to it),
  // derived purely from real state and null where no run has happened. Read-only: it never writes,
  // never triggers a run, never gates one.
  const projectRunSummaryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/run-summary$/);
  if (req.method === "GET" && projectRunSummaryMatch) {
    try {
      const projectId = decodeURIComponent(projectRunSummaryMatch[1]);
      json(res, 200, { run: deriveRunSummary(projectId) });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // The founder's manual outcome door — record what actually happened on a run plus the lesson, through
  // the existing outcome-ingest path (a Result + its Learning). Records what ALREADY happened; it never
  // sends, publishes, or runs anything, so the wall is untouched. Body: { runId, happened, learned }.
  const projectOutcomeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/outcome$/);
  if (req.method === "POST" && projectOutcomeMatch) {
    try {
      const projectId = decodeURIComponent(projectOutcomeMatch[1]);
      const body = (await readBody(req)) ?? {};
      recordFounderOutcome(projectId, { runId: body.runId ?? null, happened: body.happened, learned: body.learned }, { projectId });
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // GTM map — the read-only portfolio projection (the rebuilt engine's four record lists).
  // Returns product truths, market objects, GTM paths, and measurement contracts for the project;
  // the UI derives the ranked portfolio, its buckets, and each path's weak links in code. Pure read:
  // it lists already-persisted records, never writes, never triggers or gates a run.
  const projectGtmMapMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/gtm-map$/);
  if (req.method === "GET" && projectGtmMapMatch) {
    try {
      const projectId = decodeURIComponent(projectGtmMapMatch[1]);
      json(res, 200, {
        projectId,
        productTruths: productTruthStore.list({ projectId }),
        marketObjects: marketObjectStore.list({ projectId }),
        paths: gtmPathStore.list({ projectId }),
        contracts: measurementContractStore.list({ projectId }),
      });
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Outcomes — the Result-based report (GTM-ENGINE-REBUILD Phase 5). Replaces the legacy
  // systems/channels outcome view: it folds the run ledger and the joined Results into a per-path
  // picture in plain language, honest about what is unmeasured. Pure read: never writes, never sends.
  const projectOutcomesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/outcomes$/);
  if (req.method === "GET" && projectOutcomesMatch) {
    try {
      const projectId = decodeURIComponent(projectOutcomesMatch[1]);
      json(res, 200, outcomeReport({ projectId }));
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // The outcome door — record what actually happened (GTM-ENGINE-REBUILD Phase 5, the write route).
  // A founder (or a connected source) posts one outcome or a batch; it JOINS on the item's joinKey back
  // to the run + path that produced it and lands a Result the GET report then reads. This records what
  // ALREADY happened — it never sends, publishes, or runs anything, so the wall is untouched. A single
  // outcome is `{ joinKey, outcomeKind, value, source, observedAt }`; a batch is either
  // `{ outcomes: [...] }` (each stamped founder-entered unless it names its own source) or
  // `{ sources: { <label>: [...] } }`.
  if (req.method === "POST" && projectOutcomesMatch) {
    try {
      const projectId = decodeURIComponent(projectOutcomesMatch[1]);
      const body = (await readBody(req)) ?? {};
      let result;
      if (body.sources && typeof body.sources === "object") {
        result = ingestBatch({ projectId, sources: body.sources }, { projectId });
      } else if (Array.isArray(body.outcomes)) {
        // A flat list defaults to the founder-entered source; any outcome naming its own source wins.
        result = ingestBatch(
          { projectId, sources: { [OUTCOME_SOURCES.founderEntered]: body.outcomes } },
          { projectId },
        );
      } else {
        const source = body.source ?? OUTCOME_SOURCES.founderEntered;
        result = ingestOutcome({ ...body, source, projectId }, { projectId });
      }
      json(res, 200, result);
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // L1 — one pipeline's belief spine: the five faces (Who / What you say / Who you reached / Did it
  // work / Verdict) derived purely from THIS pipeline's real state. Read-only: never writes, never
  // triggers or gates a run.
  const projectPipelineSpineMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/pipelines\/([^/]+)\/spine$/);
  if (req.method === "GET" && projectPipelineSpineMatch) {
    try {
      const projectId = decodeURIComponent(projectPipelineSpineMatch[1]);
      const channelId = decodeURIComponent(projectPipelineSpineMatch[2]);
      json(res, 200, getPipelineBeliefSpine({ projectId, channelId }));
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Stated experiment — the founder (or the operator as a SUGGESTION the founder confirms) GROUPS
  // existing motions into the arms of one belief test. Post-hoc context, never a precondition and never
  // a gate: it records a relationship, it does not block, trigger, or shape any run, and it NEVER sets a
  // verdict. Grouping is founder-confirmed, never auto-inferred from channel-name similarity.
  const projectExperimentsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/experiments$/);
  if (req.method === "POST" && projectExperimentsMatch) {
    try {
      const projectId = decodeURIComponent(projectExperimentsMatch[1]);
      const body = await readBody(req);
      const saved = upsertStatedExperiment({ projectId, experiment: body?.experiment ?? body });
      json(res, 200, saved);
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Suggested verdict — a deterministic READ of the outcome ledger that PROPOSES a verdict from observed
  // results against the experiment's success criteria. It never writes: the founder accepts by POSTing to
  // the verdict route below (with provenance "derived"). This is the "3 signups observed — keep?" prompt.
  const projectSuggestVerdictMatch = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/experiments\/([^/]+)\/suggested-verdict$/,
  );
  if (req.method === "GET" && projectSuggestVerdictMatch) {
    try {
      const projectId = decodeURIComponent(projectSuggestVerdictMatch[1]);
      const experimentId = decodeURIComponent(projectSuggestVerdictMatch[2]);
      json(res, 200, suggestVerdictFromOutcomes({ experimentId, projectId }));
    } catch (err) {
      json(res, 404, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // Belief write-back — the founder resolves an experiment with a verdict. STRICTLY post-gate: this only
  // records a decision the founder has already made; it never gates or triggers a run.
  const projectVerdictMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/experiments\/([^/]+)\/verdict$/);
  if (req.method === "POST" && projectVerdictMatch) {
    try {
      const projectId = decodeURIComponent(projectVerdictMatch[1]);
      const experimentId = decodeURIComponent(projectVerdictMatch[2]);
      const body = await readBody(req);
      const saved = applyExperimentVerdict({ projectId, experimentId, verdict: body?.verdict ?? body });
      json(res, 200, { experiments: saved.sharedContext.experiments, updatedAt: saved.updatedAt });
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
