# Croki

**The coding environment for founders building products with Claude and Codex.**

Croki is designed to be the place a founder prefers to code: direct native Claude and Codex, inspect and steer
exact work, verify and ship it, then return without rebuilding context. Its advantage over an otherwise strong
coding-agent client is accumulated Product understanding—source-backed intent, corrections, verified behavior,
decisions, and evidence that make the next coding move better.

## Product shape

The Electron desktop has one founder surface over one local project model. Conversation is the permanent
Thread spine; exact material opens beside it as a contextual workbench:

- **Thread spine** — direct Claude/Codex conversation, isolated Runs, code, terminal, preview, tests, artifacts,
  evidence, and exact founder Review.
- **Canvas** — an optional contextual view that earns space only when seeing Product truth, relationships, live
  work, consequences, or evidence materially improves the next coding direction, correction, Review, or return.

Product truth, promise, offer, pricing, audience, experience, capability, and business model may all change.
PLG, outbound, inbound, partnerships, manual onboarding, bespoke customer work, and unusual experiments may
coexist. Unscalable work is first-class.

Claude and Codex retain their native capability. Croki supplies venture context, durable Threads and Runs,
isolated work, branching, evidence, review, and authority. Agents may revise provisional Product models and
prepare outward actions; only the founder can make a Product change current or cross into the world.

## Start

Requirements: Node 22+, npm, macOS for the shipped Electron product, and an authenticated Claude Code or Codex
runtime.

```sh
npm install
npm start
```

`npm start` builds and launches the Electron desktop product. The browser build is a deterministic test harness,
not another production surface.

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
