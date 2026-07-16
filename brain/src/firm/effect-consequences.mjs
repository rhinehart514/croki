// Consequence metadata belongs to facts known at the staging boundary, never to model forecast. This
// helper is intentionally idempotent so a domain stager can enrich before an injected park() and the
// real wall can enforce the same truth for every direct caller.

import { getCredential } from "../credential-store.mjs";

const MESSAGE_IRREVERSIBILITY = "A sent message cannot be unsent.";
const DEPLOY_IRREVERSIBILITY = "A deploy changes a live environment and is not automatically reversible.";

function connectedGmailAddress(options = {}) {
  const credential = getCredential("gmail", options) ?? getCredential("google", options);
  const address = String(credential?.accountAddress ?? "").trim().toLowerCase();
  return address.includes("@") ? address : null;
}

function productDestination(effect) {
  const branch = String(effect?.branch ?? "").trim();
  const baseCommit = String(effect?.baseCommit ?? "").trim();
  if (!branch || !baseCommit) return null;
  return `${branch} at ${baseCommit}`;
}

export function stampKnownEffectConsequences(effect, options = {}) {
  const stamped = { ...(effect ?? {}) };
  const kind = String(stamped.kind ?? "").trim().toLowerCase();

  if (kind === "message" || kind === "send") {
    const fromAddress = connectedGmailAddress(options);
    // fromAddress is reserved for the provider-verified account. A staged claim cannot impersonate a
    // connected mailbox; legacy credentials and lookup failures therefore leave this field absent.
    delete stamped.fromAddress;
    if (fromAddress) stamped.fromAddress = fromAddress;
    stamped.reversible = false;
    stamped.reversibility = MESSAGE_IRREVERSIBILITY;
  }

  if (kind === "product-change") {
    const destination = productDestination(stamped);
    if (destination) stamped.destination = destination;
    stamped.reversible = true;
    const branch = String(stamped.branch ?? "").trim();
    stamped.reversibility = branch
      ? `Applied as a reviewable diff on ${branch}; revertable.`
      : "Applied as a reviewable diff; revertable.";
  }

  if (kind === "deploy") {
    stamped.reversible = false;
    stamped.reversibility = DEPLOY_IRREVERSIBILITY;
  }

  return stamped;
}
