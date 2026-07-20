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
  venture model and shared context. The Work → Product / GTM → Releases → Evidence loop is causal venture
  physics, never a required navigation sequence: a founder may enter anywhere. Conversation is primary in
  Work and contextual and closable in Product / GTM and Releases, where the canvas or release path owns the
  center. Closing contextual conversation never loses its draft, Thread identity, or last coherent content.
  Do not collapse this back to a thread-only shell, turn modes into lifecycle stages or separate authorities,
  or restore competing navigation roots.
- The workspace rail is mode-owned beneath one stable venture and mode switch. Work shows Threads; Product /
  GTM shows its scopes and selected path context; Releases shows Needs you, Preparing, In market, and Recent.
  Never display every list at once. Search stays within the current mode; do not add a global cross-mode
  result router.
- Work is the full agentic development environment: directing Claude/Codex, coding in isolated workspaces,
  inspecting previews/diffs/commands/tests, steering or comparing attempts, and applying exact changes. Its
  composer exposes repository/worktree context and real Claude/Codex model choice; those coding controls do
  not bleed into Product / GTM or Releases. Keep transcript and material separate: conversation carries
  intent, progress, and compact references; exact artifacts, code, and founder gates open beside it, and no
  empty workbench is reserved before repository work exists. Use native coding-client conversation geometry:
  compact right-aligned founder turns, unboxed agent output, one stable transcript scroll owner, and an
  anchored composer. Contextual agents in Product / GTM and Releases do not inherit that treatment. Work must
  compete with a native coding-agent client rather than reducing implementation to workflow status.
- Product / GTM is the spatial node-and-relationship workspace. It exposes how Product and market work connect
  and derives linked agent state directly from `WorkIndex`; it is not a workflow engine, second coding shell,
  or static ontology diagram. **System** is not a founder-facing mode or navigation noun. The current spatial
  composition is a hypothesis: do not add semantic-zoom capacity layers, method-promotion machinery, or
  reusable-capacity ontology until a real release-and-evidence loop proves the need.
- Releases is one connected path from Product delta through Customer consequence, Distribution, Outward
  action, and returned Evidence. It projects existing relationships, decisions, outcomes, and exact work;
  missing links remain visible and never become fabricated release content.
- Keep mode changes as simple as project/thread navigation in a native coding-agent client. Preserve the focal
  subject and open the nearest exact linked object, Thread, release, or evidence through existing direct
  references. When no destination link exists, retain the source context and show that missing link. Do not
  add a generalized context router, resolver, focus stack, cross-mode choreography, or workflow machinery.
- Founder-created semantic joins apply immediately and remain undoable. Agent-inferred joins remain visibly
  provisional until the founder adopts them; no broad auto-save rule may promote generated interpretation.
- Every new abstraction must remove more experience architecture than it adds. Prefer direct reference rules
  and feature-local projections over generalized context, navigation, activity, or workflow frameworks.
- Drover continuously develops Product and go-to-market as one evidence-returning system. Threads preserve
  founder direction; releases are the unit of market movement. Every meaningful Product change must raise
  an editable Product consequence and its distribution question. Other completed work surfaces only the GTM,
  evidence, or operational consequence its truth supports. Every meaningful market return must raise a
  Product or GTM consequence without fabricating an interpretation.

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
