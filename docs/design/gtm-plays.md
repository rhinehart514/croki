# Ambitious GTM plays

## Product contract

GTM is a system of ambitious node workflows on the existing Product / GTM canvas. A play is an executable
theory of market movement, not a small automation, campaign form, strategy bubble, or separate workspace.
Product objects remain dependencies and consequences around the play. Founder authority, exact outward acts,
and evidence returns stay visible on the nodes where they occur.

## Screens touched

- Product / GTM navigator: names plays directly, distinguishes drafted from established, and opens talk-first
  authoring through the contextual agent composer.
- Product / GTM canvas: unfolds a selected play at full length and readable scale.
- Work workflow artifact: adoption creates a drafted play; running evidence is required before establishment.

## Hierarchy and interaction

The selected play is the center. Its owner and first three operating steps form the opening frame. The founder
pans right through the full sequence; selecting a later step centers that exact node without collapsing or
summarizing the workflow. Step labels remain compact pills; descriptions and corrections open in place or in the
originating exact Work Thread.

Supported step kinds are trigger, source, agent work, tool, condition, wait, founder decision, founder gate,
outward action, observation, and outcome. Directed edges carry branches and forward motion; backward edges are
visible return loops. Unsupported or unproven execution remains absent.

## Visual hand

- Room: `#0b0f15`, `#10141b`, `#252c37`.
- Focus: `#5b8cff`.
- GTM execution: `#72ac9f`.
- Founder authority: `#e2a84a`.
- Operating face: DM Sans. Exact state and step position: JetBrains Mono.
- Composition: full-length left-to-right operational score.
- Signature element: the complete play stays spatially legible instead of being compressed into chapters.

## Verification

- `npm --prefix ui run test:unit -- --run src/components/product-gtm/productGtmProjection.test.ts src/components/product-gtm/ProductGtmNavigator.test.tsx src/components/product-gtm/ProductGtmSurface.test.tsx src/components/work-mode/workflowSketch.test.ts`
- `npm --prefix ui run lint`
- `npm --prefix ui run build`
- `npm --prefix brain test -- --runInBand`
- `node --test test/browser/dense-journey.mjs`
- Electron must load a visible `Drover` BrowserWindow after `npm run app`.
