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
  such as `bet`, `fork`, `gtm-ide`, the legacy `channel` workflow/storage record, and `~/.gtm-ide`
  remain compatibility seams until an intentional migration; do not promote them into product identity
  or required vocabulary. This does not prohibit the ordinary go-to-market role **channel**.
- Preserve founder-only outward authority, venture isolation, cited product truth, and the founder's
  exclusive right to end active work.
- Preserve the full native capability of the Claude and Codex SDKs. Drover owns venture context,
  visual projection, durable work, and founder authority; it must not force provider work through a
  custom planning or workflow layer that makes the underlying agents less capable.
- The shipped founder product is Electron desktop. The browser build is a development and
  deterministic-test harness; its explicit loopback development hatch does not define another
  production surface.
- The shipped shell has three parallel founder modes—Work, Product / GTM, and Releases—over one canonical
  venture model and shared context. Conversation is primary in Work and stays mounted as a contextual drawer
  elsewhere. Do not collapse this back to a thread-only shell, turn modes into lifecycle stages or separate
  authorities, or restore a competing workbench/dashboard/navigation root.
- Work is the full agentic development environment: directing Claude/Codex, coding in isolated workspaces,
  inspecting previews/diffs/commands/tests, steering or comparing attempts, and applying exact changes. It
  must compete with a native coding-agent client rather than reducing implementation to workflow status.
- Product / GTM is the spatial node-and-relationship workspace. It exposes how Product and market work connect,
  including executable workflows attached to the nodes they change; it is not a second coding shell or a
  static ontology diagram.
- Keep mode changes as simple as project/thread navigation in a native coding-agent client: preserve state and
  open linked context, but do not expose a focus stack, routing layer, cross-mode choreography, or workflow
  machinery merely to explain that Work, Product / GTM, and Releases share one model.
- Drover continuously develops Product and go-to-market as one evidence-returning system. Threads preserve
  founder direction; releases are the unit of market movement. Every meaningful Product change must raise
  its distribution question, and every meaningful market return must raise a Product or GTM consequence.

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
