# Drover

Drover is the firm described in `docs/FIRM-SPEC.md`: the operating system for one-person holding companies, entered through “vibe code your go-to-market.” `docs/STATE.md` is the dated source of truth for what is built and what remains unproven. The open-canvas and experiment-machine specs are historical inputs, not parallel directions. [comp: 2026-07]

Founder-facing language is ordinary language, not Drover's internal ontology. Prefer the founder's
own words and the concrete thing happening: **rewrite onboarding**, **contact these buyers**,
**launch this campaign**, **review what changed**, **see what happened**, **try another approach**.
Never require the founder to understand or use internal nouns such as **bet**, **motion**, **fork**,
**the wall**, **pipeline**, **stage**, or **work item**. Familiar words such as **campaign** are fine when they
describe the actual work rather than a product container. Preserve historical implementation
identifiers such as `bet`, `gtm-ide`, `channel`, and `~/.gtm-ide` until an intentional migration;
they are compatibility seams, not UI copy or product identity. [comp: 2026-07]

Drover is product-agnostic: features, copy, and examples speak for any product in a portfolio. Never frame a feature around one customer — LocalSeoData/LSD is an example that flows through Drover, not what Drover is.

Drover is a desktop founder workbench built around an infinite-canvas node editor; phone/tablet is not a target. Build and judge at desktop only — don't audit, design for, or weigh mobile responsiveness. Use 1920×1080 as the primary design, ship-evidence, scoring, and recording viewport; smaller desktop sizes are resilience checks, not the source of visual truth. This is a deliberate stance, not an unfinished edge.

The canvas exists to make Drover's work visible and explorable, including how concrete product and
market actions relate—not just their status. Depth is a feature: the surface should feel deep and
complex, while chat stays the easy handle that drives it. The signature moment is a plain-words ask
("help this venture grow") immediately materializing a complete, editable working theory on the
canvas: who it may help, how value happens, several ways to reach people, the first campaigns, and
useful inward work already beginning. This first theory is visibly provisional and changes as real
work and evidence return. It is not a giant plan or approval form; only an act that would touch the
world, deploy, or spend waits for the founder's hand. Founder-stated 2026-07-15; design toward this,
not toward a calm minimal status board or an ontology the founder must administer.

Specs, prototypes, and shareable artifacts must stand on their own outside the conversation that
produced them. Orient a new reader to what Drover is, who it serves, the current problem, the proposed
change, and the concrete founder experience before using project-specific concepts. Distinguish what
is built today, what is proposed next, and what remains unproven. [comp: 2026-07]

Division of labor, founder-stated 2026-07-15: Codex writes the production code; Claude sessions deliver design direction and executable specs under `docs/design/` and do not edit production code unless the founder asks.

## Commands

| Intent | Command | Notes |
|---|---|---|
| Start locally | `npm start` | Builds the UI, then serves the app from `brain/src/server.mjs`. |
| Full verification | `npm test` | Brain tests, UI unit tests, lint, then production build. |
| Brain tests | `npm --prefix brain test` | Node test suite with serial execution. |
| UI unit tests | `npm --prefix ui run test:unit` | Vitest suite. |
| Browser journey | `npm run test:firm:browser` | Deterministic desktop firm journey. |
| MCP server | `npm run mcp` | Starts the agent-facing server. |
