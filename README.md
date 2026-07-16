# Drover

**Vibe code your go-to-market.** Drover is the operating system for one-person holding companies:
permanent AI teammates run product and go-to-market bets across isolated ventures, while every send,
publish, deploy, and spend waits at one founder wall.

The active build contract is [The Firm](docs/FIRM-SPEC.md). The dated line between working software
and unproven market claims is [STATE](docs/STATE.md). The [documentation map](docs/README.md)
separates current translations from historical implementation packages.

## The product

A venture binds to a real product repository. Drover reads cited product truth from that repository
and opens on a Living Venture Atlas: one spatial model of how the venture creates value, reaches the
market, acts, and learns. Founder-defined concepts can stay open; product loops, systems, motions,
and campaigns gain operational meaning only when that meaning changes execution or evidence.

Persistent teammates work through that architecture, fork open-ended bets, and stage exact work.
Product changes use isolated git worktrees. The canvas joins architecture to bets, returned outcomes,
and the wall without becoming a workflow database or second source of truth. Nothing reaches the
world until the founder releases the exact effect.

The founder controls one heat dial—off, steady, or full—and one daily spend rail. Turning heat up
accelerates inward work; it never weakens the wall.

## Domain model

- **Teammate:** persistent character, voice, lessons, and real-outcome track record.
- **Bet:** open unit of trying; no kind, stage, or fixed schema.
- **Outcome:** durable record of what the world said, joined to its bet or honestly unattributed.
- **Fork:** the only structural verb. For code bets, it is literally a git worktree.

The loop is **diverge → stage → wall → decide → outcome → feed**. Internal manifests, decision
receipts, settings, and placement support that loop without becoming competing product nouns.

## Run locally

Requires a current Node.js release and npm.

```bash
npm install
npm run app
```

The desktop host opens the local workbench and injects a fresh founder capability below the renderer;
founder actions need no separate unlock ceremony. `npm start` still serves the browser shell for
read-only diagnostics, but intentionally cannot make founder changes because a standalone browser is
not an authority boundary. Local UI development may opt into `DROVER_DEV_FOUNDER=1 npm start`; this
default-off hatch accepts only non-agent requests whose origin and socket are both loopback. It does
not alter the shipped Electron authority path.

The historical `gtm-ide`, `channel`, and `~/.gtm-ide` implementation identifiers remain intentional.

## MCP

```bash
npm run mcp
```

The agent-facing door exposes venture-scoped reads and safe inward work. It cannot release, kill,
approve, authorize a deploy, or turn up heat.

## Desktop app for macOS

```bash
npm install
npm run app
```

Build an unsigned local disk image with `npm run app:dist`.

## Verify

```bash
npm test
npm run test:acceptance
```

The acceptance gate adds token parity, four preserved operating journeys, and three Living Venture
Atlas journeys to the mechanical suite.

## Safety boundary

The desktop host owns a volatile secret and signs each founder request with a short-lived,
single-use method-and-path claim. The secret is never exposed to browser code or logged. Unstamped
loopback, replayed, expired, cross-origin, actor-stamped model, and MCP writes are refused. The
deterministic browser journey uses an isolated per-run secret and request interception to exercise the
same contract without a production bypass. The optional `DROVER_DEV_FOUNDER` source-development hatch
still refuses agent-stamped, cross-origin, and non-loopback traffic and is off unless explicitly set.
Presence is a volatile lease: away holds every outward
release while inward work continues. Deploys require a second explicit founder authorization.
Ventures fail closed across every read and write.
