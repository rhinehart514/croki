# Drover

Drover is the experiment machine described in `docs/EXPERIMENT-MACHINE-SPEC.md`, built on the open-canvas contract in `docs/OPEN-CANVAS-SPEC.md`. `docs/STATE.md` is the dated source of truth for what is built and what remains unproven.

Founder-facing language says **Drover** and **pipeline**. Preserve historical implementation identifiers such as `gtm-ide`, `channel`, and `~/.gtm-ide`; they are intentional, not incidental cleanup.

Drover is product-agnostic: features, copy, and examples speak for any product in a portfolio. Never frame a feature around one customer — LocalSeoData/LSD is an example that flows through Drover, not what Drover is.

## Commands

| Intent | Command | Notes |
|---|---|---|
| Start locally | `npm start` | Builds the UI, then serves the app from `brain/src/server.mjs`. |
| Full verification | `npm test` | Brain tests, UI unit tests, lint, then production build. |
| Brain tests | `npm --prefix brain test` | Node test suite with serial execution. |
| UI unit tests | `npm --prefix ui run test:unit` | Vitest suite. |
| Browser journey | `npm run test:terrain:browser` | Deterministic terrain journey. |
| MCP server | `npm run mcp` | Starts the agent-facing server. |
