// The portfolio surface is mechanically available but deliberately proof-gated. Batch 9 is not a
// default product surface until Batch 8 has dated outside-founder evidence in docs/STATE.md.

import { listVentures } from "./venture-store.mjs";
import { queue } from "./wall.mjs";

export const PORTFOLIO_PROOF_ENV = "GTM_IDE_PORTFOLIO_PROOF_DATE";

export function portfolioFrontierEligibility(env = process.env, today = new Date().toISOString().slice(0, 10)) {
  const proofDate = String(env[PORTFOLIO_PROOF_ENV] ?? "").trim();
  const parsedProofDate = Date.parse(`${proofDate}T00:00:00.000Z`);
  const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(proofDate)
    && Number.isFinite(parsedProofDate)
    && new Date(parsedProofDate).toISOString().slice(0, 10) === proofDate
    && proofDate <= today;
  return {
    status: dateIsValid ? "eligible" : "proof-required",
    proofDate: dateIsValid ? proofDate : null,
    requirement: "Dated Batch 8 outside-founder evidence recorded in docs/STATE.md",
    activation: `Set ${PORTFOLIO_PROOF_ENV}=YYYY-MM-DD to that evidence date only after the record exists.`,
  };
}

function outcomeIdFor(item) {
  return item.effect?.outcomeId ?? item.effect?.outcome?.id ?? null;
}

export function groupedPortfolioWall(options = {}) {
  return listVentures(options).flatMap((venture) => {
    const items = queue(venture.id, options).map((item) => ({
      ...item,
      context: {
        ventureId: venture.id,
        betId: item.betId ?? null,
        outcomeId: outcomeIdFor(item),
      },
    }));
    return items.length ? [{ venture: { id: venture.id, name: venture.name }, items }] : [];
  });
}

export function requirePortfolioFrontierProof(env = process.env) {
  const eligibility = portfolioFrontierEligibility(env);
  if (eligibility.status === "eligible") return eligibility;
  const error = new Error(`The portfolio frontier is proof-gated. ${eligibility.requirement}.`);
  error.code = "portfolio_frontier_proof_required";
  error.status = 409;
  error.eligibility = eligibility;
  throw error;
}
