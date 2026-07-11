# Drover

**Alpha · v0.3.3** — the terrain-first product is built and tested, but no outside founder has yet
used Drover to produce an attributable real-world win. [The state document](docs/STATE.md) keeps the
dated, honest line between working software and market proof.

**Drover reads your product, shows where it may have leverage, gives you a crew to work through the
uncertainty, turns your choice into a safe go-to-market move, and brings the market's answer back to
what you build.**

## The product

You point Drover at a product repository and name the event that counts as a win. It opens on a
living product-market terrain: what the code proves, where the product may meet the market, what is
still uncertain, what you have chosen to try, and what came back.

The first useful view does not require you to invent a goal. Cited product truth appears directly
from a read-only scan, even when no AI runtime is connected. With Codex or Claude Code available,
Drover adds clearly labeled openings and tensions. These are informed reads, not facts dressed up as
facts, and each can show the evidence, uncertainty, and what would change the read.

From there:

- The **terrain** is the living picture of the product and market. It remains useful before any work
  begins and changes as decisions and outcomes accumulate.
- An **operation** is the worked layer over that terrain: the questions, crew positions, active
  moves, founder decisions, and results currently in play.
- A **pipeline** is one move you choose to make real. It is an open, editable flow of agents, tools,
  code, and other steps that runs to your approval wall.

The canvas has two working distances. Operator keeps the whole terrain in view so you can understand,
question, correct, and choose. Engineer opens one selected move so you can inspect its real pipeline,
watch it run, and review the exact outward effect before approval.

## What stays yours

Drover rents intelligence and owns a small, durable harness:

- **Truth.** Claims about what the product already does come from a read-only scan with `file:line`
  receipts, or are plainly labeled as inference. Deterministic truth does not require an AI runtime.
- **The founder wall.** Nothing sends, publishes, deploys, or charges without founder authorization.
  A pipeline may earn more autonomy for routine cases only through an explicit founder promotion;
  exceptions still return to the wall.
- **Taste.** Every approval, rejection, and edit becomes durable memory that shapes later work.

Research, interpretation, composition, and drafting come from a frontier model running locally through
the founder's existing subscription. Codex and Claude Code are both supported; choosing either should
not change Drover's product model or safety boundary. The intelligence can improve or be replaced while
the cited truth, wall, decisions, and learned taste remain.

## Run locally

Requirements: Node.js and Git. Codex or Claude Code is optional for the deterministic product scan and
existing terrain; connect one when you want model-generated reads or agent work.

```sh
npm install
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317), add a product repository, and name the event or
result that counts as a win.

For rented intelligence, sign in through a local CLI using either subscription:

- Codex: install Codex CLI and sign in with ChatGPT.
- Claude: install Claude Code and sign in with Claude.

No API key is required when the local CLI already has subscription authentication. Provider-specific
environment credentials remain available for supported setups.

Run Drover's agent-facing tools from a compatible local agent client:

```sh
npm run mcp
```

Scan a repository without starting the interface:

```sh
node brain/src/mirror.mjs <repo> --win <event>
```

The bundled acceptance fixture demonstrates the truth layer: scanning the sample product finds cited
product behavior and a measurable attribution gap. That fixture is a software evaluation, not customer
validation.

## Desktop app for macOS

The desktop shell wraps the same local brain and interface. State stays on the machine in
`~/.gtm-ide`; the historical directory name is intentional.

```sh
npm install
npm run app:rebuild
npm run app
```

Build an unsigned local disk image with `npm run app:dist`. On first launch, macOS may require you to
right-click the app and choose **Open**.

## Verify

```sh
npm test
npm run test:terrain:browser
```

The main suite covers cited truth, project isolation, terrain normalization, both runtime adapters,
open pipeline composition, the founder wall, taste, outcome return, interface tests, lint, and the
production build. The deterministic browser journey exercises the terrain-first path with fixtures at
desktop, compact, and narrow widths. Local subscription smokes and the real-founder alpha evaluation
are separate gates; see [docs/STATE.md](docs/STATE.md).

## Safety boundary

- Repository scanning is read-only and local.
- A deterministic terrain read spends no model subscription and writes no state.
- Terrain hypotheses are context for judgment, never authority to approve work.
- Every outward path retains the founder wall. Agents cannot approve themselves through the browser,
  API, or MCP surface.
- Approved sends can reach only a transport the founder connected. Product changes stop at review, and
  a standalone deploy requires a second explicit authorization.
- The dogfood builder works in isolated branches and never merges, pushes, or ships on its own.

Package names, the MCP server key, storage paths, and some code identifiers still use `gtm-ide` or
`channel`. Those are historical identifiers. Founder-facing language says Drover and pipeline.
