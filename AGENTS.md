# Drover repository instructions

## Authority

`docs/FIRM-SPEC.md` defines durable product and build physics. `docs/STATE.md` defines what the current
tree proves. `DESIGN.md` defines the intended desktop experience. `PRODUCT.md` is a compact product
translation and cannot override them. When these sources disagree, surface the conflict rather than
blending them. Design explorations remain evidence until an authority file adopts them.

## Boundaries

- Keep Drover product- and venture-agnostic. A customer or portfolio product may supply examples, but
  it does not redefine Drover.
- Founder-facing copy uses concrete business language and the founder's own words. Historical names
  such as `bet`, `fork`, `gtm-ide`, `channel`, and `~/.gtm-ide` remain compatibility seams until an
  intentional migration; do not promote them into product identity or required vocabulary.
- Preserve founder-only outward authority, venture isolation, cited product truth, and the founder's
  exclusive right to end active work.
- The shipped founder product is Electron desktop. The browser build is a development and
  deterministic-test harness; its explicit loopback development hatch does not define another
  production surface.

## Commands

| Intent | Command | Notes |
|---|---|---|
| Run desktop product | `npm run app` | Builds the UI, starts the local server, then launches Electron. |
| Run browser harness | `npm start` | Builds the UI, then serves it from `brain/src/server.mjs`. |
| Mechanical suite | `npm test` | Brain tests, UI unit tests, lint, then production build. |
| Complete readiness gate | `npm run test:acceptance` | Runs the local acceptance receipt used for release readiness. |
| Brain tests | `npm --prefix brain test` | Node test suite with serial execution. |
| UI unit tests | `npm --prefix ui run test:unit` | Vitest suite. |
| Browser journey | `npm run test:firm:browser` | Deterministic desktop firm journey. |
| MCP server | `npm run mcp` | Starts the agent-facing server. |
