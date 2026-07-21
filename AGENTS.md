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
- When opening, restarting, or verifying Electron, a live process and healthy Brain are insufficient
  proof. Confirm that the BrowserWindow loaded and became visible; an invisible or transparent renderer
  is a failed launch even when its API is healthy.
- The shipped shell has two founder surfaces—Work and Product / GTM—over one canonical venture model and
  shared context. Releases is a distinct, collapsible section within Product / GTM, never a competing
  top-level mode. The Work → Product / GTM → Releases → Evidence loop is causal venture
  physics, never a required navigation sequence: a founder may enter anywhere. Conversation is primary in
  Work and contextual and closable in Product / GTM, where the canvas or release path owns the
  center. Closing contextual conversation never loses its draft, Thread identity, or last coherent content.
  Do not collapse this back to a thread-only shell, turn modes into lifecycle stages or separate authorities,
  or restore competing navigation roots.
- The workspace rail is surface-owned beneath one stable venture and surface switch. Work shows Threads;
  Product / GTM supplies agents, connected capabilities, and surface-local search to its conditional-logic
  canvas. Its collapsible Releases section shows Needs you, Preparing, In market, and Recent beside the
  selected full release workspace. Do not repeat the canvas title or a raw object count as a rail destination;
  Product / GTM rail space begins with actionable agents, capabilities, releases, or search results.
  Never display every list at once. Search stays within the current mode; do not add a global cross-mode
  result router.
- Work is the full agentic development environment: directing Claude/Codex, coding in isolated workspaces,
  inspecting previews/diffs/commands/tests, steering or comparing attempts, and applying exact changes. Its
  composer exposes an explicit in-chat participation switch. Code mode exposes repository/worktree context and
  real Claude/Codex model choice; the selected SDK model is the agent the founder talks to, with no Drover-created
  persona or automatic router inserted between them. Product / GTM mode keeps the same Thread and transcript but
  directs Drover agents to ideate workflows, branches, founder gates, capabilities, and evidence loops; it hides
  SDK coding controls and uses the restrained spectrum treatment to make the authority change unmistakable. The
  participant indicator slides between modes, newly active controls arrive directionally, and submission briefly
  carries the founder's readable prompt toward the transcript in the active participant's visual language. In an
  existing Thread, that prompt must become an immediate founder turn in the same transcript while the durable reply
  request is pending; never clear the composer into a visually empty wait or switch Threads to fake continuity. Those
  coding controls do
  not bleed into Product / GTM or its Releases section. Keep transcript and material separate: conversation carries
  intent, progress, and compact references; exact artifacts, code, and founder gates open beside it, and no
  empty workbench is reserved before repository work exists. Live status may expand into a compact factual activity
  log of safe tool steps, sources consulted, exact questions, and measured durations. Never expose hidden
  chain-of-thought or raw unshaped model prose as activity. Use native coding-client conversation geometry:
  compact right-aligned founder turns, unboxed agent output, one stable transcript scroll owner, and an
  anchored composer. Contextual agents in Product / GTM, including Releases, do not inherit that treatment. Work must
  compete with a native coding-agent client rather than reducing implementation to workflow status. Outside
  Work, contextual conversation is a compact composer over the owning canvas/path, not a framed mini-Thread;
  clear contextual questions answer there through the SDK, while substantive work follows the exact returned
  Thread into Work automatically. Every exact item opened beside Work—artifact, comparison, evidence, consequence,
  or code review—uses one coherent review workspace. Non-HTML Product / GTM output must still feel like an intentional
  visual HTML artifact: project its exact content into a hero, section bands, structured tiles, comparisons, or action
  panels that fit the material. A typeset memo, raw prose wall, or generic nested card is not sufficient. The exact
  question or founder decision remains visible at the point of action rather than hiding behind machinery disclosure.
- Product / GTM is an advanced spatial node-and-relationship editor. It should feel like operating dense
  conditional logic: triggers, branches, loops, gates, agents, capabilities, and evidence paths remain
  directly manipulable and visually causal. It exposes how Product and market work connect and derives linked
  agent state directly from `WorkIndex`; it is not a second coding shell or static ontology diagram. Do not
  simplify it into cards, lists, forms, or a passive overview. **System** is not a founder-facing mode or
  navigation noun. Semantic-zoom capacity layers, method-promotion machinery, and reusable-capacity ontology
  still require proof from a real release-and-evidence loop. The primary creation path begins in natural
  Product / GTM conversation: substantive direction opens an exact Work Thread whose provisional graph stays
  pinned above its composer. Corrections revise that same staged graph. Only explicit founder adoption makes
  it canonical and opens it on the full Product / GTM canvas; staged graphs are never parallel truth.
- Releases uses the same spatial canvas language for one exact release. Product delta, Customer consequence,
  Distribution, Outward action, returned Evidence, conditional branches, founder gates, and live return paths
  form a manipulable release graph rather than a stacked record editor. It projects existing relationships,
  decisions, outcomes, and exact work; missing links remain visible and never become fabricated release content.
  Treat it as the founder's market-return surface: before chrome or configuration, answer what is moving, what
  reality returned, and what judgment only the founder must supply.
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
