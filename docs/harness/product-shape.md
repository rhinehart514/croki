# The Shape the Founder Feels

> **ARCHIVED HARNESS.** This engine-era experience doctrine is not a current design or implementation
> contract. Use [`../FIRM-SPEC.md`](../FIRM-SPEC.md), [`../STATE.md`](../STATE.md), and the root
> [`DESIGN.md`](../../DESIGN.md).

The spec for what Drover *is* from the founder's side of the screen. The engine is technically ahead of
the product; this document is the standing instruction to make the engine **disappear behind one
feeling**:

> I know what to do next, why it matters, and how the system gets smarter after I do it.

Everything the founder sees ladders up to that. If a surface makes the founder feel like they are doing
GTM architecture instead of getting dangerous at GTM, it is wrong — hide it or translate it.

---

## The five primitives — all the founder manages

The founder-facing model is exactly five things. Everything else — signal, ICP, pain, offer, channel,
message, proof, objection, competitor, partner, asset — is supporting context Claude infers, never an
object the founder manages.

| Primitive    | The question it answers            | Example |
|--------------|------------------------------------|---------|
| **Goal**     | What are we trying to make happen? | Get 1–3 paid pilots this week. |
| **Bet**      | What do we currently believe?      | Agencies with manual reporting will pay for automation setup. |
| **Move**     | What should we do next?            | DM 40 agency owners a 72-hour setup offer. |
| **Run**      | What actually happened?            | Sent 40, 6 replies, 2 calls, 1 paid. |
| **Learning** | What did the market teach us?      | "72-hour setup" beat "AI automation." |

The loop the founder lives in: **Goal → Bet → Move → Run → Learning → better Move.** That loop is enough.

## Best Next Move is the main surface

Not the graph. The dominant thing on screen, always, is one card that answers: what to do, why, do this
today (the literal action), win-if, kill-if, and the upgrade to reach for if it works. It is more
important than any diagram. A founder should be able to open Drover, read one card, and act — before
they understand anything about how it works.

## Move, not pipeline, is the atomic unit

In first-run experience the unit is a **move** — one thing to do next — never a "pipeline." A move can
*become* a repeatable pipeline once it works, but a novice thinks "what should I do next," not "which
pipeline shape should I instantiate." Keep `pipeline`/`channel`/`graph`/`node` in code and advanced UI;
never in first-run copy.

## Translation — internal model to founder language

The rich internal model stays (that is the differentiated engine). It never leaks to the founder as-is.
Every internal object is translated:

| Internal / engineering | Founder-facing |
|------------------------|----------------|
| MarketObject           | Evidence |
| GTMPath                | Bet |
| MeasurementContract    | How we'll know |
| RepeatableMotion       | Reusable move |
| Result                 | What happened |
| Learning               | Learning |
| Provenance / solidity  | How sure we are (guessed / researched / observed / gated) |
| Pipeline / channel     | GTM system (only when named at all) |
| Object / entity        | Card / thing we know |
| Edge                   | Connection |

## Hidden until it helps — progressive disclosure

The default emotional surface is the five-primitive cockpit. These are **power-user views, one click
away, never the default**:

- **The object graph** (product truth → market → paths → run/gate → outcomes). A map for when it helps,
  not the first screen. The bands are the system explaining itself; a first-timer doesn't need that.
- **Agent faces / the crew.** Claude is the operator; Drover remembers what worked; agents are an
  implementation detail. Do not make the founder feel they manage a staff before they know what GTM is.
  Agent faces earn their way into view once trust exists.
- **Market-layer picking.** A beginner should not walk buyer → pain → job → trigger → … layer by layer.
  Claude researches enough to propose three moves, each showing its bet, evidence strength, risk, and
  action; the founder picks one. The layer-by-layer market picture opens on request.

## The front door

The opening prompt is **"What are you trying to make happen?"** — plus a few concrete modes that teach
the founder the right altitude (not fixed templates):

> Get money this week · Book buyer calls · Find the first real customer segment · Sharpen the offer ·
> Recover stalled leads · Launch a small GTM run

The modes exist to teach altitude, then Claude generates the expert structure (goal, bet, move, why,
do-today, what-to-measure) from whatever messy thing the founder actually typed.

## Make the learning loop visceral — close it manually first

The alpha bet — a real founder driving a real win to the gate — is still unproven, and the learning
loop, though built, has not been exercised by a real founder. So obsess over closing **one real loop
manually** before adding machinery. After every run, force one lightweight capture — *what happened?*
(got replies / booked calls / got paid / got ignored / got objections) — then *what did the market teach
us?* Founder-entered outcomes are enough for alpha; do not wait on perfect integrations.

---

## What does NOT change (the differentiated spine)

These are the reasons Drover is not a wrapper. They stay exactly:

- The read-only product-truth scan and its file-line evidence discipline.
- The founder gate — nothing reaches the outside world without approval.
- Taste memory — every gate decision sharpens the next run.
- Local-first posture.
- The refusal to fake market outcomes.
- Open shapes internally (the rich two-tier model reasoned over by harnesses).
- Claude as rented intelligence — the host constrains only truth, wall, taste.

## The one rule over all of it

Do not add another GTM subsystem. Make the current system feel like an elite GTM engineer for a founder
who has never done GTM. Default surface: Goal → Best Next Move → Run → Learning → better Move. Hide the
graph until it helps. Hide agents until they earn trust. Translate every internal object into founder
language. Close one real outcome loop manually before building more. Keep stale docs and
vertical-specific agents out of the active product.

*Companion: `gtm-engineer-mind.md` is how Drover thinks; this file is how the founder experiences that
thinking. The harness reasons; the cockpit shows; the gate teaches back.*
