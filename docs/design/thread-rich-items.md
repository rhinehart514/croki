# Thread rich items

Status: built and visually verified 2026-07-19.

## Scope and hierarchy

The thread conversation's artifact, comparison, evidence, and consequence projections are compact work
products, not nested database cards. The header puts the work title and its truthful open action first. The
produced material is edge-to-edge in the body. Provenance appears only when recorded; missing owner or
verification fields do not manufacture a warning. Evidence with no source detail collapses to a quiet,
honest unavailable state.

The full visual remains the exact artifact. Inline text projections may elide a leading generic `PREVIEW`
or `ARTIFACT` wrapper because the surrounding projection already supplies that context.

## Grounding and implementation

- Existing product authority: `DESIGN.md` rich conversation grammar and visual language.
- Shipped reference: [Manus task-and-artifact split](https://mobbin.com/flows/153b7f2d-db6c-4ee0-a703-e322d3e453dc), already adopted by `PRODUCTION-UX-PLAN.md`; it supports keeping steering and the artifact adjacent, not copying task-manager chrome.
- Components: `ui/src/components/thread/RichThreadItems.tsx` and `thread-shell.css`.
- Existing primitives: semantic `button`, `ArtifactPreview`, `FilesChanged`, and the visual-stage registry.
- No layer specialist was needed; the change spans hierarchy, component states, copy, and density as one
  small conversation-surface refinement.

## Verification

- Live browser render: `http://127.0.0.1:4317` against the seeded Buffalo Projects first-run thread.
- Pixel receipt: `output/playwright/rich-cards-final.png`.
- `npm --prefix ui run test:unit`
- `npm --prefix ui run lint`
- `npm --prefix ui run build`
- `npm run test:firm:browser`

The next discriminating check is repeated use with real image, HTML, long-text, diff, and multi-record evidence
payloads; the current render proves the representative text artifact and sparse evidence states.
