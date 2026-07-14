# Drover

Drover is the firm described in `docs/FIRM-SPEC.md`: the operating system for one-person holding companies, entered through “vibe code your go-to-market.” `docs/STATE.md` is the dated source of truth for what is built and what remains unproven. The open-canvas and experiment-machine specs are historical inputs, not parallel directions. [comp: 2026-07]

Founder-facing language says **Drover**, **venture**, **teammate**, **bet**, **outcome**, **fork**, and **the wall**. Use **pipeline** only for historical compatibility or when a founder names one. Preserve historical implementation identifiers such as `gtm-ide`, `channel`, and `~/.gtm-ide`; they are intentional, not incidental cleanup. [comp: 2026-07]

Drover is product-agnostic: features, copy, and examples speak for any product in a portfolio. Never frame a feature around one customer — LocalSeoData/LSD is an example that flows through Drover, not what Drover is.

Drover is a desktop founder workbench built around an infinite-canvas node editor; phone/tablet is not a target. Build and judge at desktop only — don't audit, design for, or weigh mobile responsiveness. This is a deliberate stance, not an unfinished edge.

## Commands

| Intent | Command | Notes |
|---|---|---|
| Start locally | `npm start` | Builds the UI, then serves the app from `brain/src/server.mjs`. |
| Full verification | `npm test` | Brain tests, UI unit tests, lint, then production build. |
| Brain tests | `npm --prefix brain test` | Node test suite with serial execution. |
| UI unit tests | `npm --prefix ui run test:unit` | Vitest suite. |
| Browser journey | `npm run test:firm:browser` | Deterministic desktop firm journey. |
| MCP server | `npm run mcp` | Starts the agent-facing server. |
