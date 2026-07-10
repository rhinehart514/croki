# Product Room and UI/IA

## Primary surface

The product room is the home for one product. It should make the GTM-for-product-development loop legible
without showing every pipeline, capability, or internal subsystem at once.

Primary object: the product and its unresolved GTM questions.

Primary action: ask the crew what matters or choose a meaningful next move.

## Product room layout

The default view should contain:

1. **Product reality** — what the code proves, what the product model interprets, and where grounding is weak.
2. **Current GTM crew** — relevant teammates, their roles, and current work.
3. **Open questions** — unresolved market/product questions and their strongest evidence.
4. **Recent changes** — code/product changes with possible GTM implications.
5. **Signals and outcomes** — what the market or product behavior has returned.
6. **Next moves** — model-proposed actions, clearly separated from founder decisions.

Pipelines and graphs appear when an action is opened or running.

## Question room

A question room should show:

- the question in plain language;
- why it matters;
- evidence for and against;
- relevant product elements and code references;
- the teammates working on it;
- disagreements;
- possible next moves;
- action/run history;
- outcomes;
- founder decisions;
- what changed because of those decisions.

## Teammate experience

The teammate profile becomes a working dossier, not just a roster card:

- who this teammate is;
- what it does for GTM;
- what it currently believes on this question;
- evidence used;
- uncertainty;
- track record;
- founder-taught lessons;
- recent contributions;
- ask this teammate;
- assign or remove from this question.

Do not expose raw prompts, source paths, internal soul keys, or host machinery as the teammate experience.

## Action/run experience

When an action becomes a graph, the graph is the main surface for that action. The action header must state:

- the question or goal it serves;
- the crew involved;
- what the action may change;
- what measurement is attached;
- what the gate will release;
- what remains unknown.

The current graph, gate review, streaming run, and outcome surfaces can be reused here.

## Visual direction

- calm light ground;
- monochrome base;
- one semantic accent for the founder gate;
- teammate faces used as identity, not decoration;
- evidence and uncertainty visible without score theater;
- no dashboard density by default;
- no decorative gradients, glow, or generic AI chat styling;
- every empty, loading, error, partial, and mobile state intentional.

## Delete/demote in the UI

- full pipeline fleet as the default landing;
- capability inventory as a primary navigation destination;
- separate surfaces that duplicate product grounding;
- agent bench numbers without meaningful records;
- “run” as the only obvious verb;
- canvas modes that merely rename the same graph.

## Implementation prompt

```text
Rebuild the GTM home around the product, relevant crew, open questions, evidence, decisions, actions, and
outcomes. Reuse the existing canvas and gate as focused action surfaces. Do not create a generic dashboard or
another set of lenses. Every card must answer what it represents, why it matters, what is known, and what the
founder can do next. Preserve teammate identity and gate trust. Browser-verify the product room, question room,
teammate dossier, action graph, gate review, outcome return, empty state, loading state, error state, keyboard
navigation, and narrow viewport.
```

