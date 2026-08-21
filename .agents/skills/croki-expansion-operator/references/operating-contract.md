# Operating contract

## Person, trigger, action, result

The real person is a Croki user whose recent behavior shows a specific expansion pressure or recurring operating habit. The trigger is a current, provenance-linked usage event, not a persona or generic activity score.

The operator assembles the account's bounded evidence, tests the expansion hypothesis, rejects noise, and proposes the smallest relevant intervention. It prepares that intervention only after identity, offer, and claim checks. A separately authorized channel may deliver it. Replies and downstream Croki behavior return to the state store so the trigger, segment, offer, message, or authority rule can change.

The finished result is useful account behavior: broader adoption, removed capacity friction, a team rollout, a commercial step if one exists, or a clear learning that invalidates the hypothesis.

## State machine

Opportunity states:

    candidate -> advanced -> action-drafted -> outcome-observed
        |           |
        v           v
       hold      dismissed

Re-evaluation can mark untouched candidates or held opportunities stale. It never erases a human decision, draft, or outcome.

The current implementation has no delivery transition. A draft cannot become sent inside this harness.

## Sources of truth

- Product behavior and event meaning: Croki repository contracts and implementation.
- Usage occurrence: an explicitly authorized Axiom or normalized-event export.
- Person and company identity: an explicitly authorized identity or CRM source.
- Relationship, objections, and prior commitments: CRM and conversation history.
- Offer and action policy: config/triggers.json plus Jacob's recorded judgment.
- Work state and recovery: .gtm-expansion/state.sqlite.
- Expansion proof: captured response plus the closest downstream Croki or commercial observation.

## Decision policy

Deterministic rules nominate candidates; they do not make the GTM decision. The agent must:

1. verify that the trigger is fresh and evidence-backed;
2. state the account-level hypothesis in falsifiable language;
3. distinguish a user, company, buyer, and contact;
4. check prior relationship and intervention history when access exists;
5. reject diagnostic noise, internal/test accounts, and one-off setup behavior;
6. recommend one intervention tied to the observed pressure;
7. expose missing identity, offer, channel, or authority;
8. ask Jacob only when the answer materially changes the intervention or authority.

One direct constraint event or two independent weaker observations is the default evidence floor.

## Authority

Agent-owned reversible work:

- inspect product definitions and authorized exports;
- normalize and deduplicate events;
- evaluate, rank, suppress, hold, and re-evaluate candidates;
- assemble evidence packets and draft interventions;
- run tests, repair state, and reconcile imported outcomes.

Jacob-controlled consequences:

- personalized use of operational data;
- identity or company resolution;
- production analytics and relay queries;
- CRM writes and contact enrichment;
- external communication and bulk actions;
- pricing, paid capacity, team rollout, support, or other offer commitments;
- sensitive-data exposure and legal conclusions.

The CLI mechanically omits delivery. Future delivery requires an authenticated adapter that consumes durable approval receipts, enforces recipient and volume rules, supplies idempotency keys, records provider receipts, and supports reconciliation. Instructions alone are not that mechanism.

## Recovery

- Source event IDs are unique and imports are idempotent.
- Account-rule pairs are unique and re-evaluation updates rather than duplicates them.
- Human decisions, action drafts, and outcomes are append-only receipts.
- SQLite transactions prevent partial imports and evaluations.
- The queue is a projection; the database is authoritative.
- Missing or changed evidence makes the opportunity stale; it does not erase history.
- No raw customer payload is required for recovery.

## Proof ladder

1. Schema and unit tests prove state transitions, deduplication, bounded storage, and consequence gating.
2. Fixture runs prove trigger discrimination and restart recovery.
3. Isolated agent scenarios prove the selected reasoning behavior only.
4. An authorized dry run against real exports proves source compatibility and candidate quality.
5. A delivered intervention with captured response and downstream behavior is required to claim expansion.

## Plausible false wins

- active-user or lead-scoring dashboards;
- event-triggered copy with no human relationship context;
- a polished opportunity packet for an unidentifiable account;
- a message sent through a side channel because the harness has no sender;
- a meeting that never changes Croki adoption or a commercial outcome;
- a successful test suite described as live GTM evidence.
