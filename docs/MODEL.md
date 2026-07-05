> **SUPERSEDED — 2026-07-01.** This describes the object model, loops, and surface of
> the earlier "IDE for GTM" version of the product. The current plan of record is
> **docs/GTM-ENGINE-REBUILD.md**, which defines a new record model (Evidence,
> ProductTruth, MarketObject, GTMPath, MeasurementContract, Run, Result,
> RepeatableMotion, Learning). Where this doc conflicts with that spec, the spec wins.
> Kept for history only.

---

# Drover — the model, the loops, and the surface

This is the single orienting document for what GTM IDE *is*: its conceptual model
(the layers of objects), its workflows (what you actually do), and its interaction
model (the one surface you do it on). It sits above the two deeper docs — `docs/history/DDD.md`
(the system layer in detail) and `EXPERIENCE.md` (the canvas in detail) — and ties
them to the truth and interpretation layers neither one fully draws.

It supersedes the parts of `VISION.md` and `docs/history/CURSOR_GTM_UX_PLAN.md` that contradict it
(see "What this retires" at the end).

---

## The conceptual model: three layers

GTM IDE is built from three layers of objects. Each answers a different question, and
the line between them is load-bearing — most of the product's invariants are really
rules about not letting one layer leak into another.

### 1. Truth — what the code provably does

The scan. Cited `file:line` reality: the stack, the win event, what's attributed, what's
blind. Read-only. It reports facts and never imposes a shape — no taxonomy, no pipeline,
no "this is an outbound product." If it can't cite it, it says inferred or blind.

Owns: `scan.mjs`, `product-understanding.mjs`. Bound by the citation rule.

### 2. Interpretation — what your product *is*

The **Living Product Picture**. The truth is honest but shapeless: it has no notion of
the product's *things*, how they relate, what users are trying to do, or what states
they move through. The Picture is that model — core objects, relationships, user goals,
key states — drafted by a rented model, edited by the founder, accumulated as versioned
history, and pinned with real-world feedback so it stays current.

It is interpretation, not fact. Each element is marked `derived` (cites real code) or
`speculative` (a founder/model guess). It rides *alongside* the truth and is never folded
into any engine health number — a guess can't launder itself into a cited fact.

There is one Picture per product. It is the shared orientation every attempt grounds on.

Owns: `product-model-store.mjs`, `product-model-generator.mjs`, `ProductPicture.tsx`.

### 3. System — the GTM you build, run, and learn from

What you actually construct against the product. The spine, in order:

```
OutcomeProgram          one business attempt (the outcome you want)
→ AgentCreationPolicy   the rules for building an agent for it
→ PersonalizationProfile the context that agent is born with
→ AgentInstance         the actual agent, built for one job
→ GTMGraph              the steps it runs (open kinds: tool/agent/skill/code)
→ FounderGate           the wall before anything reaches the world
→ FeedbackSignal        what your gate decision taught the system
→ next policy version   the rules, revised → a smarter agent next time
```

There are many programs per product; each is one attempt. The graph is the *execution
plan*, never the business object. Owns: `docs/history/DDD.md` documents this layer in full.

**The layers stack:** truth grounds interpretation; interpretation grounds the system.
A founder edit to the Picture ripples into every downstream agent prompt because every
agent re-grounds from the current Picture, not from a 4-line blurb.

---

## The workflows: two loops, one canvas

An IDE is defined by two motions — you author, and you debug. GTM IDE owns both, on the
same surface. They are not two products; they are two entry rituals into the system layer.

### Build (the primary loop)

The default. The thing a stranger does first.

You open your repo and the scan runs. The Picture appears and hands you what the product
*is* — a Builder, a Project, a Vouch; the goal of getting matched; the states a project
moves through. You correct what's wrong and the correction sticks. Then you name the
outcome you want in plain words — "land one pilot," "get ten of the right people to try
it." Claude builds the agents and the workflow to chase it, grounded in the Picture you
just edited. It runs, and stops at the gate with real drafts staged. You approve, reject,
or redirect. Your decision becomes feedback that revises the rules, so the next agent the
program builds starts from what you taught it.

```
open repo → scan → Product Picture (edit) → name outcome
  → Claude builds agents + graph → run to gate → decide → feedback → smarter next
```

### Debug (the second door)

Off the same canvas. You reach for it when something is *broken* rather than when you're
starting fresh. The engine derives real health for every node from the scan, the run
ledger, and connector state; the Problems rail ranks what's wrong across the whole system
and routes you to the node that fixes it. Some breaks are in the GTM (a stalled pipeline);
some are in the *product code* — a win event with no attribution source stays honestly
blind until that gap is repaired in the code, in an isolated branch, reviewed as a diff,
gated before it touches the repo.

```
scan → Problems rail ranks breaks → route to the node/code fix
  → review diff or edit → gate → apply → re-verify
```

Both loops end the same way: at a founder gate, with durable history. "Vibe up to the
gate, never past it" governs both — building and debugging are fast and reversible;
anything that sends, publishes, charges, or writes to your repo is a hard wall.

---

## The interaction model: one canvas, framed

Settled in `EXPERIENCE.md` and kept here. There is **one surface — the graph.** Everything
else is a lens, an inspector, or a dock around it.

- **The plane is the graph.** The composed execution DAG is the primary surface. Direct
  manipulation: add a step, wire an edge, open a node. The gate is the single accent color
  — the eye goes to the wall.
- **Modes are lenses, not surfaces.** Design / Simulation / Run / Review / Learning re-skin
  the one graph to ask a different question about it. A mode never executes; only Run runs.
- **The inspector carries the business object.** Outcome, buyer hypothesis, pipeline
  hypothesis, measurement plan, the agents and their creation policies, the learning threads
  — these live in the inspector, not as fake nodes on the canvas.
- **Claude is a dock, not a mode.** It proposes graph operations and composes workflows;
  the founder accepts. It never owns the gate.

### Where the Picture sits

The Living Product Picture is the **entry surface**, not a buried overlay. After a scan it
greets you — "here's what I think your product is" — before you name any outcome. It is
product-level, so it lives above any single program: edit it once, every program and every
agent re-grounds from it. From inside a program you can reopen it any time; it is the
product's mental model, always one click away, never coupled to one attempt.

This is the one place the interaction model changed from the original overlay spec in
`PRODUCT-MODEL.md`: the Picture is promoted from on-demand overlay to the post-scan entry
surface, because it is the bridge between truth and the system — the orientation you build
every attempt on.

---

## What this retires

- **`VISION.md` is stale where it describes the architecture as a fixed nine-node pipeline**
  (CONTEXT → SOURCE → ENRICH → FILTER → GENERATE → GATE → EXECUTE → MEASURE). That cage was
  removed across `GOAL.md` phases P1–P9 and replaced by the open node model (tool/agent/
  skill/code). VISION's insight (start from the repo; the canvas is alive; the ledger makes
  feedback real) survives; its architecture section does not. Rewrite or retire it.
- **`docs/history/CURSOR_GTM_UX_PLAN.md` framed the product as debugger-*only*** ("do not ask users to
  draw an abstract automation graph"). That's now the *second* loop, not the only one. Build
  is the primary loop; debug shares the canvas. The plan's workspace/revision/diff machinery
  is real and kept — it's how the debug loop's code-fix path works — but its claim to be the
  whole product is superseded.

The deeper docs stay authoritative for their layer: `docs/history/DDD.md` for the system layer,
`EXPERIENCE.md` for the canvas, `PRODUCT-MODEL.md` for the Picture's build spec (with the
one promotion noted above).
