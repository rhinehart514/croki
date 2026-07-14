# Drover

**Vibe code your go-to-market.** Drover is the operating system for one-person holding companies: a
permanent AI crew runs product and go-to-market bets across isolated ventures, while every send,
publish, deploy, and spend waits at one founder wall.

The active build contract is [The Firm](docs/FIRM-SPEC.md). The dated line between working software
and unproven market claims is [STATE](docs/STATE.md).

## The product

A venture binds to a real product repository. Drover reads cited product truth from that repository,
summons persistent teammates, and lets them fork open-ended bets. They research, draft, and build in
the background. Product changes use isolated git worktrees. Nothing reaches the world until the
founder releases the exact effect.

The desktop canvas is a lens over the firm, not a workflow database. It shows crew, bets, returned
outcomes, and the wall. A bet is always derived as live, at the wall, or ended by the founder. The
founder's approvals, rejections, answers, and kills become durable taste for later work.

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
npm start
```

Open the local URL printed by the server, unlock founder actions, and create a venture with its
product repository path. Set `GTM_IDE_FOUNDER_CODE` before starting to choose the local founder code;
otherwise the server prints a generated one.

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
npm run test:firm:browser
```

## Safety boundary

Founder authority is browser-session-only and non-forgeable by models, MCP, or stored content.
Presence is a volatile lease: away holds every outward release while inward work continues. Deploys
require a second explicit founder authorization. Ventures fail closed across every read and write.
