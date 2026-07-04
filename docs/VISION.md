# VISION — Drover

Logged 2026-07-03. This is the north star: what Drover is for, and the shape it's being built toward.
It supersedes the earlier "IDE for go-to-market" framing. For where the build actually stands today
read `docs/STATE.md`; for how the system is constrained read `AGENTS.md`.

---

## The one sentence

**Drover makes Claude smart at your go-to-market — so that you get smart at it too.**

A general model is already decent at go-to-market in the abstract. It falls short in four specific
places: it doesn't know your product's real truth, it reverts to generic advice, it forgets what
you've already decided, and it can't safely act. Drover is the thing that closes those four gaps —
and it does it in a way where the founder ends up understanding their own go-to-market, not just
receiving an answer they have to take on faith.

---

## Five pillars

The whole product is these five, and they are really one thing.

1. **Smart at go-to-market.** Grounded in your real product (a cited, read-only scan) and your
   accumulated taste (every decision you make at the gate). The test is concrete: on your own
   product, does Drover's output beat raw Claude? If a feature doesn't widen that gap, it isn't
   earning its place. The judgment lives in the model with good context — never frozen into code,
   because every hardcoded go-to-market rule makes the model dumber.

2. **Comprehension, not convergence.** A founder who has never done this should come to understand
   every layer and every option — the product reveals the space and teaches, it never funnels you to
   one hidden answer. It guides without converging: it shows a strong path so a beginner isn't
   drowning, while keeping the whole space visible and the reasoning one hover away. The output isn't
   a recommendation; it's a founder who can now decide with their eyes open.

3. **The learning loop.** Product and market teach each other, with the founder and Claude both
   getting smarter inside the loop. You start from the ICP, take a path to market, and what comes
   back — who responded, what they wanted, what they ignored — flows two ways at once: it sharpens
   the next go-to-market, and it feeds back into what you build. Drover is the one tool sitting at
   both ends of that loop, because it reads your code and runs your go-to-market.

4. **Labor versus judgment.** Claude does the work and lays the whole field in front of you; you make
   every call. This isn't politeness — it's structural: your calls are the only signal that teaches
   it your taste, so a Drover that "does it all" could never get smart at you. Claude is the operator
   who never decides but makes every decision easy and fully sighted.

5. **Refine your crew.** You don't generate a pipeline once — you keep a living, tunable set of
   agents (reusable teammates) and plays, and refine them together over time. Each agent has a face
   that shows what it has become: what it's learned from your edits, its track record, how it writes
   for you now. Refinement is visible and founder-approved, never silent drift.

---

## The harness — the only three things the host constrains

Everything above runs on a deliberately thin harness. The host holds the rented model on a short
leash for exactly three things and lets it run free on everything else:

- **Truth.** A read-only scan cites what the product does to real evidence, or labels it inferred.
  The model cannot invent product facts.
- **The Wall.** Every step that reaches the outside world needs a founder gate upstream, on every
  path. Nothing sends, publishes, or charges without explicit approval. The gate graduates by
  explicit founder promotion; it never disappears.
- **Taste.** Every approve, reject, and edit at the gate becomes durable memory that shapes the next
  run.

The failure mode to guard against forever: re-growing a fourth layer of hosted go-to-market judgment.
Fuzzy work — research, ideation, ranking, drafting — is a rented agent behind an open step, never a
hosted module. A feature is an agent plus a step, not new plumbing. Less is more.

---

## What's built toward this (2026-07-03)

The vision buildout is complete and verified on the `lean-rebuild` branch (see `docs/STATE.md`): the
learning loop closes end to end (an outcome can flow back and reshape the next run), the go-to-market
judgment has moved into agents and taste, and the two surfaces the vision turns on — the agent face
and the market picture you build one layer at a time — are built. The gate wall is hardened and
tested end to end.

What remains is not more building: it's the one thing that earns the next stage — a real founder
driving this whole loop to a real, measured outcome, once.
