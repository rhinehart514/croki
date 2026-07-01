# Drover — Product Spec

*One doc. What this product is, how it works, what exists today, and what has to change to get there.*
*Plain words on purpose — if a label needs a glossary, it's wrong.*

---

## 1. What it is, in one breath

**GTM IDE is a Claude harness for go‑to‑market, with a living canvas as its cockpit.**

Claude Code is a *harness* that turns the model into a software engineer: a loop, tools, a workspace, memory, guardrails. Point that exact idea at customers instead of code and you get this product — the same scaffolding (find people, write, send, measure; a loop that runs and reacts; memory of your taste and your people; a wall nothing crosses without you) wrapped around Claude so it operates your whole go‑to‑market.

You tell it a goal. It does the work — across many **pipelines**, run by a fleet of agents, reacting to signals from the world. You **see, change, and run** all of it on one infinite canvas, and **nothing reaches a real person without your okay.** It reads your actual product so it never lies, and it learns your taste so every round is sharper.

> **The unit is a pipeline.** A *pipeline* is one staged flow to your gate — find → enrich → draft → **gate** → send → measure — the actual machine that moves work from a signal to a result. Your go‑to‑market is **many pipelines sitting together**, and you open any one into its own flow. (Not a marketing "channel" — that's just *where* you reach people; a pipeline is the flow that runs. The engine has always executed a pipeline; "channel" was only ever the internal code name for it, which we keep as an identifier, not a concept.)

The canvas is **Figma's surface** (infinite, freeform, beautiful, arrange‑anything) with **n8n's nodes** (real executable steps, data flowing between them, branches, triggers — *it runs*) — and **Claude is the brain wiring and running it all.**

The non‑negotiable: a founder who can build software by talking to Claude should be able to run their go‑to‑market the same way.

---

## 1.5 Decisions locked

Four calls that shape everything downstream:

- **Who (the wedge):** the **technical founder, pre‑PMF** — can ship a product but doesn't sell. Zero→first customers. Ties the market to people with a repo; that's focus, not a ceiling.
- **What we lead with:** the **visual harness** — *"watch your whole go‑to‑market run on one living canvas."* That's the headline and the demo. (Grounded + safe is the trust enabler *underneath*, not the lead.) → **Consequence:** the canvas must be genuinely jaw‑dropping — alive, calm at scale, screen‑record‑worthy. It's now the make‑or‑break surface.
- **Autonomy:** **opt‑in per pipeline.** It genuinely runs pipelines unattended once trusted — not drafts‑only. → **Consequence:** trust is existential, and it forces the **per‑pipeline autonomy ladder** below.
- **Hero interaction:** **conversation drives, canvas shows.** You talk; the canvas is the living result you glance at and dive into — never a thing you must operate.

**Positioning (one sentence):** *"Watch your whole go‑to‑market run on one living canvas. You tell it a goal by talking; it builds and runs the machine; and you trust it one pipeline at a time."* — for the technical founder who can ship a product but never sells it.

Four more, that sharpen it further:

- **Sending & trust:** **BYO** — sends through the founder's own Gmail/domain; we guard it (rate limits, provenance on every message, instant recall). No heavy sending infra in v1; build that only when autonomy scales.
- **First‑run aha → the map *teaches* you.** Not "5 leads." The wow is **the map drawing itself from your product so you *understand* all the layers of go‑to‑market and see where to jump in.** For a founder who doesn't know GTM, comprehension *is* the value — the map is a **teacher + a cockpit**, and most rivals assume you already know go‑to‑market. This is differentiated; protect it.
- **Data:** BYO lists + your own inbound signals (signups, stars, demo visits) **+ let users connect their own Apollo/Clay/etc. API keys.** Don't fight the data incumbents — let users bring them. We never compete on cold‑data depth.
- **v1 scope:** go big — **the multi‑pipeline harness is the v1**, not a single small loop. *But* the **map‑draws‑itself‑and‑teaches‑you must be the first two minutes**, or a big v1 dies slow. Fast comprehension up front; the pipelines running right behind it.

And the final, decisive batch:

- **Personality:** an **opinionated coach** — recommends the strong move and explains why, always overridable. It teaches by having a point of view.
- **Pipelines are composable, not fixed.** v1 supports *whatever pipelines fit the product* — the harness composes them (matches the existing naked‑harness engine; no hard pipeline list). Email + your inbound signals are the common case, but never the only one.
- **What it produces — the crown jewel: GTM Microproducts (see below).** Not just outreach. It also **builds small products as go‑to‑market plays**, by handing buildable `html/md/package` files to Claude Code / Codex agents that construct them — grounded in your real product.
- **Team from v1.** Multiplayer is on — people *and* agents co‑editing the canvas. Turn on the `convex` / `team-store` substrate.
- **Onboarding (step one):** **connect your repo** — it reads your real product and draws your GTM map; a *describe‑in‑words* fallback covers the pre‑repo case.
- **Calm at scale:** opening at 5 pipelines / 30 inputs lands on **what needs you + the single highest‑leverage move**; the whole living map is one zoom out. Calm by default, complexity on the dive. This is the test of "harness, not hairball."
- **The durable moat:** **the microproducts / build+sell convergence** — structurally uncopyable by data‑first incumbents. Taste and product‑truth compound on top.
- **Pricing:** **per‑seat + usage** (seats because team‑from‑v1; usage for agent work/runs). Move toward outcome‑based once it's provable.
- **Evolve, don't rebuild.** The engine already works (harness, executable graph, the wall, taste, person‑graph, team substrate); the cockpit catches up to it. No thrown‑away work.
- **First microproduct = an interactive demo/tool of your own product** (e.g., the rodent‑risk map on your real localization engine). Only this product can build it, because it read your code. The other kinds (calculators, templates) come later.
- **Microproducts ship to your stack / domain** — the coding agents build into your repo and ship on your domain; a one‑click hosted subdomain is the fast option. It stays yours.
- **Role‑based release at the wall** — owners and designated approvers release to real people; members draft and propose. Uses the existing `can-approve` roles.

### The GTM Microproduct — the differentiator nothing else can copy

A **GTM Microproduct** is a small product built *as* a go‑to‑market play — a free tool, an interactive demo, a calculator, a template, a proof page — that attracts and converts the people you're trying to reach. The product can build these because it sits next to the *build* harness (Claude Code / Codex): GTM IDE composes the asset as buildable files (`html/md/package`), hands them to coding agents, and they **construct a real, shippable microproduct**, grounded in what your product actually does.

> *"It built me a rodent‑risk calculator that ranks on Google and funnels signups."* — a sentence Clay, Apollo, and HubSpot physically cannot say.

This is the build+sell convergence made literal, and it's the moat. It's also the **hardest, riskiest** part of v1 — it wires the go‑to‑market harness into the coding harness and ships real artifacts. Treat it as the thing to protect and get right; let the rest stabilize around it.

### The per‑pipeline autonomy ladder (the safety story for real autonomy)

Autonomy is *earned per pipeline*, never granted by default:

```
Draft‑only      every item stops at the wall; you approve each (this is where every pipeline starts)
   ↓  you approve enough that it learns the pattern
Trusted         it sends within the patterns you've blessed; only exceptions escalate to you
   ↓  it proves out on that pipeline
Autonomous      runs unattended on that pipeline
   ↺  one click yanks any pipeline back to draft‑only, instantly
```

This is what lets "it runs while you sleep" coexist with "I'm not terrified." The Wall never disappears — it *graduates*, pipeline by pipeline, and is always revocable.

---

## 2. The core loop

A goal does not shoot straight to execution. It **blooms into the real decisions, you ideate each one, and your choices compile into a machine that runs.**

```
Goal  →  blooms into the real questions (who · why now · what we say · the motion · the assets)
      →  you IDEATE each fork (Claude offers options; you explore, choose, or test two)
      →  your choices COMPILE downward into a runnable flow (find → write → ⛔ wall → send → measure)
      →  RUN — real people move through the wires; the wall stops anything going out until you approve
      →  what you LEARN re‑opens the forks ("restaurants aren't landing — re‑ideate who?")
```

Two registers of node, one canvas:
- **Decision nodes** (the top / strategy): a question with options you ideate, then *choose* or *test*.
- **Action nodes** (the body / execution): an executable step that *runs* and passes data to the next.

Zoom out = the **shape** of your go‑to‑market (the decisions, the state). Zoom into any part = the **machine** that does it (the live n8n flow). Same surface, two altitudes. Every node either *tells you something* or *does something*.

---

## 2.5 The Ideation Engine — the biggest goal

The point isn't to *do* go‑to‑market faster — it's to **ideate go‑to‑market, and the microproducts, better than the founder could alone or with a generic chatbot.** "Better" is four mechanisms, made **visible and steerable on the canvas** instead of buried inside "compose":

1. **Grounded in your truth, not the mean.** Ideation starts from what's real and specific to you — your actual product (read from code), who's really engaging, your positioning, what you already tried and what won or died. Generic is the average answer; the average is the enemy. *Not "a calculator" — "a free 'where are rats getting in' map running on the localization engine you already built."*
2. **Bar before generation — kill, don't average.** It researches where the field actually is, draws a hard pass/fail bar (*attracts your buyer? buildable this week? shows only what your product can?*), and kills what doesn't clear it instead of handing you a pile of plausible mediocrity. *(This is the existing `crucible` / `ideate` machinery, pointed at GTM.)*
3. **Many angles, separately, measured for real distinctness.** Separate generators with different priors (what only your product can show · the buyer's worst moment · cheapest‑to‑build‑most‑proven · what's spreading in this niche), then a check that the batch is genuinely spread, not one secret cluster. **The generator never grades itself** — a separate adversarial critic scores against the bar.
4. **The loop closes, so it compounds.** An idea doesn't end at the pitch — it's **built** (by the coding agents), **shipped**, and **measured against real people**, and the next round starts from *what actually converted for you*, not a blank page. Your tenth idea stands on nine real outcomes. This flywheel is the thing no data tool or coding tool has.

It is a **first‑class, visible loop**: the strong survivors surface fast, and you can open any of them to see the bar it set, the angles it tried, and what it killed. **It proposes the bar** (from research + your taste); you adjust it. You steer mostly by **killing — one click, instantly** — and every kill *teaches it your taste*, so the next round is sharper. **You are always the final judge.** Ideation is not a quiet step inside compose; it is what the product is *for*.

Why it beats your alternatives: **vs. you alone** — you ideate from one biased head, no bar, no test. **vs. ChatGPT** — it ideates from the internet's average and knows nothing true about you. This ideates from your truth + a hard bar + many angles + real results — and compounds.

---

## 3. The same loop at scale — why it's a *harness*, not a tool

One goal is the easy case. The real case is **20–30 live inputs feeding 4–5 intertwined pipelines, worked by a fleet of agents.** That is chaos without orchestration. The harness *is* the orchestration:

- **Inputs are a living layer.** Commits, signups, demo visits, replies, GitHub stars, a competitor launch, a CSV. The harness routes them: a star → enrich + reach out; a failed onboarding → a save flow; a feature shipped → tell the people who'd care. Event‑driven go‑to‑market.
- **Pipelines intertwine — that's the moat.** Not five isolated flows. They share the same *person* (don't hit a lead who's also a star twice), the same *assets* (one page feeds all), the same *voice*, the same *learnings* (a win in one rewires the others). The value is the **wiring between pipelines**, which no human team tracks and a harness tracks perfectly.
- **Agents are a fleet you spin up and watch.** A prospector, an enricher, a writer, a closer, an analyst — spawn them, name them, assign them, see them work, retire the dead weight. You run an AI go‑to‑market org.
- **It runs without you, and the wall scales.** The harness is ambient — always on, reacting, getting better while you sleep. You can't approve every item at scale, so the wall graduates: you approve **patterns** ("fine to send this kind of thing to this kind of person"), and only **exceptions and big calls** escalate to you.
- **You steer two ways.** *Talk* to it ("lean into dev‑tool founders this week," "pause restaurants," "spin up a content pipeline") and the *canvas reorganizes*. Conversation is the command line; the canvas is the editor.

The harness earns its name only if, at that scale, the canvas zoomed out is **calm** — it surfaces the **few things that need you today** and hides the rest until you dive in.

---

## 4. The model — core objects

| Object | Plain meaning | Lives where today |
|---|---|---|
| **Harness** | The always‑on brain that holds tools, the loop, memory, and the wall, and runs your go‑to‑market | `operator-runtime.mjs` (goal‑driven today) |
| **Canvas** | The cockpit — one infinite surface where you see, change, and run everything | board lens + `GraphCanvas` (split today) |
| **Goal** | What you want, in a sentence ("5 pilot users for the rodent feature") | a prompt to the operator |
| **Decision node** | A real go‑to‑market question with options to ideate, choose, or test | **does not exist as a node** |
| **Action node** | An executable step (find / enrich / write / wall / send / measure) | connectors + `step-runners.mjs` ✅ |
| **Pipeline** | A wired graph of action nodes that runs to the wall — the unit you build, see, and run | `GTMGraph`, persisted as a flow ✅ (`channel` in code) |
| **The Wall** | Nothing reaches a person without your okay; scales to pattern‑approval | `gate` connector + `gate-pattern.mjs` ✅ |
| **Inputs** | Live signals from the world that trigger pipelines | **not first‑class** (`domain-events` only) |
| **Person** | A real human, deduped across every pipeline they touch | `person-store.mjs` ✅ |
| **Intertwining** | The shared threads between pipelines (same person/asset/voice/learning) | `cross-reference.mjs` ✅ backend, **unvisualized** |
| **Agent** | A named teammate that does a node's work | inline in flows; **no fleet view** |
| **Taste** | What it learns from your every approval, applied everywhere | `feedback-ledger.mjs` + `memory.mjs` ✅ |
| **Truth** | What your product actually does, read from the code | `scan.mjs` ✅ |

---

## 5. How it feels, end to end

You open the project. The canvas is calm: your go‑to‑market as a map, and one quiet line — *"two things need you today."* On the left edge, signals are streaming in.

You type *"get 5 pilot users for the rodent feature."* The canvas **blooms** — not a finished flow, but the real questions: a **Who?** node with three kinds of user Claude generated, a **What do we say?** node with four angles, a **How — outbound or let‑them‑try?** node, an **Assets?** node. You poke into **Who?**, say "ideate more," pick two to run head‑to‑head. You sharpen a message, choose product‑led. Downstream, the **flow wires itself** from your choices — *find → write in your voice → ⛔ your wall → invite → measure.*

You hit run. **Real people move through the wires** — found, drafted, stacking at the wall. Nothing sends. You open the wall, approve a pattern, mark one exception, release. Days later the replies are thin from one arm — the **Who?** node lights up: *"this guess isn't landing — re‑ideate?"* The loop never closes.

Meanwhile the harness has been running your other four pipelines off live signals, deduping people across them, and it surfaces only the two decisions that actually need you. You glance, steer by talking, dive in where you care.

---

## 5.5 The Canvas — the one surface (the UI)

The visualization *is* the product (the lead). Its laws:

**1. Everything is the canvas.** Full‑bleed, infinite, one surface. Nothing carves it into panes — the GTM map, the composer, produced work, the wall, and the orientation strip all **float on top** of the one canvas.

**2. The composer is the center‑bottom AI‑composer.** The conversation lives inside it; it is the single thing you act from. It carries its context (*reading your repo · your people*), the model, voice, and send. It stays put; the canvas pans behind it.

**3. The flow is a circulation with a current — not a transition.** The canvas has a *direction*: what you **make** flows up‑and‑out from the composer onto the canvas; what the world **answers** (signups, replies, what's working) settles back down into your map. You push ideas up; reality settles results down.
- *Send → lift‑out:* the goal lifts out of the input and flies onto the canvas, tethered to the composer by a living thread — you watch it leave.
- *Assemble, live but fast (~2.5s, never a spinner):* the bar snaps in, the angles fan, the survivors pop one by one, the weak one is struck and pushed down — you *see* "kill, don't average."
- *Steer:* kill (strike + drift) or talk ("sharper, more technical") and the survivors re‑flow in place. Killing is the main gesture.
- *Build → travel:* the keeper detaches, becomes a building node (Claude Code working), then a live asset.
- *Results flow back:* the shipped asset threads into the People region; signups trickle back into the map. The loop closes *spatially.*
- *Motion law:* the send→lift‑out is the one deliberate spring; assembly is fast and staggered; the kill is a quick strike; results return slow and ambient; typing and panning get **no** motion. (Depth routes to `design-motion-principles`.)

**4. Many flows run at once.** This is a harness, not a wizard. Several flows run **concurrently** — multiple lit regions working while you're elsewhere, even while you sleep — and the calm strip surfaces only the ones that *need you* plus the one highest‑leverage move. The current is always flowing somewhere; you drop into whichever region you care about. **Concurrency is the default; calm is the discipline.**

**5. Nodes are living objects — the card is only their resting state.** A node is **not** a static card, and the canvas is **not** nine different chart types. It is **one grammar with a living object behind it:**
- **One frame, adaptive face.** Every node shares the same card frame (learn the canvas once), but its *face* fits its content — a belief shows a line, a person an avatar, a microproduct a *live preview*, a metric a number/spark, a step what it does. One frame, many faces.
- **Kind + state, consistently encoded.** Kind (belief · step · person · idea · asset · decision · input) and state (idle · running · has‑result · needs‑you · proven) read through the *same* small signals — a left‑edge color, a glyph, a register — never a different shape.
- **It's alive.** It changes as the current flows through it: a send node fills with people on a run; a belief flips grey→green; a building node shows its agent working. State is visible, not hidden in a panel.
- **It has depth — it opens.** The card is the collapsed headline; opening a node *densifies* it into more nodes in the same grammar (a pipeline opens into its executable flow, People into the roster, an idea into its bar‑score and angles). Depth = more nodes, never a foreign diagram.
- **It has a lifecycle — it transforms.** An idea node, when built, *becomes* a building node, then an asset node. Nodes move through the flow.

So: **one grammar, living objects, adaptive faces** — coherent enough to learn once, alive enough that the canvas never reads as a wall of identical boxes or a ransom note of unrelated charts.

---

## 6. What exists today (honest inventory)

The **engine is largely built. The cockpit is half‑built. The strategy/ideation layer is missing.**

**Strong and reusable:**
- The executable node model — `GTMGraph` with open step kinds (tool/agent/skill/code/mcp), connectors (find/enrich/draft/gate/execute/measure/score/context), `step-runners.mjs`. *This is the n8n engine, already running.*
- The harness — `operator-runtime.mjs` (`run_loop`: compose a flow from a goal and drive it to the wall), the Claude‑subprocess runtime, restart recovery.
- The Wall — `gate` + `gate-pattern.mjs` (pattern + exception approval already exists).
- Taste — `feedback-ledger.mjs`, `memory.mjs`, `belief-writeback.mjs` (verdicts → learning).
- Truth — `scan.mjs`, `product-understanding.mjs`.
- Intertwining substrate — `person-store.mjs`, `cross-reference.mjs` (shared people, find‑references).
- Team substrate — `convex-sync.mjs`, `team-store.mjs` (multiplayer base, currently guarded off).
- The board read‑model and the spatial canvas + the pipeline `GraphCanvas` (the n8n‑style flow view), the composer dock (chat).

**Partial / split:**
- Two surfaces that should be one: the **board** (strategy/state) and the **pipeline `GraphCanvas`** (executable flow) are separate views, not two zoom levels of one canvas.
- Runs are visualized as *static results*, not *live data flowing through the wires*.

**Missing:**
- **Decision/ideation nodes** — the "goal blooms into forks you ideate" model. The compose today picks a flow; it does not open the *who/message/motion/assets* decisions as explorable nodes.
- **A first‑class inputs layer** — live signals that trigger flows. Today the operator reacts to a goal and a scan, not to a stream of world events.
- **Ambient / continuous operation** — the harness is goal‑driven and session‑bound; it does not run always‑on, reacting to inputs, surfacing what needs you.
- **The intertwining, visualized** — the threads between pipelines (shared person/asset/voice/learning) exist in data but are never drawn on the canvas.
- **An agent fleet view** — spawn / name / assign / watch / retire agents as a managed team.
- **The post‑sale half** (onboard → retain → expand — the bowtie right side) and an explicit **motion** choice, per the GTM research.
- **Jargon‑free surface** — labels today are internal taxonomy ("center of gravity · 65"); the product must speak plain language.

---

## 7. What has to change (the work, by area)

**A. Unify the canvas (the cockpit).** Merge the board and the pipeline graph into **one infinite Figma‑grade surface** with semantic zoom: high zoom = decision/state nodes, low zoom = executable flow nodes, one node grammar. Freeform roam, summon, draggable — keep the freeform work already shipped; retire the accordion. *Files: the board lens, `GraphCanvas`, `CanvasShell`.*

**B. Add decision/ideation nodes + the bloom‑and‑compile flow.** A new node kind — a question with generated options you can ideate, choose, or test — and the machinery where a goal explodes into the real GTM decisions (who/message/motion/assets) and the chosen options compile down into the runnable flow. Claude generates the options (grounded in the product + research) and wires the result. *Files: `workflow-composer.mjs` (compose becomes "bloom then compile"), new decision‑node kind in the graph + step runtime, the operator's compose tool.*

**C. Make runs alive.** Stream real entrants through the wires on a run — people accumulating, dropping at filters, stacking at the wall — the screen‑record moment. *Files: `graph.mjs` run events → a live‑run channel the canvas subscribes to.*

**D. Add the inputs layer + make the harness ambient.** A first‑class **Inputs** edge (signals: commits, signups, replies, stars, events) and an always‑on loop that routes inputs to flows and reacts within the wall — turning `run_loop` from goal‑driven one‑shot into a continuous operator that surfaces what needs you. *Files: new `inputs`/signals store + ingestion, `operator-runtime.mjs` loop, `domain-events.mjs`.*

**E. Visualize the intertwining.** Draw the threads `cross-reference.mjs` already computes — shared people/assets/voice/learnings between pipelines — as first‑class on the canvas; add cross‑pipeline fatigue control. *Files: `cross-reference.mjs` (exists) → new canvas overlay.*

**F. The agent fleet.** A view to spawn, name, assign, watch, and retire the GTM agents working the nodes. *Builds on the inline agents + the "agent as a person" work.*

**G. Wall‑at‑scale, surfaced.** Bring `gate-pattern.mjs` to the front: approve patterns, escalate exceptions, so one founder runs many pipelines without drowning. *Files: `gate-pattern.mjs` (exists) → the approve surface.*

**H. Ground the stages in real GTM + kill jargon.** Adopt the researched model — strategy (who/why/say/offer) → **motion** → funnel → **keep/grow (onboard/retain/expand)** → measure → learn‑loop — and replace every internal label with plain words. *Files: `board.mjs` stage model, all node copy.*

**I. (Later) Build + sell on one canvas, multiplayer.** Product/build nodes wired next to GTM nodes (shipping triggers go‑to‑market); turn on the `convex`/`team` substrate for shared canvases. *Files: build/`mcp` nodes, `convex-sync.mjs`.*

**J. Make ideation a first‑class visible loop.** Today ideation is implicit inside compose. Surface it: the bar, the fan‑out of angles, the adversarial kill, the surviving ideas (each pre‑wired to build + test), all steerable on the canvas — and wire the close‑the‑loop (build → ship → measure → next round). Reuse the `crucible` / `ideate` machinery the founder already built. *Files: new ideation loop in the composer/operator, the `ideate`/`crucible` skills, the run‑derivation feedback into the next ideation.*

---

## 8. Invariants — what must not break

- **Truth.** Claims about what the product *does* are read from the code or marked inferred. Never invented. (`scan.mjs`.)
- **The Wall, graduated.** A pipeline starts draft‑only — nothing reaches a person without an explicit okay. Trust is then *earned per pipeline* up the autonomy ladder (draft → trusted → autonomous), always explicit, always one click from being revoked. A pipeline only sends unattended after the founder has deliberately promoted it; autonomy is never the default and never silent.
- **Deploy is the wall graduating, never the wall removed.** Scanning and build stop before commit/push/deploy, EXCEPT a microproduct deploy the founder explicitly approved at the gate — always gated, never silent, never set by composition or a run. The deploy execute connector (`connectors/execute/deploy.mjs`) ships a built microproduct (BYO git push/hook as the primary path, a hosted Vercel deploy via the Vercel MCP as the fallback) ONLY when two unforgeable founder authorizations both pass: the gate's `approved === true` stamp on the item, AND an explicit founder deploy confirmation read solely from the founder‑input run path (`node.runtime`/run context), never from `node.config`. Composition's only reach is `node.config`, so a composed graph or an autonomous run can never self‑deploy; with either authorization missing the connector refuses and ships nothing. No silent send/deploy path exists.
- **Taste.** Every approval, rejection, and edit teaches it, applied to the next run everywhere. (`feedback-ledger`/`memory`.)
- **Calm at scale.** The cockpit zoomed out shows the few things that need you and hides the rest. Complexity lives in the dive, never the overview.
- **Everything is the canvas.** One full‑bleed surface; the composer (center‑bottom) and everything it produces float on top. No panes carving the screen.
- **One grammar, living objects.** Every node shares one card frame with an adaptive face, carrying a kind, a state, real data, depth it opens into, and a lifecycle it transforms through — never a static card, never a gallery of unrelated chart types.
- **The current flows; many flows at once.** Work flows up‑and‑out from the composer; reality settles back into the map. Flows run concurrently and ambiently; the surface stays calm by showing only what needs you.
- **Plain words.** No label requires insider knowledge.
- **Ideation has a bar, and the generator never grades itself.** Every ideation sets a hard pass/fail bar *before* generating, fans out from distinct angles, and is scored by a separate adversarial critic — then closes the loop by building, shipping, and measuring. The founder is always the final judge; the machine never crowns its own idea.

---

## 9. Build order (so the app never breaks)

1. **Unify the canvas** (A) + **kill jargon / real stages** (H) — make the one true surface, plain.
2. **Bloom‑and‑compile + decision nodes** (B) — the ideation‑into‑execution loop; the heart.
3. **Alive runs** (C) — the moment that sells it.
4. **Inputs + ambient harness** (D) + **wall‑at‑scale surfaced** (G) — scale safely.
5. **Intertwining + agent fleet** (E, F) — the moat, made visible.
6. **Build+sell + multiplayer** (I) — the convergence.

Each step ships green and leaves the product usable. The engine is already there; most of this is the cockpit catching up to it.

---

*Thesis restated: not "a GTM tool with AI." A **Claude harness for go‑to‑market** — the brain that runs your customers the way Claude Code runs your code — with a canvas to see it, steer it, and approve what it does. Building and selling are one loop now; this is the selling half, on the same brain.*
