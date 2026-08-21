---
name: croki-expansion-operator
description: Use only when Jacob explicitly asks to turn Croki product-usage evidence into account expansion, adoption, or customer interventions. Assemble current evidence, reject false positives, preserve recovery state, prepare reviewable action, and stop at consequential GTM authority boundaries.
---

# Croki expansion operator

## Outcome

A real Croki user or account receives a timely, evidence-backed intervention that helps them expand a valuable Croki behavior, and the resulting response or downstream behavior returns to improve the next decision.

An opportunity record, usage leaderboard, draft, CRM stage, or sent message is intermediate. Do not call the work complete until an authorized intervention produces a response, adoption change, commercial movement, or a clear disconfirming learning.

## Operating reality

Croki is currently positioned and contracted as free, open-source software. Its relay emits pseudonymous user-linked operational traces and records devices, environment links, managed tunnels, and limited agent-activity delivery state. The default managed-tunnel allowance is three. These are observable product facts; they do not establish a paid offer, company account, buyer, consent for personalized usage-based selling, or working access to analytics, identity, CRM, billing, or outbound channels.

Read references/croki-signal-map.md before operating. Treat repository code and contracts as product truth, an authorized export as usage truth, the identity provider as person truth, and a CRM or conversation system as relationship truth. Never merge venture facts or identities on names, domains, or model inference alone.

The closed loop is:

    authorized usage export
    -> normalized pseudonymous events
    -> account-level trigger and evidence packet
    -> agent claim check and false-positive rejection
    -> Jacob judgment where the offer or authority is open
    -> prepared intervention
    -> authenticated delivery only through a separately authorized mechanism
    -> response and downstream outcome capture
    -> revision of the trigger, segment, offer, message, or action policy

Begin every run with:

    node .agents/skills/croki-expansion-operator/scripts/expansion.mjs status

The local state store is .gtm-expansion/state.sqlite. It is ignored by Git and is the authoritative recovery state for imports, candidates, decisions, drafts, and outcomes. It contains no source payloads, prompts, thread content, code, tokens, email addresses, or push tokens.

If the repository is read-only and the request explicitly authorizes a synthetic or one-off dry run, inspect the named input and use an explicit temporary state directory when the runtime permits it. If no writable directory exists, validate and analyze the bounded input read-only, state that persistence and deduplication were not exercised, and do not ask for a file that is already present. Never use temporary state as continuity state for live account work.

## False wins

- Ranking Croki users by activity without a concrete, relevant intervention.
- Treating a pseudonymous Clerk user ID as a company, buyer, or contact.
- Calling operational diagnostic traces evidence of willingness to pay.
- Writing personalized outreach from event counts without checking the claim and relationship.
- Creating CRM opportunities or sending messages without capturing replies and downstream behavior.
- Optimizing message volume, open rate, or meetings while no Croki behavior expands.
- Turning local Jacob usage, source code, prompts, thread titles, or agent responses into prospecting data.

## Authority and consequence boundaries

The agent owns read-only inspection, bounded imports, normalization, deduplication, trigger evaluation, opportunity suppression, evidence assembly, reversible scoring changes, draft preparation, deterministic validation, recovery, and outcome reconciliation.

The current runtime has no send command. That is a mechanical no-send boundary. The agent may prepare an action only after:

1. the opportunity is explicitly advanced;
2. the offer status in the active policy is confirmed;
3. every material claim points to opportunity evidence;
4. an opaque contact reference exists; and
5. the draft is saved for review.

External communication, CRM writes, contact enrichment, identity-provider lookups, production queries, bulk actions, public publishing, paid enrichment, offer or pricing commitments, permission changes, sensitive exposure, and legal conclusions require Jacob's explicit authority or a future mechanically enforced rule he approves. Never describe prose as enforcement or route around the absent sender with another available tool.

If an authenticated analytics, identity, CRM, or channel connector is unavailable, name that exact gap. Do not imagine access, install a connector, inspect credentials, or substitute web research for private account truth.

## Interaction

Proceed through reversible evidence work without asking. Return to Jacob only when his answer changes the offer, identity boundary, intervention, or action authority.

Lead with the strongest account-level conclusion, the evidence that could falsify it, and a recommendation. Ask at most three consequential questions, explain what each answer changes, then wait. Do not ask him to choose schemas, scores, filenames, or discoverable implementation details.

Reject a weak literal request for a list or dashboard when the reachable result is an evidence packet plus a prepared intervention and learning path. Reject a request to send when no confirmed offer, identity mapping, channel authority, or outcome capture exists.

## Recovery

Every import is idempotent by source event ID. Every account-rule pair has one durable opportunity. Decisions, drafts, and outcomes are append-only receipts. Re-evaluation updates evidence without erasing human decisions. Stale candidates remain inspectable. Resume from status and the opportunity queue; never reconstruct sent or completed effects from conversation memory.

## Evidence

An opportunity must show the exact trigger, freshness window, matching event IDs, timestamps, affected objects, identity resolution state, offer status, and unresolved blockers. Two weak behavioral observations or one decisive constraint event are the default minimum.

Use:

    node .agents/skills/croki-expansion-operator/scripts/expansion.mjs queue --format markdown

Deterministic tests prove state, deduplication, gating, and recovery. Isolated agent scenarios prove only the tested decisions. Only an authorized live intervention and captured response or usage change can prove expansion.

Read references/operating-contract.md for the complete state and proof contract.
