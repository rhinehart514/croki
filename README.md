# Drover

**A Product and GTM Development Environment for founders building with agents.**

Drover lets one founder run Product and go-to-market as one fast, changing system. Direct Claude and Codex,
pursue several routes to growth, change the Product when reality demands it, and compound every useful result
into faster next moves.

The durable product contract is [`docs/FIRM-SPEC.md`](docs/FIRM-SPEC.md), intended desktop experience is
[`DESIGN.md`](DESIGN.md), and honest current proof is [`docs/STATE.md`](docs/STATE.md).

## Product shape

The Electron desktop has two founder surfaces over one local venture model:

- **Work** — direct Claude/Codex conversation, isolated Runs, code, terminal, preview, tests, artifacts, evidence,
  and exact founder review.
- **Product / GTM** — current Product truth, several motions, durable provisional alternatives, attached live
  work, outward actions, evidence returns, conflicts, and selective founder merge.

Product truth, promise, offer, pricing, audience, experience, capability, and business model may all change.
PLG, outbound, inbound, partnerships, manual onboarding, bespoke customer work, and unusual experiments may
coexist. Unscalable work is first-class.

Claude and Codex retain their native capability. Drover supplies venture context, durable Threads and Runs,
isolated work, branching, evidence, review, and authority. Agents may revise provisional Product models and
prepare outward actions; only the founder can make a Product change current or cross into the world.

## Start

Requirements: Node 22+, npm, macOS for the shipped Electron product, and an authenticated Claude Code or Codex
runtime.

```sh
npm install
npm start
```

`npm start` builds and launches Electron with an in-process Brain. The browser build is a deterministic test
harness, not another production surface.

## Verification

```sh
npm test
npm run check:dead-code
npm run check:architecture
npm run check:size
npm run check:bundle
npm run test:site
npm run test:firm:browser
npm run test:acceptance
```

Mechanical gates do not prove product coherence. Release readiness also requires one real dogfood loop:

```text
connect repository → state what should become true → exact agent work
→ provisional Product change → founder-gated outward action → evidence return
→ selective merge → faster next move
```

See [`RUN.md`](RUN.md) for the resume order and verification contract.
